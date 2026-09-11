"""Small synthetic GLB/evaluated-source evidence; never a C5 qualification receipt."""

import copy
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "blender"))
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
COMMIT = "9844435f98848be030a3347108e1129c650ed875"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fixture():
    spec = json.loads((ROOT / "blender/asset_spec.json").read_text())
    source = {"path": "source/library.blend", "sha256": sha(b"blend"), "bytes": 5, "commit": COMMIT}
    pixels = bytes([100, 150, 200, 255]) * 4

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">2I5B", 2, 2, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(b"\0" + pixels[:8] + b"\0" + pixels[8:]))
           + chunk(b"IEND", b""))
    texture = {**spec["texture"], "width": 2, "height": 2, "sourceSha256": sha(png),
               "pixelSha256": sha(pixels), "pixelFormat": "RGBA8", "pixelOrigin": "top-left"}
    technical = {"schema": 1, "kind": "cs3-library-export", "complete": True,
                 "sourceSha256": source["sha256"], "authoringReceiptSha256": sha(b"authoring"),
                 "specification": spec, "assets": [], "inputs": {},
                 "blender": "5.2.1", "blenderBuild": "9e2066aef7ef", "profile": spec["profile"]}
    profile = json.loads((ROOT / "blender/render_profile.json").read_text())
    technical["settings"] = profile["exportSettings"]
    technical["effectiveSettings"] = {**profile["exportSettings"], "export_texcoords": True}
    documents = {}
    files = {}
    for asset in spec["assets"]:
        root, body = asset["root"], asset["root"] + "Mesh"
        bounds = dict(zip(("min", "max"), [dict(zip("xyz", row)) for row in asset["restBounds"]]))
        objects = {
            root: {"type": "EMPTY", "parent": None, "materials": [],
                   "matrix_local": IDENTITY[:], "matrix_world": IDENTITY[:]},
            body: {"type": "MESH", "parent": root, "materials": [asset["material"]], "triangles": 1,
                   "matrix_local": IDENTITY[:], "matrix_world": IDENTITY[:], "bounds": asset["restBounds"]},
        }
        document = {
            "asset": {"version": "2.0", "generator": "synthetic"},
            "scene": 0, "scenes": [{"name": "CS3 Library", "nodes": [0]}],
            "nodes": [{"name": root, "children": [1]}, {"name": body, "mesh": 0}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "TEXCOORD_0": 1},
                                      "indices": 2, "material": 0}]}],
            "accessors": [],
            "materials": [{"name": asset["material"], "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "roughnessFactor": spec["materials"][asset["material"]]["roughness"],
                "metallicFactor": spec["materials"][asset["material"]]["metallic"]}}],
            "textures": [{"source": 0, "sampler": 0}],
            "samplers": [{"magFilter": 9729, "minFilter": 9987}],
            "images": [{"name": texture["name"], "bufferView": 0, "mimeType": "image/png"}],
            "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(png)}],
        }
        binary = png + b"\0" * (-len(png) % 4)
        lower, upper = asset["restBounds"]
        vertices = [lower[:], [upper[0], lower[1], upper[2]], [lower[0], upper[1], lower[2]]]
        uvs = [[0, 0], [1, 0], [0, 1]]
        for values, kind, component, fmt, count in [
            ([v for point in vertices for v in point], "VEC3", 5126, "f", 3),
            ([v for point in uvs for v in point], "VEC2", 5126, "f", 3),
            ([0, 1, 2], "SCALAR", 5123, "H", 3),
        ]:
            data = struct.pack("<" + fmt * len(values), *values)
            view = len(document["bufferViews"])
            document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)})
            document["accessors"].append({"bufferView": view, "componentType": component, "type": kind, "count": count})
            binary += data + b"\0" * (-len(data) % 4)
        document["accessors"][0].update(min=lower, max=upper)
        clips = []
        for clip in asset["clips"]:
            duration = (clip["frames"][1] - clip["frames"][0]) * clip["fpsBase"] / clip["fps"]
            times = [i / 30 for i in range(clip["frames"][1])]
            view = len(document["bufferViews"])
            document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": 4 * len(times)})
            binary += struct.pack("<" + "f" * len(times), *times)
            accessor = len(document["accessors"])
            document["accessors"].append({"bufferView": view, "componentType": 5126,
                                          "type": "SCALAR", "count": len(times), "min": [0], "max": [duration]})
            output_accessor = len(document["accessors"])
            document["accessors"].append({"bufferView": len(document["bufferViews"]), "componentType": 5126,
                                          "type": "VEC3", "count": len(times)})
            values = struct.pack("<" + "f" * (len(times)*3), *([0.0] * (len(times)*3)))
            document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(values)})
            binary += values
            document.setdefault("animations", []).append({
                "name": clip["name"], "samplers": [{"input": accessor, "output": output_accessor, "interpolation": "LINEAR"}],
                "channels": [{"sampler": 0, "target": {"node": 1, "path": "translation"}}],
            })
            clips.append({**clip, "duration": duration, "tracks": [{"node": 1, "path": "translation"}],
                          "samples": [{"frame": 1 + half / 2, "time": half / 60,
                                       "bounds": bounds, "objects": copy.deepcopy(objects)}
                                      for half in range((clip["frames"][1] - 1) * 2 + 1)]})
        document["buffers"] = [{"byteLength": len(binary)}]
        text = json.dumps(document, separators=(",", ":")).encode()
        text += b" " * (-len(text) % 4)
        glb = (struct.pack("<5I", 0x46546C67, 2, 28 + len(text) + len(binary), len(text), 0x4E4F534A)
               + text + struct.pack("<2I", len(binary), 0x004E4942) + binary)
        technical["assets"].append({
            "kind": "cs3-library-asset", "id": asset["id"], "file": asset["id"] + ".glb",
            "sha256": sha(glb), "bytes": len(glb), "root": root, "rootNode": 0, "sceneIndex": 0,
            "nodes": [{"id": root, "index": 0, "parent": None, "materials": []},
                      {"id": body, "index": 1, "parent": 0, "materials": [asset["material"]], "triangles": 1}],
            "rest": objects, "restBounds": bounds,
            "animatedBounds": dict(zip(("min", "max"), [dict(zip("xyz", row)) for row in asset["animatedBounds"]])),
            "geometry": {"meshes": 1, "primitives": 1, "triangles": 1,
                         "vertices": {body: vertices}, "vertexUvs": {body: [v + uv for v, uv in zip(vertices, uvs)]},
                         "triangleUvs": {body: [[v + uv for v, uv in zip(vertices, uvs)]]}},
            "clips": clips, "materials": {asset["material"]: {
                "base_color": None, **spec["materials"][asset["material"]], "clearcoat": 0,
                "nodes": ["OUTPUT_MATERIAL", "BSDF_PRINCIPLED", "TEX_IMAGE"]}},
            "textures": [copy.deepcopy(texture)], "allowedExtensions": [],
            "permissions": {"publicAssetApproved": True, **spec["provenance"]},
        })
        documents[asset["id"]] = (document, binary)
        files[asset["id"] + ".glb"] = glb
    inputs = [
        {"path": "blender/asset_spec.json", "sha256": sha(b"spec"), "bytes": 4, "role": "specification"},
        {"path": "blender/export_library.py", "sha256": sha(b"exporter"), "bytes": 8, "role": "exporter"},
        {"path": "blender/build_library.py", "sha256": sha(b"builder"), "bytes": 7, "role": "script"},
        {"path": "source/authoring.json", "sha256": sha(b"authoring"), "bytes": 9, "role": "script"},
        {"path": "source/CS3-Atlas.png", "sha256": sha(png), "bytes": len(png), "role": "texture"},
    ]
    for path in [
        "blender/atlas.py", "blender/equipment.py", "blender/profiles.py", "blender/technician.py",
        "blender/export_receipt.py", "probes/r2/export_sample.py", "tools/export-receipt.ts",
        "tools/promote-assets.ts", "tools/assets/contracts.ts", "tools/assets/store.ts",
        "src/assets/contracts.ts", "package.json", "package-lock.json",
    ]:
        data = path.encode()
        inputs.append({"path": path, "sha256": sha(data), "bytes": len(data), "role": "script"})
    return technical, documents, source, inputs, files


