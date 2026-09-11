"""Pure evidence mapping for the strict packaging API; no bpy or branch identity."""

import copy
from functools import cmp_to_key
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import zlib

ASSETS = {
    "floor-slab": "FloorRoot", "rack-standard": "RackRoot", "cooling-unit": "CoolingRoot",
    "technician-man": "TechnicianRoot", "coolant-leak": "CoolantRoot",
}
CLIPS = {"Idle": [1, 61], "Walk": [1, 31], "Repair": [1, 61]}
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def require(condition, code):
    if not condition:
        raise ValueError(code)


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def canonical_json(value):
    # Match tools/assets/contracts.ts: record arrays are sets, scalar arrays ordered.
    def text(value):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    def record_key(value):
        for field in ("id", "name", "node", "path"):
            if isinstance(value.get(field), str):
                return value[field] + "\0" + (value["path"] if isinstance(value.get("path"), str) else "")
        return ""

    def utf16(value):
        return value.encode("utf-16-be")

    def encode(value):
        if value is None or isinstance(value, (str, bool)):
            return text(value)
        if isinstance(value, (int, float)):
            require(math.isfinite(value), "NONFINITE_JSON")
            if isinstance(value, int):
                require(abs(value) <= 2**53 - 1, "UNSAFE_JSON_INTEGER")
                return str(value)
            if value == 0:
                return "0"
            number = repr(value).lower()
            if "e" not in number:
                return number.removesuffix(".0")
            mantissa, exponent = number.split("e")
            exponent = int(exponent)
            if -6 <= exponent < 21:
                sign = "-" if mantissa.startswith("-") else ""
                digits = mantissa.lstrip("-").replace(".", "")
                point = 1 + exponent
                if point <= 0:
                    return sign + "0." + "0" * -point + digits
                return sign + (digits[:point] + "." + digits[point:] if point < len(digits)
                               else digits + "0" * (point - len(digits)))
            return mantissa.removesuffix(".0") + "e" + ("+" if exponent >= 0 else "-") + str(abs(exponent))
        if isinstance(value, list):
            values = value
            if values and all(isinstance(item, dict) for item in values):
                def compare(left, right):
                    if isinstance(left.get("time"), (float, int)) and isinstance(right.get("time"), (float, int)):
                        return (left["time"] > right["time"]) - (left["time"] < right["time"])
                    left_key, right_key = (utf16(record_key(left)), utf16(encode(left))), (utf16(record_key(right)), utf16(encode(right)))
                    return (left_key > right_key) - (left_key < right_key)
                values = sorted(values, key=cmp_to_key(compare))
            return "[" + ",".join(encode(item) for item in values) + "]"
        require(isinstance(value, dict) and all(isinstance(k, str) for k in value), "JSON_VALUE")
        indices = sorted((int(k), k) for k in value
                         if re.fullmatch(r"(?:0|[1-9]\d*)", k) and int(k) <= 2**32 - 2)
        indexed = {key for _, key in indices}
        keys = [key for _, key in indices] + sorted((key for key in value if key not in indexed), key=utf16)
        return "{" + ",".join(text(k) + ":" + encode(value[k]) for k in keys) + "}"

    return encode(value)


def digest(value):
    return checksum(canonical_json(value).encode("utf-8"))


def safe_path(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_./-]+", value) is not None
            and all(part not in ("", ".", "..") and not part.endswith(".")
                    and not re.match(r"^(con|prn|aux|nul|com\d|lpt\d)(\.|$)", part, re.I)
                    for part in value.split("/")), "PATH")
    return value


def file_record(file, path, role=None):
    data = Path(file).read_bytes()
    require(len(data) > 0, "EMPTY_INPUT")
    record = {"path": safe_path(path), "sha256": checksum(data), "bytes": len(data)}
    if role is not None:
        record["role"] = role
    return record


