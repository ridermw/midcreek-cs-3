"""Deterministic, editable CS3 visual templates; no hall placement or collision."""

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import struct
import sys
import zlib

IDS = ("floor-slab", "rack-standard", "cooling-unit", "technician-man", "coolant-leak")
ROOTS = ("FloorRoot", "RackRoot", "CoolingRoot", "TechnicianRoot", "CoolantRoot")
CLIPS = (("Idle", [1, 61]), ("Walk", [1, 31]), ("Repair", [1, 61]))


def validate_spec(spec):
    if any(spec.get(k) != v for k, v in
           {"schema": 1, "units": "meters", "up": "Z", "front": "-Y",
            "exportUp": "Y", "exportFront": "+Z", "profile": "cs3-standard-v1"}.items()):
        raise ValueError("SPEC_COORDINATES")
    if "placements" in spec or "collision" in spec:
        raise ValueError("SPEC_VISUAL_ONLY")
    if tuple(a["id"] for a in spec["assets"]) != IDS:
        raise ValueError("SPEC_ASSET_IDS")
    if tuple(a["root"] for a in spec["assets"]) != ROOTS:
        raise ValueError("SPEC_ROOTS")
    for asset in spec["assets"]:
        clips = asset["clips"]
        expected = CLIPS if asset["id"] == "technician-man" else ()
        if tuple((c["name"], c["frames"]) for c in clips) != expected:
            raise ValueError("SPEC_CLIPS")
        if any(c["fps"] != 30 or c["fpsBase"] != 1 or c["rootMotion"]
               or c["loop"] != "duplicate-end" for c in clips):
            raise ValueError("SPEC_TIMING")
    if len(spec["palette"]) > 32 or any(not re.fullmatch(r"#[0-9A-Fa-f]{6}", c)
                                      for c in spec["palette"].values()):
        raise ValueError("SPEC_PALETTE")
    if spec["texture"] != {"name": "CS3-Palette", "width": 256, "height": 8, "uv": 0,
                           "role": "base-color", "colorSpace": "sRGB", "filter": "nearest"}:
        raise ValueError("SPEC_TEXTURE")


def palette_png(spec):
    colors = [bytes.fromhex(c[1:]) for c in spec["palette"].values()]
    colors += [colors[0]] * (32 - len(colors))
    row = b"\0" + b"".join(c * 8 for c in colors)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 256, 8, 8, 2, 0, 0, 0))
            + chunk(b"sRGB", b"\0") + chunk(b"IDAT", zlib.compress(row * 8, 9)) + chunk(b"IEND", b""))


