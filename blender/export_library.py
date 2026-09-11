"""Supervise a guarded Blender export; publish a strict receipt only after process exit."""

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

CODE = Path(__file__).resolve().parent
sys.path.insert(0, str(CODE))
import export_receipt as strict

IDENTITY = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
PROFILE = json.loads((CODE / "render_profile.json").read_text())
SETTINGS = PROFILE["exportSettings"]
read_document = strict.read_document
scalar_times = strict.scalar_times


def initialize_blender():
    global bpy, builder, r2, AXIS
    import bpy
    from mathutils import Matrix
    module = importlib.util.spec_from_file_location("cs3_builder", CODE / "build_library.py")
    builder = importlib.util.module_from_spec(module)
    module.loader.exec_module(builder)
    module = importlib.util.spec_from_file_location("r2_export", CODE.parent / "probes/r2/export_sample.py")
    r2 = importlib.util.module_from_spec(module)
    module.loader.exec_module(r2)
    AXIS = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))


def activate(name, authoring):
    builder.activate_clip(authoring, name)


def vertex_attributes(objects):
    positions, surfaces, triangles = {}, {}, {}
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        if not mesh or not mesh.vertices:
            raise ValueError(f"EMPTY_EVALUATED_GEOMETRY: {obj.name}")
        positions[obj.name] = [list(AXIS @ v.co) for v in mesh.vertices]
        if mesh.uv_layers.active is None:
            raise ValueError(f"SOURCE_UV_MISSING: {obj.name}")
        uv = mesh.uv_layers.active.data
        surfaces[obj.name] = [positions[obj.name][loop.vertex_index]
                              + [uv[index].uv.x, 1-uv[index].uv.y]
                              for index,loop in enumerate(mesh.loops)]
        mesh.calc_loop_triangles()
        triangles[obj.name] = [[surfaces[obj.name][index] for index in triangle.loops]
                               for triangle in mesh.loop_triangles]
        evaluated.to_mesh_clear()
    return positions, surfaces, triangles


def envelope(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        if obj.type == "MESH":
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh()
            points.extend(AXIS @ (evaluated.matrix_world @ v.co) for v in mesh.vertices)
            evaluated.to_mesh_clear()
    if not points:
        raise ValueError("EMPTY_ASSET")
    return [[min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)]]


def within(observed, allowed, name):
    for axis in range(3):
        if (not all(math.isfinite(row[axis]) for row in observed)
                or observed[0][axis] < allowed[0][axis]-2e-4
                or observed[1][axis] > allowed[1][axis]+2e-4):
            raise ValueError(f"SWEPT_BOUNDS: {name}: {observed}")