def read_document(file):
    data = Path(file).read_bytes()
    require(len(data) >= 28 and data[:4] == b"glTF"
            and struct.unpack_from("<II", data, 4) == (2, len(data)), "GLB_HEADER")
    length, kind = struct.unpack_from("<II", data, 12)
    require(kind == 0x4E4F534A and length % 4 == 0 and 28 + length <= len(data), "GLB_JSON")
    binary_length, kind = struct.unpack_from("<II", data, 20 + length)
    require(kind == 0x004E4942 and binary_length == len(data) - 28 - length, "GLB_BINARY")
    return json.loads(data[20:20 + length]), data[28 + length:]


def buffer_view(document, binary, index):
    require(type(index) is int and 0 <= index < len(document["bufferViews"]), "BUFFER_VIEW")
    view = document["bufferViews"][index]
    offset, length = view.get("byteOffset", 0), view["byteLength"]
    require(view.get("buffer", 0) == 0 and type(offset) is int and type(length) is int
            and offset >= 0 and length > 0 and offset + length <= len(binary), "BUFFER_BOUNDS")
    return binary[offset:offset + length]


def scalar_times(document, binary, index):
    accessor = document["accessors"][index]
    require(accessor["componentType"] == 5126 and accessor["type"] == "SCALAR"
            and not accessor.get("sparse"), "ANIMATION_TIME_ACCESSOR")
    data = buffer_view(document, binary, accessor["bufferView"])
    view = document["bufferViews"][accessor["bufferView"]]
    offset, stride, count = accessor.get("byteOffset", 0), view.get("byteStride", 4), accessor["count"]
    require(type(count) is int and count > 0 and offset >= 0 and stride >= 4
            and offset + (count - 1) * stride + 4 <= len(data), "ANIMATION_TIME_BOUNDS")
    values = [struct.unpack_from("<f", data, offset + i * stride)[0] for i in range(count)]
    require(all(math.isfinite(t) and (i == 0 or t > values[i - 1]) for i, t in enumerate(values)),
            "ANIMATION_TIME_ORDER")
    return values