def checksum(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def write_json(file, value):
    file.write_text(json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + "\n")


def activate_clip(authoring, name):
    import bpy
    for node_name, rest in authoring["rest"].items():
        obj = bpy.data.objects[node_name]
        animation = obj.animation_data
        animation.use_nla = False
        animation.action = None
        for track in animation.nla_tracks:
            track.mute = True
        obj.location, obj.rotation_euler, obj.scale = rest["location"], rest["rotation"], rest["scale"]
        if name is not None:
            tracks = [track for track in animation.nla_tracks if track.name == name]
            if len(tracks) != 1 or len(tracks[0].strips) != 1:
                raise ValueError(f"SOURCE_CLIP: {node_name}/{name}")
            strip = tracks[0].strips[0]
            animation.action = strip.action
            animation.action_slot = strip.action_slot
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def owned_output(output):
    repo = Path(__file__).resolve().parents[1]
    output = output.resolve()
    if not os.environ.get("CS3_JOB_ROOT") or output.parent != repo / ".artifacts/assets":
        raise ValueError("OWNED_GUARDED_OUTPUT_REQUIRED")
    if not re.fullmatch(r"[a-z0-9-]+", output.name):
        raise ValueError("OUTPUT_ID")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir(exist_ok=False)
    return output


class Builder:
    def __init__(self, spec, output):
        import bpy
        self.bpy, self.spec, self.output = bpy, spec, output
        self.parts = {}
        self.nodes = {}
        self.palette = list(spec["palette"])
        palette = output / f"{spec['texture']['name']}.png"
        palette.write_bytes(palette_png(spec))
        image = bpy.data.images.load(str(palette))
        image.name = "CS3-Palette"
        image.colorspace_settings.name = "sRGB"
        image.pack()
        for name, values in spec["materials"].items():
            material = bpy.data.materials.new(name)
            material.use_nodes = True
            material.use_backface_culling = True
            shader = material.node_tree.nodes.get("Principled BSDF")
            shader.inputs["Base Color"].default_value = (1, 1, 1, 1)
            shader.inputs["Roughness"].default_value = values["roughness"]
            shader.inputs["Metallic"].default_value = values["metallic"]
            texture = material.node_tree.nodes.new("ShaderNodeTexImage")
            texture.image = image
            texture.interpolation = "Closest"
            material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])

    def node(self, name, parent=None, position=(0, 0, 0)):
        obj = self.bpy.data.objects.new(name, None)
        self.bpy.context.collection.objects.link(obj)
        obj.parent, obj.location = parent, position
        self.parts[name] = []
        self.nodes[name] = obj
        return obj

    def paint(self, obj, parent, color):
        obj.parent = parent
        for layer in list(obj.data.uv_layers):
            obj.data.uv_layers.remove(layer)
        uv = obj.data.uv_layers.new(name="PaletteUV")
        uv.active_render = True
        coordinate = ((self.palette.index(color) + 0.5) / 32, 0.5)
        for point in uv.data:
            point.uv = coordinate
        obj.data.materials.append(self.bpy.data.materials[self.material])
        self.parts[parent.name].append(obj)
        return obj

    def shape(self, parent, position, size, color, kind="box", rotation=(0, 0, 0), bevel=0, segments=1):
        bpy = self.bpy
        if kind == "box":
            bpy.ops.mesh.primitive_cube_add(size=1)
        elif kind == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.5)
        elif kind == "cylinder":
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.5, depth=1)
        else:
            raise ValueError(f"SHAPE_KIND: {kind}")
        obj = bpy.context.object
        obj.dimensions = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        if bevel:
            modifier = obj.modifiers.new("Graphic bevel", "BEVEL")
            modifier.width, modifier.segments = bevel, segments
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.rotation_euler = rotation
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        obj.location = position
        return self.paint(obj, parent, color)

    def tube(self, parent, points, radius, color):
        bpy = self.bpy
        curve = bpy.data.curves.new("Tube", "CURVE")
        curve.dimensions, curve.resolution_u = "3D", 1
        curve.bevel_depth, curve.bevel_resolution = radius, 1
        curve.use_fill_caps = True
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, coordinate in zip(spline.points, points):
            point.co = (*coordinate, 1)
        obj = bpy.data.objects.new("Tube", curve)
        bpy.context.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        return self.paint(bpy.context.object, parent, color)

    def join(self):
        bpy = self.bpy
        for name, objects in self.parts.items():
            if not objects:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.join()
            obj = bpy.context.object
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            obj.name, obj.data.name = f"{name}Mesh", f"{name}Geometry"
            if len(obj.data.materials) != 1:
                raise ValueError(f"MATERIAL_SLOT_DUPLICATION: {name}")

    def equipment(self, root, cooling=False):
        s = lambda p, z, c, **kw: self.shape(root, p, z, c, **kw)
        for x in (-0.38, 0.38):
            for y in (-0.38, 0.38):
                s((x, y, 1.05), (0.04, 0.04, 2.1), "ink", bevel=0.006)
                s((x, y, 1.055), (0.03, 0.03, 2.03), "white", bevel=0.003)
        for z in (0.025, 2.075):
            cap = s((0, 0, z), (0.8, 0.8, 0.05), "white", bevel=0.008)
            for polygon in cap.data.polygons:
                if max(abs(component) for component in polygon.normal) < 0.999:
                    for loop in polygon.loop_indices:
                        cap.data.uv_layers.active.data[loop].uv = ((self.palette.index("ink")+0.5)/32,0.5)
        for x in (-0.388, 0.388):
            s((x, 0, 1.05), (0.017, 0.72, 1.95), "white")
            for z in (1.36, 1.40, 1.44, 1.48):
                s((x * 1.023, 0, z), (0.003, 0.16, 0.015), "steel")
            s((x * 1.023, -0.22, 0.9), (0.003, 0.035, 0.17), "ink")
        s((0, -0.362, 1.05), (0.72, 0.025, 1.94), "ink")
        s((0, 0.33, 1.05), (0.71, 0.025, 1.94), "rack-shadow")
        if cooling:
            for index in range(19):
                z = 0.22 + index * 0.089
                s((-0.045, -0.387, z), (0.53, 0.025, 0.03), "white", bevel=0.004)
            s((0.30, -0.381, 1.35), (0.08, 0.025, 0.43), "steel")
            for index in range(6):
                s((0.30, -0.397, 1.20 + index * 0.057), (0.045, 0.003, 0.037), "green" if index > 1 else "teal")
            for x in (-0.37, 0.37):
                for z in (0.11, 1.99):
                    s((x, -0.385, z), (0.055, 0.03, 0.09), "yellow")
            for x in (-0.24, -0.08, 0.08, 0.24):
                self.tube(root, [(x, 0.36, 1.84), (x, 0.36, 0.64)], 0.025, "teal")
                s((x, 0.378, 0.73), (0.047, 0.035, 0.13), "yellow", bevel=0.006)
                self.tube(root, [(x, 0.355, 0.60), (x + 0.025, 0.355, 0.35),
                                 (0.28, 0.355, 0.19)], 0.025, "hose")
        else:
            for index in range(18):
                z = 0.17 + index * 0.098
                s((0, -0.384, z), (0.64, 0.021, 0.081), "steel", bevel=0.004)
                s((-0.038, -0.397, z), (0.45, 0.004, 0.049), "hose")
                for x in (-0.21, -0.15, -0.09, -0.03, 0.03, 0.09):
                    s((x, -0.3995, z), (0.016, 0.001, 0.039), "ink")
                s((-0.30, -0.399, z), (0.018, 0.002, 0.055), "teal")
                s((0.246, -0.399, z + 0.015), (0.016, 0.002, 0.012), "green")
                s((0.282, -0.399, z - 0.015), (0.021, 0.002, 0.012), "teal")
            for x in (-0.34, 0.34):
                s((x, -0.39, 1.03), (0.011, 0.015, 1.81), "yellow")
            for x in (-0.17, 0.17):
                self.tube(root, [(x, 0.36, 1.97), (x, 0.36, 1.68),
                                 (x * 1.5, 0.36, 1.50), (x * 1.5, 0.36, 0.25)], 0.027, "hose")
                for z in (0.29, 1.85):
                    s((x if z > 1 else x * 1.5, 0.371, z), (0.07, 0.04, 0.06), "yellow")
            for z in (0.61, 0.96, 1.31):
                s((0, 0.363, z), (0.50, 0.02, 0.21), "steel")
                self.tube(root, [(-0.2, 0.383, z), (-0.15, 0.383, z - 0.07),
                                 (0.15, 0.383, z - 0.07), (0.2, 0.383, z)], 0.012, "teal")

    def floor(self, root):
        bpy = self.bpy
        xs, ys = [-8.5, -8.22, -8.14, 8.14, 8.22, 8.5], [-7.5, -7.22, -7.14, 7.14, 7.22, 7.5]
        vertices, faces, colors = [], [], []
        def quad(points, color):
            start = len(vertices)
            vertices.extend(points)
            faces.append(tuple(range(start, start + 4)))
            colors.append(color)
        for i in range(5):
            for j in range(5):
                color = "yellow" if ((i in (1, 3) and j in (1, 2, 3))
                                    or (j in (1, 3) and i in (1, 2, 3))) else "floor"
                quad([(xs[i],ys[j],0),(xs[i+1],ys[j],0),(xs[i+1],ys[j+1],0),(xs[i],ys[j+1],0)], color)
        for a, b in [((-8.5,-7.5),(8.5,-7.5)),((8.5,-7.5),(8.5,7.5)),
                     ((8.5,7.5),(-8.5,7.5)),((-8.5,7.5),(-8.5,-7.5))]:
            quad([(*a,-0.1),(*b,-0.1),(*b,0),(*a,0)], "floor-edge")
        quad([(-8.5,-7.5,-0.1),(-8.5,7.5,-0.1),(8.5,7.5,-0.1),(8.5,-7.5,-0.1)], "floor-edge")
        mesh = bpy.data.meshes.new("Floor")
        mesh.from_pydata(vertices, [], faces)
        obj = bpy.data.objects.new("Floor", mesh)
        bpy.context.collection.objects.link(obj)
        self.paint(obj, root, "floor")
        for polygon, color in zip(mesh.polygons, colors):
            for loop in polygon.loop_indices:
                mesh.uv_layers.active.data[loop].uv = ((self.palette.index(color)+0.5)/32, 0.5)

    def technician(self, root):
        module = importlib.util.spec_from_file_location(
            "cs3_technician", Path(__file__).with_name("technician.py"))
        technician = importlib.util.module_from_spec(module)
        module.loader.exec_module(technician)
        return technician.build(self, root)

    def coolant(self, root):
        self.shape(root, (0,0,0.005), (0.86,0.70,0.01), "teal", kind="cylinder")
        self.shape(root, (-0.05,0.02,0.011), (0.60,0.43,0.002), "coolant-light", kind="cylinder")
        for x, y, radius in [(0.25,0.15,0.13),(-0.27,-0.16,0.12),(0.2,-0.22,0.1)]:
            self.shape(root, (x,y,0.005), (radius*2,radius*2,0.008), "teal", kind="cylinder")

    def animate(self, nodes):
        bpy = self.bpy
        rest = {n.name: (tuple(n.location), tuple(n.rotation_euler)) for n in nodes}
        for mode, frames in CLIPS:
            for obj in nodes:
                obj.animation_data_create()
                obj.animation_data.action = bpy.data.actions.new(f"{mode}-{obj.name}")
                for frame in range(frames[0], frames[1] + 1):
                    phase = (frame-1)/(frames[1]-1)*math.tau
                    obj.location, obj.rotation_euler = rest[obj.name]
                    if mode == "Idle":
                        if obj.name == "Torso":
                            obj.location.z += 0.004*math.sin(phase)
                    elif mode == "Walk":
                        sign = -1 if obj.name.endswith("L") else 1
                        wave = math.sin(phase)*sign
                        if obj.name == "Hips":
                            obj.location.z += 0.009*(1-math.cos(phase*2))
                        elif obj.name.startswith("Thigh"):
                            obj.rotation_euler.x = wave*0.22
                        elif obj.name.startswith("Shin"):
                            obj.rotation_euler.x = max(0,wave)*0.20
                        elif obj.name.startswith("Foot"):
                            obj.rotation_euler.x = -wave*0.22-max(0,wave)*0.20
                        elif obj.name.startswith("UpperArm"):
                            obj.rotation_euler.x = -wave*0.32
                        elif obj.name.startswith("Forearm"):
                            obj.rotation_euler.x = -0.13
                    elif mode == "Repair":
                        if obj.name == "Torso":
                            obj.rotation_euler.x = 0.06
                        elif obj.name.startswith("UpperArm"):
                            obj.rotation_euler.x = -0.48+0.035*math.sin(phase)
                        elif obj.name.startswith("Forearm"):
                            obj.rotation_euler.x = -0.40+0.065*math.sin(phase+math.pi/2)
                        elif obj.name == "Head":
                            obj.rotation_euler.x = 0.13
                    obj.keyframe_insert(data_path="location", frame=frame)
                    obj.keyframe_insert(data_path="rotation_euler", frame=frame)
                action, slot = obj.animation_data.action, obj.animation_data.action_slot
                for layer in action.layers:
                    for action_strip in layer.strips:
                        for curve in action_strip.channelbag(slot).fcurves:
                            for key in curve.keyframe_points:
                                key.interpolation = "LINEAR"
                track = obj.animation_data.nla_tracks.new()
                track.name = mode
                strip = track.strips.new(mode, frames[0], action)
                strip.action_slot = slot
                strip.extrapolation = "NOTHING"
                strip.blend_type = "REPLACE"
                obj.animation_data.action = None
                track.mute = True
                obj.location, obj.rotation_euler = rest[obj.name]