def export_asset(spec, asset, authoring, output, texture):
    activate(None, authoring)
    root = bpy.data.objects.get(asset["root"])
    if root is None or root.parent or root.animation_data:
        raise ValueError(f"DECLARED_ROOT: {asset['root']}")
    objects = [root, *sorted(root.children_recursive, key=lambda n: n.name)]
    rest = r2.inventory(objects)
    if rest[root.name]["matrix_world"] != IDENTITY:
        raise ValueError("IDENTITY_ROOT")
    for obj in objects:
        if any(abs(n-1) > 1e-6 for n in obj.scale) or obj.constraints or obj.modifiers:
            raise ValueError(f"RIGID_UNIT_SCALE: {obj.name}")
    measured = envelope(objects)
    within(measured, asset["restBounds"], asset["id"])
    local_vertices, vertex_uvs, triangle_uvs = vertex_attributes(objects)
    clips = []
    for clip in asset["clips"]:
        activate(clip["name"], authoring)
        samples = []
        fps, fps_base = bpy.context.scene.render.fps, bpy.context.scene.render.fps_base
        if fps != clip["fps"] or fps_base != clip["fpsBase"]:
            raise ValueError("SOURCE_FPS")
        first, last = clip["frames"]
        for half in range((last-first)*2+1):
            frame = first+half/2
            bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
            measured_sample = envelope(objects)
            within(measured_sample, asset["animatedBounds"], f"{asset['id']}/{clip['name']}/{frame}")
            samples.append({"frame": frame, "time": (frame-first)*fps_base/fps, "objects": r2.inventory(objects),
                            "bounds": {"min": dict(zip("xyz", measured_sample[0])),
                                       "max": dict(zip("xyz", measured_sample[1]))}})
        clips.append({**clip, "fps": fps, "fpsBase": fps_base,
                      "duration": (last-first)*fps_base/fps, "samples": samples})
    activate(None, authoring)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    file = output / f"{asset['id']}.glb"
    status = bpy.ops.export_scene.gltf(filepath=str(file), **SETTINGS)
    if status != {"FINISHED"} or not file.is_file() or file.stat().st_size == 0:
        raise RuntimeError(f"EXPORT_MISSING: {asset['id']}")
    document, binary = read_document(file)
    nodes = {n["name"]: i for i, n in enumerate(document["nodes"])}
    if len(nodes) != len(document["nodes"]) or set(nodes) != set(rest):
        raise ValueError(f"EXPORTED_NODE_IDENTITY: {asset['id']}")
    if len(document["scenes"]) != 1 or document["scenes"][0]["nodes"] != [nodes[root.name]]:
        raise ValueError("EXPORTED_SCENE_ROOT")
    animations = document.get("animations", [])
    if {a["name"] for a in animations} != {c["name"] for c in clips} or len(animations) != len(clips):
        raise ValueError(f"EXPORTED_CLIPS: {[a['name'] for a in animations]}")
    for clip in clips:
        animation = next(a for a in animations if a["name"] == clip["name"])
        times = [t for sampler in animation["samplers"]
                 for t in scalar_times(document, binary, sampler["input"])]
        if min(times) != 0 or abs(max(times)-clip["duration"]) > 1e-5:
            raise ValueError(f"EXPORTED_DURATION: {clip['name']}: {min(times)}..{max(times)}")
        tracks = [{"node": channel["target"]["node"], "path": channel["target"]["path"]}
                  for channel in animation["channels"]]
        if {t["node"] for t in tracks} != {nodes[n] for n in authoring["animatedNodes"]}:
            raise ValueError(f"EXPORTED_TRACK_TARGET: {clip['name']}")
        if any(t["node"] == nodes[root.name] or t["path"] not in ("translation", "rotation", "scale")
               for t in tracks):
            raise ValueError("ROOT_MOTION_OR_UNSUPPORTED_TRACK")
        clip["tracks"] = tracks
    activate(None, authoring)
    return {
        "kind": "cs3-library-asset", "id": asset["id"], "file": file.name,
        "sha256": builder.checksum(file), "bytes": file.stat().st_size,
        "root": root.name, "rootNode": nodes[root.name], "sceneIndex": 0,
        "nodes": [{"id": name, "index": index,
                   "parent": nodes[rest[name]["parent"]] if rest[name]["parent"] else None,
                   "materials": rest[name]["materials"],
                   **({"triangles": rest[name]["triangles"]} if "triangles" in rest[name] else {})}
                  for name, index in sorted(nodes.items())],
        "units": "meters", "up": "Y", "handedness": "right", "front": "+Z", "pivot": "floor-center",
        "rootPosition": {"x": 0, "y": 0, "z": 0}, "rootYaw": 0, "rootScale": {"x": 1, "y": 1, "z": 1},
        "restBounds": {"min": dict(zip(("x","y","z"), measured[0])),
                       "max": dict(zip(("x","y","z"), measured[1]))},
        "animatedBounds": {"min": dict(zip(("x","y","z"), asset["animatedBounds"][0])),
                           "max": dict(zip(("x","y","z"), asset["animatedBounds"][1]))},
        "geometry": {"meshes": len(local_vertices), "primitives": sum(len(n["materials"]) for n in rest.values()),
                     "triangles": sum(n.get("triangles", 0) for n in rest.values()),
                     "vertices": local_vertices, "vertexUvs": vertex_uvs, "triangleUvs": triangle_uvs},
        "rest": rest, "clips": clips, "materials": r2.material_records(objects),
        "textures": [texture], "allowedExtensions": [],
        "permissions": {"publicAssetApproved": True, **spec["provenance"]},
    }


def texture_record(spec, source_directory):
    file = source_directory / f"{spec['texture']['name']}.png"
    if file.read_bytes() != builder.palette_png(spec):
        raise ValueError("SOURCE_TEXTURE")
    pixels = builder.atlas_pixels(spec)
    return {**spec["texture"], "sourceSha256": builder.checksum(file),
            "pixelFormat": "RGBA8", "pixelOrigin": "top-left",
            "pixelSha256": hashlib.sha256(pixels).hexdigest()}


