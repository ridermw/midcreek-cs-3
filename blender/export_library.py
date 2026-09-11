"""Export a guarded owned copy and retain source declarations for real-loader checks."""

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import struct
import sys

import bpy
from mathutils import Matrix

CODE = Path(__file__).resolve().parent
module = importlib.util.spec_from_file_location("cs3_builder", CODE / "build_library.py")
builder = importlib.util.module_from_spec(module)
module.loader.exec_module(builder)
module = importlib.util.spec_from_file_location("r2_export", CODE.parent / "probes/r2/export_sample.py")
r2 = importlib.util.module_from_spec(module)
module.loader.exec_module(r2)

AXIS = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))
IDENTITY = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
SETTINGS = {
    "export_format": "GLB", "use_selection": True, "export_yup": True, "export_apply": True,
    "export_cameras": False, "export_lights": False, "export_extras": False,
    "export_animations": True, "export_animation_mode": "ACTIONS",
    "export_merge_animation": "NLA_TRACK", "export_frame_range": False,
    "export_frame_step": 1, "export_force_sampling": True, "export_anim_slide_to_zero": True,
    "export_optimize_animation_size": False, "export_optimize_animation_keep_anim_object": True,
    "export_morph": False, "export_skins": False, "export_image_format": "AUTO",
    "will_save_settings": False,
}


def activate(name, authoring):
    builder.activate_clip(authoring, name)


def vertices(objects):
    result = {}
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        if not mesh or not mesh.vertices:
            raise ValueError(f"EMPTY_EVALUATED_GEOMETRY: {obj.name}")
        result[obj.name] = [list(AXIS @ v.co) for v in mesh.vertices]
        evaluated.to_mesh_clear()
    return result


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


def read_document(file):
    data = file.read_bytes()
    if len(data) < 28 or data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise ValueError("GLB_HEADER")
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20+length])
    binary = data[28+length:]
    return document, binary


def scalar_times(document, binary, index):
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    if accessor["componentType"] != 5126 or accessor["type"] != "SCALAR":
        raise ValueError("ANIMATION_TIME_ACCESSOR")
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<f", binary, offset+i*view.get("byteStride", 4))[0]
            for i in range(accessor["count"])]


def export_asset(spec, asset, authoring, output):
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
    local_vertices = vertices(objects)
    clips = []
    for clip in asset["clips"]:
        activate(clip["name"], authoring)
        samples = []
        for half in range((clip["frames"][1]-1)*2+1):
            frame = 1+half/2
            bpy.context.scene.frame_set(int(frame), subframe=frame % 1)
            within(envelope(objects), asset["animatedBounds"], f"{asset['id']}/{clip['name']}/{frame}")
            samples.append({"frame": frame, "time": (frame-1)/30, "objects": r2.inventory(objects)})
        clips.append({**clip, "duration": (clip["frames"][1]-clip["frames"][0])/30, "samples": samples})
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
                     "triangles": sum(n.get("triangles", 0) for n in rest.values()), "vertices": local_vertices},
        "rest": rest, "clips": clips, "materials": r2.material_records(objects),
        "textures": [texture_record(spec, output.parent)], "allowedExtensions": [],
        "permissions": {"publicAssetApproved": True, **spec["provenance"]},
    }


def texture_record(spec, source_directory):
    file = source_directory / f"{spec['texture']['name']}.png"
    if file.read_bytes() != builder.palette_png(spec):
        raise ValueError("SOURCE_TEXTURE")
    colors = [bytes.fromhex(color[1:]) + b"\xff" for color in spec["palette"].values()]
    colors += [colors[0]] * (32 - len(colors))
    pixels = b"".join(color * 8 for color in colors) * 8
    return {**spec["texture"], "sourceSha256": builder.checksum(file),
            "pixelFormat": "RGBA8", "pixelOrigin": "top-left",
            "pixelSha256": hashlib.sha256(pixels).hexdigest()}


def main(source, expected, output):
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
    for name, digest in authoring["inputs"].items():
        file = source.parent / name if name == f"{spec['texture']['name']}.png" else CODE.parent / name
        if builder.checksum(file) != digest:
            raise ValueError(f"AUTHORING_INPUT_CHANGED: {name}")
    output.mkdir(exist_ok=False)
    owned = output / "owned.blend"
    shutil.copyfile(source, owned)
    bpy.ops.wm.open_mainfile(filepath=str(owned), use_scripts=False)
    if bpy.context.scene.unit_settings.scale_length != 1:
        raise ValueError("SOURCE_UNITS")
    result = {
        "schema": 1, "kind": "cs3-library-export", "complete": False,
        "sourceSha256": expected, "authoringReceiptSha256": builder.checksum(source.with_name("authoring.json")),
        "inputs": {**authoring["inputs"], "blender/export_library.py": builder.checksum(__file__),
                   "probes/r2/export_sample.py": builder.checksum(CODE.parent / "probes/r2/export_sample.py")},
        "specification": spec, "blender": bpy.app.version_string, "blenderBuild": bpy.app.build_hash.decode(),
        "profile": spec["profile"], "settings": SETTINGS, "assets": [],
    }
    for asset in spec["assets"]:
        result["assets"].append(export_asset(spec, asset, authoring, output))
    if builder.checksum(source) != expected or builder.checksum(owned) != expected:
        raise ValueError("SOURCE_MUTATED")
    result["complete"] = True
    builder.write_json(output / "export.json", result)
    print(json.dumps({"complete": True, "assets": [
        {"id": a["id"], "bytes": a["bytes"], "nodes": len(a["nodes"]),
         "clips": [c["name"] for c in a["clips"]]} for a in result["assets"]]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    main(args.source.resolve(), args.sha256, args.output.resolve())