def main(spec_file, output):
    import bpy
    spec = json.loads(spec_file.read_text())
    validate_spec(spec)
    output = owned_output(output)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system, scene.unit_settings.scale_length = "METRIC", 1
    scene.render.fps, scene.render.fps_base = 30, 1
    scene.frame_start, scene.frame_end = 1, 61
    scene.view_settings.view_transform, scene.view_settings.look = "Standard", "None"
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    builder = Builder(spec, output)
    animated = []
    for asset in spec["assets"]:
        builder.material = asset["material"]
        root = builder.node(asset["root"])
        if asset["id"] == "floor-slab":
            builder.floor(root)
        elif asset["id"] in ("rack-standard", "cooling-unit"):
            builder.equipment(root, asset["id"] == "cooling-unit")
        elif asset["id"] == "technician-man":
            animated = builder.technician(root)
        else:
            builder.coolant(root)
    builder.join()
    builder.animate(animated)
    scene.frame_set(1)
    source = output / "library.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    write_json(output / "authoring.json", {
        "schema": 1, "complete": True, "sourceSha256": checksum(source),
        "inputs": {"blender/build_library.py": checksum(__file__), "blender/asset_spec.json": checksum(spec_file),
                   "blender/technician.py": checksum(Path(__file__).with_name("technician.py")),
                   f"{spec['texture']['name']}.png": checksum(output/f"{spec['texture']['name']}.png")},
        "blender": bpy.app.version_string, "blenderBuild": bpy.app.build_hash.decode(),
        "roots": list(ROOTS), "animatedNodes": [n.name for n in animated],
        "rest": {n.name: {"location": list(n.location), "rotation": list(n.rotation_euler),
                         "scale": list(n.scale)} for n in animated},
        "publication": "candidate only; technical and delegated appearance qualification pending"
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    main(args.spec.resolve(), args.output)