def png_pixels(data):
    require(data[:8] == b"\x89PNG\r\n\x1a\n", "TEXTURE_PNG")
    offset, compressed, header, ended = 8, bytearray(), None, False
    while offset + 12 <= len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        require(offset + 12 + length <= len(data), "TEXTURE_PNG_BOUNDS")
        require(zlib.crc32(kind + payload) == struct.unpack_from(">I", data, offset + 8 + length)[0],
                "TEXTURE_PNG_CRC")
        if kind == b"IHDR":
            require(header is None and offset == 8 and length == 13, "TEXTURE_PNG_HEADER")
            header = struct.unpack(">2I5B", payload)
        elif kind == b"IDAT":
            require(header is not None, "TEXTURE_PNG_HEADER")
            compressed.extend(payload)
        elif kind == b"IEND":
            require(length == 0 and offset + 12 == len(data), "TEXTURE_PNG_END")
            ended = True
            break
        else:
            require(kind != b"tRNS" and 97 <= kind[0] <= 122, "TEXTURE_PNG_CHUNK")
        offset += length + 12
    require(header is not None and ended, "TEXTURE_PNG_INCOMPLETE")
    width, height, depth, color, compression, filtering, interlace = header
    require(0 < width <= 4096 and 0 < height <= 4096 and depth == 8 and color in (2, 6)
            and compression == filtering == interlace == 0, "TEXTURE_PNG_FORMAT")
    channels = 4 if color == 6 else 3
    stride = width * channels
    expected = height * (stride + 1)
    decoder = zlib.decompressobj()
    raw = decoder.decompress(compressed, expected + 1)
    require(len(raw) == expected and decoder.eof and not decoder.unused_data, "TEXTURE_PNG_PIXELS")
    previous, pixels = bytearray(stride), bytearray()
    for row_index in range(height):
        offset = row_index * (stride + 1)
        mode, row = raw[offset], bytearray(raw[offset + 1:offset + 1 + stride])
        require(mode in range(5), "TEXTURE_PNG_FILTER")
        for i in range(stride):
            left, up, corner = row[i - channels] if i >= channels else 0, previous[i], previous[i - channels] if i >= channels else 0
            p = left + up - corner
            distances = [abs(p - left), abs(p - up), abs(p - corner)]
            paeth = [left, up, corner][distances.index(min(distances))]
            row[i] = (row[i] + [0, left, up, (left + up) // 2, paeth][mode]) % 256
        if channels == 4:
            pixels.extend(row)
        else:
            for i in range(0, stride, 3):
                pixels.extend(row[i:i + 3] + b"\xff")
        previous = row
    return width, height, bytes(pixels)


def transforms(objects):
    result = []
    for name, entry in objects.items():
        require("matrix_local" in entry and "matrix_world" in entry, "REST_TRANSFORM")
        local, world = entry["matrix_local"], entry["matrix_world"]
        require(len(local) == len(world) == 16 and all(math.isfinite(n) for n in local + world),
                "REST_TRANSFORM")
        result.append({"node": name, "localMatrix": local[:], "worldMatrix": world[:]})
    return result


def gltf_matrix(node):
    require(not ("matrix" in node and any(k in node for k in ("translation", "rotation", "scale"))),
            "REST_MATRIX_TRS")
    if "matrix" in node:
        value = node["matrix"]
        require(len(value) == 16 and all(math.isfinite(n) for n in value), "REST_MATRIX")
        return value
    translation, rotation, scale = node.get("translation", [0, 0, 0]), node.get("rotation", [0, 0, 0, 1]), node.get("scale", [1]*3)
    require(len(translation) == len(scale) == 3 and len(rotation) == 4
            and all(math.isfinite(n) for n in translation + rotation + scale)
            and all(abs(n - 1) <= 1e-6 for n in scale)
            and abs(sum(n*n for n in rotation) - 1) <= 1e-6, "REST_TRS")
    x, y, z, w = rotation
    value = [1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,
             2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
             2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0, *translation, 1]
    for column in range(3):
        for row in range(3):
            value[column*4+row] *= scale[column]
    return value


def multiply(left, right):
    return [sum(left[k*4+i % 4] * right[(i//4)*4+k] for k in range(4)) for i in range(16)]


def reject_private_paths(value):
    if isinstance(value, str):
        require(re.search(r"(?:^|[\s\"'=(:])(?:/(?!/)|~[\\/]|[A-Za-z]:[\\/]|file:|\\\\)", value) is None,
                "PRIVATE_PATH")
    elif isinstance(value, dict):
        for key, item in value.items():
            reject_private_paths(key)
            reject_private_paths(item)
    elif isinstance(value, list):
        for item in value:
            reject_private_paths(item)


def map_asset(asset, document, binary, source, inputs):
    require(asset["id"] in ASSETS and asset["root"] == ASSETS[asset["id"]], "ASSET_ID")
    require(not document.get("extensionsRequired") and not document.get("extensionsUsed"), "EXTENSIONS")
    require(not document.get("skins") and not document.get("cameras"), "UNSUPPORTED_CONTENT")
    require(all(not b.get("uri") for b in document["buffers"]), "EXTERNAL_BUFFER")
    gl_nodes = document["nodes"]
    names = [node["name"] for node in gl_nodes]
    require(len(set(names)) == len(names) and set(names) == {n["id"] for n in asset["nodes"]}, "NODE_IDENTITY")
    require(set(names) == set(asset["rest"]), "REST_NODE_SET")
    root_index = names.index(asset["root"])
    require(len(document["scenes"]) == 1 and document.get("scene", 0) == 0
            and document["scenes"][0]["nodes"] == [root_index], "SCENE_ROOT")
    scene = document["scenes"][0].get("name")
    require(isinstance(scene, str) and bool(scene), "SCENE_NAME")
    parents = {}
    for node in gl_nodes:
        for child in node.get("children", []):
            require(type(child) is int and 0 <= child < len(names) and child not in parents, "NODE_PARENT")
            parents[child] = node["name"]
    locals_by_name = {node["name"]: gltf_matrix(node) for node in gl_nodes}
    worlds = {}

    def world(name, visited):
        require(name not in visited, "NODE_PARENT_CYCLE")
        if name not in worlds:
            parent = parents.get(names.index(name))
            worlds[name] = (multiply(world(parent, visited | {name}), locals_by_name[name])
                            if parent is not None else locals_by_name[name])
        return worlds[name]

    nodes = []
    for index, node in enumerate(gl_nodes):
        evidence = asset["rest"][node["name"]]
        require(parents.get(index) == evidence["parent"], "NODE_PARENT")
        for actual, expected in ((locals_by_name[node["name"]], evidence["matrix_local"]),
                                 (world(node["name"], set()), evidence["matrix_world"])):
            require(len(expected) == 16 and all(math.isfinite(b) and abs(a-b) <= 2e-4
                                               for a, b in zip(actual, expected)), "REST_TRANSFORM_SOURCE")
        require(not node.get("weights") and "skin" not in node, "UNSUPPORTED_CONTENT")
        primitives = document["meshes"][node["mesh"]]["primitives"] if "mesh" in node else []
        require(bool(primitives) == (evidence["type"] == "MESH"), "MESH_IDENTITY")
        slots, triangles, uv_sets = [], 0, set()
        for primitive in primitives:
            require(primitive.get("mode", 4) == 4 and not primitive.get("targets"), "TRIANGLE_MODE")
            count = document["accessors"][primitive["indices"]]["count"]
            require(type(count) is int and count > 0 and count % 3 == 0, "TRIANGLE_COUNT")
            triangles += count // 3
            attributes = primitive["attributes"]
            require("POSITION" in attributes and "TEXCOORD_0" in attributes, "TEXTURE_UV")
            uv_sets.update(int(k[9:]) for k in attributes if k.startswith("TEXCOORD_"))
            slots.append(document["materials"][primitive["material"]]["name"])
        require(triangles == evidence.get("triangles", 0), "TRIANGLE_SOURCE")
        require(slots == evidence["materials"], "MATERIAL_SLOTS")
        nodes.append({"id": node["name"], "parent": parents.get(index), "mesh": bool(primitives),
                      "primitives": len(primitives), "triangles": triangles, "materials": slots, "uvSets": sorted(uv_sets)})
    geometry = {"meshes": sum(n["mesh"] for n in nodes), "primitives": sum(n["primitives"] for n in nodes),
                "triangles": sum(n["triangles"] for n in nodes)}
    require(all(asset["geometry"][k] == v for k, v in geometry.items())
            and len(document["meshes"]) == geometry["meshes"], "GEOMETRY_TOTALS")
    textures = []
    require(len(document.get("images", [])) == len(asset["textures"]) > 0, "TEXTURE_COUNT")
    for image in document["images"]:
        require(not image.get("uri") and image.get("mimeType") == "image/png" and "bufferView" in image,
                "TEXTURE_EMBEDDED")
        evidence = next((t for t in asset["textures"] if t["name"] == image.get("name")), None)
        require(evidence is not None, "TEXTURE_NAME")
        width, height, pixels = png_pixels(buffer_view(document, binary, image["bufferView"]))
        require((width, height) == (evidence["width"], evidence["height"])
                and checksum(pixels) == evidence["pixelSha256"], "TEXTURE_PIXELS")
        candidates = [i for i in inputs if i["role"] == "texture" and i["sha256"] == evidence["sourceSha256"]
                      and Path(i["path"]).name == evidence["name"] + ".png"]
        require(len(candidates) == 1 and evidence["colorSpace"] == "sRGB"
                and evidence["role"] == "base-color" and evidence["pixelFormat"] == "RGBA8", "TEXTURE_INPUT")
        textures.append({"name": evidence["name"], "width": width, "height": height,
                         "uvSet": evidence["uv"], "colorSpace": "sRGB", "role": "base-color", "embedded": True,
                         "sourcePath": safe_path(candidates[0]["path"]), "sourceSha256": evidence["sourceSha256"],
                         "pixelSha256": checksum(pixels), "pixelFormat": "RGBA8"})
    materials = []
    require({m["name"] for m in document["materials"]} == set(asset["materials"]), "MATERIAL_SET")
    for material in document["materials"]:
        evidence = asset["materials"][material["name"]]
        pbr = material["pbrMetallicRoughness"]
        require(material.get("alphaMode", "OPAQUE") == "OPAQUE" and not material.get("extensions")
                and not any(k in material for k in ("normalTexture", "occlusionTexture", "emissiveTexture"))
                and not pbr.get("metallicRoughnessTexture")
                and not any(material.get("emissiveFactor", [0, 0, 0])) and not material.get("doubleSided", False),
                "PORTABLE_PBR")
        require(set(evidence["nodes"]) == {"OUTPUT_MATERIAL", "BSDF_PRINCIPLED", "TEX_IMAGE"}
                and evidence["clearcoat"] == 0, "PORTABLE_SOURCE")
        color = pbr.get("baseColorFactor", [1, 1, 1, 1])
        require(len(color) == 4 and all(abs(a - b) <= 1e-6 for a, b in zip(color, evidence["base_color"] or [1]*4)),
                "MATERIAL_COLOR")
        for key, source_key in (("roughnessFactor", "roughness"), ("metallicFactor", "metallic")):
            require(evidence[source_key] is not None and abs(pbr.get(key, 1) - evidence[source_key]) <= 1e-6,
                    "MATERIAL_FACTOR")
        binding = pbr.get("baseColorTexture")
        require(binding is not None and not binding.get("extensions"), "TEXTURE_BINDING")
        texture = document["textures"][binding["index"]]
        image = document["images"][texture["source"]]
        require(binding.get("texCoord", 0) == 0, "TEXTURE_UV")
        sampler = document["samplers"][texture["sampler"]]
        require(sampler.get("magFilter") == 9729 and sampler.get("minFilter") == 9987
                and sampler.get("wrapS", 10497) == sampler.get("wrapT", 10497) == 10497, "TEXTURE_FILTER")
        materials.append({"name": material["name"], "classification": "portable-pbr", "alphaMode": "OPAQUE",
                          "baseColor": color, "roughness": pbr.get("roughnessFactor", 1),
                          "metallic": pbr.get("metallicFactor", 1),
                          "textures": [{"texture": image["name"], "role": "base-color", "uvSet": 0}]})
    expected_clips = CLIPS if asset["id"] == "technician-man" else {}
    animations = document.get("animations", [])
    require(len(animations) == len(expected_clips) == len(asset["clips"])
            and {a["name"] for a in animations} == set(expected_clips)
            and {c["name"] for c in asset["clips"]} == set(expected_clips), "CLIP_SET")
    clips = []
    for clip in asset["clips"]:
        require(clip["frames"] == expected_clips[clip["name"]] and clip["fps"] == 30
                and clip["fpsBase"] == 1 and clip["rootMotion"] is False
                and clip["loop"] == "duplicate-end", "CLIP_DECLARATION")
        duration = (clip["frames"][1] - clip["frames"][0]) * clip["fpsBase"] / clip["fps"]
        require(abs(clip["duration"] - duration) <= 1e-5, "CLIP_DURATION")
        animation = next(a for a in animations if a["name"] == clip["name"])
        tracks = []
        for channel in animation["channels"]:
            target, sampler = channel["target"], animation["samplers"][channel["sampler"]]
            require(type(target["node"]) is int and 0 <= target["node"] < len(names)
                    and target["node"] != root_index and target["path"] in ("translation", "rotation", "scale"),
                    "TRACK_TARGET")
            require(sampler.get("interpolation", "LINEAR") == "LINEAR", "TRACK_INTERPOLATION")
            times = scalar_times(document, binary, sampler["input"])
            require(len(times) == clip["frames"][1] - clip["frames"][0] + 1
                    and all(abs(t - i / 30) <= 1e-5 for i, t in enumerate(times)), "CLIP_TIMES")
            tracks.append({"node": names[target["node"]], "path": target["path"],
                           "interpolation": "LINEAR", "times": times})
        require(tracks and len({(t["node"], t["path"]) for t in tracks}) == len(tracks)
                and {(t["node"], t["path"]) for t in tracks}
                == {(names[t["node"]], t["path"]) for t in clip["tracks"]}, "TRACK_SET")
        keys = sorted({t for track in tracks for t in track["times"]})
        sample_times = sorted(keys + [(a + b) / 2 for a, b in zip(keys, keys[1:])])
        require(len(clip["samples"]) == len(sample_times), "POSE_SAMPLES")
        samples = []
        for time in sample_times:
            matches = [s for s in clip["samples"] if abs(s["time"] - time) <= 1e-6]
            require(len(matches) == 1 and "bounds" in matches[0] and set(matches[0]["objects"]) == set(names),
                    "POSE_SAMPLE")
            sample = matches[0]
            samples.append({"time": time, "bounds": copy.deepcopy(sample["bounds"]),
                            "transforms": transforms(sample["objects"])})
        clips.append({k: copy.deepcopy(clip[k]) for k in ("name", "frames", "fps", "fpsBase", "rootMotion", "loop")})
        clips[-1].update(duration=duration, tracks=tracks, samples=samples)
    provenance = asset["permissions"]
    require(not provenance["fonts"] and not provenance["sourceTextures"], "UNSUPPORTED_PROVENANCE")
    attribution = {k: provenance[k] for k in ("attribution", "terms")}
    permissions = {
        "publicAssetApproved": False,
        "sources": [{"path": safe_path(source["path"]), "sha256": source["sha256"], **attribution}],
        "textures": [{"path": t["sourcePath"], "sha256": t["sourceSha256"], **attribution} for t in textures],
        "fonts": [],
    }
    declaration = {
        "id": asset["id"], "scene": scene, "root": asset["root"], "nodes": nodes,
        "coordinates": {"units": "meters", "up": "Y", "handedness": "right", "front": "+Z",
                        "pivot": "floor-center", "rootMatrix": asset["rest"][asset["root"]]["matrix_world"][:]},
        "geometry": geometry, "restBounds": copy.deepcopy(asset["restBounds"]),
        "animatedBounds": copy.deepcopy(asset["animatedBounds"]), "materials": materials, "textures": textures,
        "allowedExtensions": [], "clips": clips, "rest": transforms(asset["rest"]), "permissions": permissions,
    }
    reject_private_paths(declaration)
    return declaration


def build_receipt(technical, documents, source, inputs, profile, tools, exporter):
    require(technical.get("complete") is True, "INCOMPLETE_EXPORT")
    require(set(exporter) == {"path", "sha256", "revision", "exitCode"}
            and type(exporter["exitCode"]) is int and exporter["exitCode"] == 0
            and re.fullmatch(r"[a-f0-9]{40}", exporter["revision"]) is not None
            and re.fullmatch(r"[a-f0-9]{64}", exporter["sha256"]) is not None, "EXPORTER_IDENTITY")
    require(set(tools) == {"node", "blender", "blenderBuild", "gltfExporter"}, "TOOL_IDENTITY")
    for name, value in tools.items():
        pattern = r"[a-f0-9]{12,40}" if name == "blenderBuild" else r"\d+\.\d+\.\d+(?:[ .+-][A-Za-z0-9 .+-]+)?"
        require(isinstance(value, str) and re.fullmatch(pattern, value) is not None, "TOOL_IDENTITY")
    require(len(technical["assets"]) == 5 and {a["id"] for a in technical["assets"]} == set(ASSETS)
            and set(documents) == set(ASSETS), "ASSET_SET")
    require(set(source) == {"path", "sha256", "bytes", "commit"} and source["path"].endswith(".blend")
            and re.fullmatch(r"[a-f0-9]{40}", source["commit"]) is not None
            and technical["sourceSha256"] == source["sha256"], "SOURCE_IDENTITY")
    require(profile["profile"] == technical["profile"] == "cs3-standard-v1", "PROFILE_IDENTITY")
    require(technical.get("settings") == profile["exportSettings"]
            and isinstance(technical.get("effectiveSettings"), dict)
            and all(technical["effectiveSettings"].get(k) == v for k, v in profile["exportSettings"].items()),
            "EXPORTER_SETTINGS")
    paths = [safe_path(i["path"]).lower() for i in inputs]
    require(len(paths) == len(set(paths)), "INPUT_DUPLICATE")
    required_inputs = {path.lower() for path in {
        "blender/asset_spec.json", "blender/atlas.py", "blender/build_library.py",
        "blender/equipment.py", "blender/profiles.py", "blender/technician.py",
        "blender/export_library.py", "blender/export_receipt.py", "blender/render_profile.json",
        "probes/r2/export_sample.py", "tools/export-receipt.ts", "tools/promote-assets.ts",
        "tools/assets/contracts.ts", "tools/assets/store.ts", "src/assets/contracts.ts",
        "package.json", "package-lock.json", "source/authoring.json", "source/CS3-Atlas.png",
        "technical.json", "process.json", "export.pending.json",
    }}
    require(required_inputs <= set(paths), "INPUT_INVENTORY")
    for item in inputs:
        require(item["role"] in ("specification", "exporter", "script", "texture", "font")
                and re.fullmatch(r"[a-f0-9]{64}", item["sha256"]) is not None
                and type(item["bytes"]) is int and item["bytes"] > 0, "INPUT_IDENTITY")
    require(sum(i["role"] == "specification" for i in inputs) == 1
            and sum(i["role"] == "exporter" for i in inputs) == 1
            and any(i["role"] == "exporter" and i["path"] == exporter["path"]
                    and i["sha256"] == exporter["sha256"] for i in inputs)
            and any(i["path"] == "technical.json" and i["role"] == "script" for i in inputs)
            and any(i["path"] == "blender/render_profile.json" and i["role"] == "script" for i in inputs),
            "INPUT_IDENTITY")
    assets = []
    for asset in technical["assets"]:
        declaration = map_asset(asset, *documents[asset["id"]], source, inputs)
        require(asset["bytes"] > 0 and re.fullmatch(r"[a-f0-9]{64}", asset["sha256"]) is not None,
                "EXPORTER_OUTPUT")
        require(asset["file"] == asset["id"] + ".glb", "ASSET_FILE")
        assets.append({**declaration, **{k: asset[k] for k in ("file", "sha256", "bytes")}})
    specification = {"schema": 1, "assets": [
        {k: copy.deepcopy(v) for k, v in asset.items() if k not in ("file", "sha256", "bytes")} for asset in assets]}
    recipe_inputs = [i for i in inputs if i["path"] not in ("technical.json", "process.json", "export.pending.json")]
    return {
        "schema": 1, "kind": "cs3-library-export", "complete": True, "source": copy.deepcopy(source),
        "specification": specification, "specificationSha256": digest(specification), "inputs": copy.deepcopy(inputs),
        "profile": profile["profile"],
        "profileSha256": digest({k: profile[k] for k in ("profile", "color", "normalRendering")}),
        "recipeSha256": digest({"profile": profile, "inputs": recipe_inputs, "settings": technical["settings"],
                                "effectiveSettings": technical["effectiveSettings"]}),
        "tools": copy.deepcopy(tools), "exporter": copy.deepcopy(exporter), "assets": assets,
    }


def load_technical(export_file):
    """Legacy receipts remain immutable; strict receipts must bind their sibling."""
    export_file = Path(export_file)
    receipt = json.loads(export_file.read_text())
    require(receipt.get("kind") == "cs3-library-export" and receipt.get("complete") is True, "EXPORT_INCOMPLETE")
    if "source" not in receipt:
        return receipt
    matches = [i for i in receipt["inputs"] if i["path"] == "technical.json" and i["role"] == "script"]
    require(len(matches) == 1, "TECHNICAL_INPUT")
    file = export_file.with_name("technical.json")
    require(not file.is_symlink(), "TECHNICAL_PATH")
    data = file.read_bytes()
    require(checksum(data) == matches[0]["sha256"] and len(data) == matches[0]["bytes"], "TECHNICAL_IDENTITY")
    technical = json.loads(data)
    require(technical.get("complete") is True and technical["sourceSha256"] == receipt["source"]["sha256"],
            "TECHNICAL_SOURCE")
    require(technical.get("strictSpecificationSha256") == receipt["specificationSha256"],
            "TECHNICAL_SPECIFICATION")
    require({a["id"] for a in technical["assets"]} == set(ASSETS), "TECHNICAL_ASSETS")
    for asset in receipt["assets"]:
        evidence = next(a for a in technical["assets"] if a["id"] == asset["id"])
        require(all(asset[k] == evidence[k] for k in ("file", "sha256", "bytes", "root")), "TECHNICAL_ASSET")
    return technical
