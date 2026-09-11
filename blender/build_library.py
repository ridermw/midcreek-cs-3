"""Deterministic, editable CS3 visual templates; no hall placement or collision."""

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import sys

IDS = ("floor-slab", "rack-standard", "cooling-unit", "technician-man", "coolant-leak")
ROOTS = ("FloorRoot", "RackRoot", "CoolingRoot", "TechnicianRoot", "CoolantRoot")
CLIPS = (("Idle", [1, 61]), ("Walk", [1, 31]), ("Repair", [1, 61]))
WALK_SWING = 0.34


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
    if spec["texture"] != {"name": "CS3-Atlas", "width": 512, "height": 512, "uv": 0,
                           "role": "base-color", "colorSpace": "sRGB", "filter": "linear"}:
        raise ValueError("SPEC_TEXTURE")


def authoring_module(name):
    if name not in ("atlas", "profiles", "technician", "equipment"):
        raise ValueError("AUTHORING_MODULE")
    module = importlib.util.spec_from_file_location(f"cs3_{name}", Path(__file__).with_name(f"{name}.py"))
    loaded = importlib.util.module_from_spec(module)
    module.loader.exec_module(loaded)
    return loaded


def atlas_pixels(spec):
    return authoring_module("atlas").pixels(spec, authoring_module("profiles"))


def palette_png(spec):
    return authoring_module("atlas").png(atlas_pixels(spec))


def palette_coordinate(index, spec):
    return ((index*8+4)/spec["texture"]["width"], 1-4/spec["texture"]["height"])


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
        self.profiles = authoring_module("profiles")
        self.atlas = authoring_module("atlas")
        palette = output / f"{spec['texture']['name']}.png"
        palette.write_bytes(palette_png(spec))
        image = bpy.data.images.load(str(palette))
        image.name = spec["texture"]["name"]
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
            texture.interpolation = "Linear"
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
        coordinate = palette_coordinate(self.palette.index(color), self.spec)
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

    def tube(self, parent, points, radius, color, closed=False, resolution=1):
        bpy = self.bpy
        curve = bpy.data.curves.new("Tube", "CURVE")
        curve.dimensions, curve.resolution_u = "3D", 1
        curve.bevel_depth, curve.bevel_resolution = radius, resolution
        curve.use_fill_caps = not closed
        spline = curve.splines.new("POLY")
        if closed:
            if all(abs(a-b) <= 1e-9 for a,b in zip(points[0],points[-1])):
                points = points[:-1]
            spline.use_cyclic_u = True
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
        return authoring_module("equipment").build(self, root, cooling)

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
                mesh.uv_layers.active.data[loop].uv = palette_coordinate(self.palette.index(color),self.spec)

    def technician(self, root):
        return authoring_module("technician").build(self, root)

    def coolant(self, root):
        return authoring_module("equipment").build_coolant(self, root)

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
                            support_offsets = []
                            for suffix, side in (("L",-1),("R",1)):
                                step = math.sin(phase)*side
                                thigh = step*WALK_SWING
                                knee = max(0,step)*0.20
                                upper = -rest[f"Shin{suffix}"][0][2]
                                lower = -rest[f"Foot{suffix}"][0][2]
                                support_offsets.append(upper*(math.cos(thigh)-1)
                                                       + lower*(math.cos(thigh+knee)-1))
                            # One millimeter clears the between-key chord error of linear tracks.
                            obj.location.z += max(support_offsets)+0.001
                        elif obj.name.startswith("Thigh"):
                            obj.rotation_euler.x = wave*WALK_SWING
                        elif obj.name.startswith("Shin"):
                            obj.rotation_euler.x = max(0,wave)*0.20
                        elif obj.name.startswith("Foot"):
                            obj.rotation_euler.x = -wave*WALK_SWING-max(0,wave)*0.20
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
                   "blender/atlas.py": checksum(Path(__file__).with_name("atlas.py")),
                   "blender/profiles.py": checksum(Path(__file__).with_name("profiles.py")),
                   "blender/equipment.py": checksum(Path(__file__).with_name("equipment.py")),
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