def committed_input(path, revision, expected):
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ValueError("EXACT_COMMIT_REQUIRED")
    object_type = subprocess.run(["git", "-C", str(CODE.parent), "cat-file", "-t", revision],
                                 check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 text=True).stdout.strip()
    if object_type != "commit":
        raise ValueError("EXACT_COMMIT_REQUIRED")
    data = subprocess.run(["git", "-C", str(CODE.parent), "show", f"{revision}:{strict.safe_path(path)}"],
                          check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
    if strict.checksum(data) != expected:
        raise ValueError(f"COMMITTED_INPUT_CHANGED: {path}")


def effective_settings():
    values = {}
    # Record scalar defaults from the installed operator, not a guessed version's defaults.
    for prop in bpy.ops.export_scene.gltf.get_rna_type().properties:
        name = prop.identifier
        if name == "rna_type" or prop.type in ("POINTER", "COLLECTION"):
            continue
        if getattr(prop, "is_array", False):
            value = list(prop.default_array)
        elif prop.type == "ENUM" and prop.is_enum_flag:
            value = sorted(prop.default_flag)
        else:
            value = prop.default
        values[name] = value
    missing = set(SETTINGS) - set(values)
    if missing:
        raise ValueError(f"EXPORTER_SETTINGS_UNSUPPORTED: {sorted(missing)}")
    values.update(SETTINGS)
    # These are output locations, not byte-influencing settings or public input paths.
    for name in ("filepath", "directory", "filename"):
        values.pop(name, None)
    return values


def main(source, expected, output, source_commit, exporter_revision, node):
    initialize_blender()
    if builder.checksum(source) != expected:
        raise ValueError("SOURCE_IDENTITY")
    if (not os.environ.get("CS3_JOB_ROOT") or source.parent.parent != CODE.parent / ".artifacts/assets"
            or output.parent != source.parent or output == source or source.name != "library.blend"):
        raise ValueError("OWNED_COPY_REQUIRED")
    spec_file = CODE / "asset_spec.json"
    spec = json.loads(spec_file.read_text())
    builder.validate_spec(spec)
    authoring = json.loads(source.with_name("authoring.json").read_text())
    if not authoring["complete"] or authoring["sourceSha256"] != expected:
        raise ValueError("AUTHORING_IDENTITY")
    required_authoring = {
        "CS3-Atlas.png", "blender/asset_spec.json", "blender/atlas.py", "blender/build_library.py",
        "blender/equipment.py", "blender/profiles.py", "blender/technician.py",
    }
    if set(authoring["inputs"]) != required_authoring:
        raise ValueError("AUTHORING_INPUT_INVENTORY")
    inputs, input_files = [], {}
    for name, digest in authoring["inputs"].items():
        strict.safe_path(name)
        file = source.parent / name if name == f"{spec['texture']['name']}.png" else CODE.parent / name
        if builder.checksum(file) != digest:
            raise ValueError(f"AUTHORING_INPUT_CHANGED: {name}")
        role = "texture" if file.suffix == ".png" else "specification" if file == spec_file else "script"
        public_path = f"source/{file.name}" if role == "texture" else name
        inputs.append(strict.file_record(file, public_path, role))
        input_files[public_path] = file
        if role != "texture":
            committed_input(name, source_commit, digest)
    for name, role in [
        ("blender/export_library.py", "exporter"), ("blender/export_receipt.py", "script"),
        ("blender/render_profile.json", "script"), ("probes/r2/export_sample.py", "script"),
        ("tools/export-receipt.ts", "script"), ("tools/promote-assets.ts", "script"),
        ("tools/assets/contracts.ts", "script"), ("tools/assets/store.ts", "script"),
        ("src/assets/contracts.ts", "script"), ("package.json", "script"), ("package-lock.json", "script"),
    ]:
        file = CODE.parent / name
        record = strict.file_record(file, name, role)
        committed_input(name, exporter_revision, record["sha256"])
        inputs.append(record)
        input_files[name] = file
    sidecar = source.with_name("authoring.json")
    inputs.append(strict.file_record(sidecar, "source/authoring.json", "script"))
    input_files["source/authoring.json"] = sidecar
    source_record = {**strict.file_record(source, "source/library.blend"), "commit": source_commit}
    node_version = subprocess.run([node, "-p", "process.versions.node"], check=True,
                                  capture_output=True, text=True).stdout.strip()
    if not output.is_dir() or (output / "owned.blend").exists():
        raise ValueError("FRESH_SUPERVISED_OUTPUT_REQUIRED")
    candidate = output / "candidate"
    candidate.mkdir()
    owned = output / "owned.blend"
    shutil.copyfile(source, owned)
    bpy.ops.wm.open_mainfile(filepath=str(owned), use_scripts=False)
    if bpy.context.scene.unit_settings.scale_length != 1:
        raise ValueError("SOURCE_UNITS")
    color = PROFILE["color"]["blender"]
    scene = bpy.context.scene
    if (scene.view_settings.view_transform != color["viewTransform"]
            or scene.view_settings.look != color["look"] or scene.view_settings.exposure != color["exposure"]
            or scene.view_settings.gamma != color["gamma"] or scene.display_settings.display_device != color["display"]
            or scene.render.fps != 30 or scene.render.fps_base != 1):
        raise ValueError("SOURCE_RENDER_PROFILE")
    defaults = effective_settings()
    import io_scene_gltf2
    exporter_version = ".".join(str(n) for n in io_scene_gltf2.bl_info["version"])
    result = {
        "schema": 1, "kind": "cs3-library-export", "complete": False,
        "sourceSha256": expected, "authoringReceiptSha256": builder.checksum(source.with_name("authoring.json")),
        "inputs": {**authoring["inputs"], "blender/export_library.py": builder.checksum(__file__),
                   "probes/r2/export_sample.py": builder.checksum(CODE.parent / "probes/r2/export_sample.py")},
        "specification": spec, "blender": bpy.app.version_string, "blenderBuild": bpy.app.build_hash.decode(),
        "profile": spec["profile"], "settings": SETTINGS, "effectiveSettings": defaults, "assets": [],
    }
    texture = texture_record(spec, source.parent)
    for asset in spec["assets"]:
        result["assets"].append(export_asset(spec, asset, authoring, candidate, texture))
    if builder.checksum(source) != expected or builder.checksum(owned) != expected:
        raise ValueError("SOURCE_MUTATED")
    result["complete"] = True
    builder.write_json(output / "technical.json", result)
    inputs.append(strict.file_record(output / "technical.json", "technical.json", "script"))
    documents = {a["id"]: read_document(candidate / a["file"]) for a in result["assets"]}
    for document, _ in documents.values():
        if document["asset"]["generator"] != f"Khronos glTF Blender I/O v{exporter_version}":
            raise ValueError("GLTF_EXPORTER_VERSION")
    for item in inputs:
        if item["path"] in input_files and strict.file_record(input_files[item["path"]], item["path"], item["role"]) != item:
            raise ValueError(f"EXPORT_INPUT_MUTATED: {item['path']}")
    builder.write_json(output / "export.pending.json", {
        "kind": "cs3-export-pending", "source": source_record, "inputs": inputs, "profile": PROFILE,
        "tools": {"node": node_version, "blender": bpy.app.version_string, "blenderBuild": bpy.app.build_hash.decode(),
                  "gltfExporter": exporter_version},
        "exporter": {"path": "blender/export_library.py", "sha256": builder.checksum(__file__),
                     "revision": exporter_revision},
    })
    print(json.dumps({"complete": True, "assets": [
        {"id": a["id"], "bytes": a["bytes"], "nodes": len(a["nodes"]),
         "clips": [c["name"] for c in a["clips"]]} for a in result["assets"]]}))


def finish_export(output, exit_code, node):
    strict.require(type(exit_code) is int and exit_code == 0, f"EXPORTER_FAILED: {exit_code}")
    pending_file = output / "export.pending.json"
    strict.require(pending_file.is_file() and not pending_file.is_symlink(), "EXPORTER_OUTPUT_MISSING")
    pending = json.loads(pending_file.read_text())
    strict.require(pending["kind"] == "cs3-export-pending", "EXPORTER_OUTPUT_KIND")
    process_record = json.loads((output / "process.json").read_text())
    strict.require(process_record["exitCode"] == exit_code
                   and process_record["sourceSha256"] == pending["source"]["sha256"]
                   and process_record["sourceCommit"] == pending["source"]["commit"]
                   and process_record["exporterRevision"] == pending["exporter"]["revision"], "EXPORTER_PROCESS_IDENTITY")
    for item in pending["inputs"]:
        name = strict.safe_path(item["path"])
        file = (output.parent / name.removeprefix("source/") if name.startswith("source/")
                else output / name if name == "technical.json" else CODE.parent / name)
        strict.require(not file.is_symlink() and strict.file_record(file, name, item["role"]) == item,
                       f"EXPORT_INPUT_MUTATED: {name}")
    source = pending["source"]
    strict.require(strict.file_record(output.parent / "library.blend", source["path"])
                   == {k: source[k] for k in ("path", "sha256", "bytes")}, "SOURCE_MUTATED")
    strict.require(strict.checksum((output / "owned.blend").read_bytes()) == source["sha256"], "SOURCE_MUTATED")
    technical_file = output / "technical.json"
    technical = json.loads(technical_file.read_text())
    generated_inputs = [strict.file_record(output / "process.json", "process.json", "script"),
                        strict.file_record(pending_file, "export.pending.json", "script")]
    documents = {}
    for asset in technical["assets"]:
        file = output / "candidate" / strict.safe_path(asset["file"])
        record = strict.file_record(file, asset["file"])
        strict.require(record["sha256"] == asset["sha256"] and record["bytes"] == asset["bytes"], "EXPORTER_OUTPUT_CHANGED")
        documents[asset["id"]] = read_document(file)
    initial_inputs = pending["inputs"] + generated_inputs
    provisional = strict.build_receipt(technical, documents, source, initial_inputs, pending["profile"],
                                       pending["tools"], {**pending["exporter"], "exitCode": exit_code})
    technical["strictSpecificationSha256"] = provisional["specificationSha256"]
    builder.write_json(technical_file, technical)
    inputs = [
        strict.file_record(technical_file, "technical.json", "script") if item["path"] == "technical.json" else item
        for item in pending["inputs"]
    ] + generated_inputs
    receipt = strict.build_receipt(technical, documents, source, inputs, pending["profile"], pending["tools"],
                                   {**pending["exporter"], "exitCode": exit_code})
    strict.require(receipt["specificationSha256"] == provisional["specificationSha256"],
                   "TECHNICAL_SPECIFICATION")
    subprocess.run([node, "--experimental-strip-types", str(CODE.parent / "tools/export-receipt.ts"), str(output)],
                   input=strict.canonical_json(receipt), text=True, check=True)


def validate_job_paths(source, expected, output):
    strict.require(bool(os.environ.get("CS3_JOB_ROOT"))
                   and source.parent.parent == CODE.parent / ".artifacts/assets"
                   and output.parent == source.parent and output != source and source.name == "library.blend",
                   "OWNED_COPY_REQUIRED")
    strict.require(strict.checksum(source.read_bytes()) == expected, "SOURCE_IDENTITY")


def supervise(source, expected, output, source_commit, exporter_revision, node, blender):
    validate_job_paths(source, expected, output)
    for revision in (source_commit, exporter_revision):
        strict.require(re.fullmatch(r"[a-f0-9]{40}", revision) is not None, "EXACT_COMMIT_REQUIRED")
    output.mkdir(exist_ok=False)
    command = [
        blender, "--background", "--factory-startup", "--python-exit-code", "1", "--python", str(Path(__file__).resolve()),
        "--", "--worker", "--source", str(source), "--sha256", expected, "--output", str(output),
        "--source-commit", source_commit, "--exporter-revision", exporter_revision, "--node", node,
    ]
    with (output / "blender.stdout.log").open("xb") as stdout, (output / "blender.stderr.log").open("xb") as stderr:
        process = subprocess.run(command, stdout=stdout, stderr=stderr, check=False)
    process_record = {"schema": 1, "kind": "cs3-export-process", "exitCode": process.returncode,
                      "sourceSha256": expected, "sourceCommit": source_commit, "exporterRevision": exporter_revision}
    (output / "process.json").write_text(strict.canonical_json(process_record) + "\n")
    finish_export(output, process.returncode, node)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--exporter-revision", required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--blender")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else None)
    if args.worker:
        main(args.source.resolve(), args.sha256, args.output.resolve(), args.source_commit, args.exporter_revision, args.node)
    else:
        if not args.blender:
            parser.error("--blender is required for the guarded supervisor; direct Blender calls are pending-only")
        supervise(args.source.resolve(), args.sha256, args.output.resolve(),
                  args.source_commit, args.exporter_revision, args.node, args.blender)