def mapped_fixture(output=None):
    from export_receipt import build_receipt, canonical_json
    technical, documents, source, inputs, files = fixture()
    profile = json.loads((ROOT / "blender/render_profile.json").read_text())
    technical["settings"] = profile["exportSettings"]
    profile_bytes = (ROOT / "blender/render_profile.json").read_bytes()
    inputs.append({"path": "blender/render_profile.json", "sha256": sha(profile_bytes),
                   "bytes": len(profile_bytes), "role": "script"})
    technical_bytes = (json.dumps(technical, sort_keys=True) + "\n").encode()
    inputs.append({"path": "technical.json", "sha256": sha(technical_bytes),
                   "bytes": len(technical_bytes), "role": "script"})
    for path in ("process.json", "export.pending.json"):
        data = path.encode()
        inputs.append({"path": path, "sha256": sha(data), "bytes": len(data), "role": "script"})
    tools = {"node": "22.23.1", "blender": technical["blender"],
             "blenderBuild": technical["blenderBuild"], "gltfExporter": "5.2.40"}
    exporter = {"path": "blender/export_library.py", "sha256": sha(b"exporter"),
                "revision": COMMIT, "exitCode": 0}
    receipt = build_receipt(technical, documents, source, inputs, profile, tools, exporter)
    technical["strictSpecificationSha256"] = receipt["specificationSha256"]
    technical_bytes = (json.dumps(technical, sort_keys=True) + "\n").encode()
    for item in inputs:
        if item["path"] == "technical.json":
            item.update(sha256=sha(technical_bytes), bytes=len(technical_bytes))
    receipt = build_receipt(technical, documents, source, inputs, profile, tools, exporter)
    if output:
        output.mkdir()
        (output / "candidate").mkdir()
        for name, data in files.items():
            (output / "candidate" / name).write_bytes(data)
        (output / "technical.json").write_bytes(technical_bytes)
        (output / "export.json").write_text(canonical_json(receipt) + "\n")
    return receipt


if __name__ == "__main__":
    mapped_fixture(Path(sys.argv[1]))
