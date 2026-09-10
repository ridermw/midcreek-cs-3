"""R2 only: select retained geometry, compare direct export and explicit adaptation."""

import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

EXPECTED = "0e4c90b1ab5bcfb052d2f5d2c5c4628a89b5b7145f6b6e9bf399d7f31cda4d05"
ROLES = {
    "Hero car path": "Hero",
    "Hero.FrontL.Hub": "Wheel",
    "Hero.FrontL.Rubber tire": "Tire",
    "Hero.FrontL.Split spoke 0 -1": "Spoke",
    "Hero.Floating red roof": "Roof",
    "Hero.Broad rising diffuser tray": "Carbon",
    "Original market sign": "Sign",
    "Brick facades 0": "Brick",
}
FRAMES = (1, 61, 120)
BRICK_IMAGES = {
    "Bricks059_1K-JPG_Color.jpg": "22b53ec9143b348ae26ed958cdfaa8977195c8daf534dc219f72dd10f2728e7a",
    "Bricks059_1K-JPG_Roughness.jpg": "58b905709e5d42451ab5aede42b386ceb442a21f979bb308eff77336db712b84",
    "Bricks059_1K-JPG_Displacement.jpg": "09f231db731e774b915027cdd777f9fd361173dfcc9bd725b289e4d54b344765",
}
AXIS = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def checksum(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def matrix_values(matrix):
    return [matrix[row][column] for column in range(4) for row in range(4)]


def local_corners(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    if not mesh or not mesh.vertices:
        raise ValueError(f"EMPTY_EVALUATED_GEOMETRY: {obj.name}")
    ranges = [(min(v.co[i] for v in mesh.vertices), max(v.co[i] for v in mesh.vertices))
              for i in range(3)]
    evaluated.to_mesh_clear()
    return list(itertools.product(*ranges))


def bounds(obj):
    points = [AXIS @ obj.matrix_world @ Vector((*corner, 1))
              for corner in local_corners(obj)]
    return [[min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)]]


def inventory(objects):
    result = {}
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        entry = {"type": obj.type, "parent": obj.parent.name if obj.parent else None,
                 "matrix_world": matrix_values(AXIS @ obj.matrix_world @ AXIS.inverted()),
                 "matrix_local": matrix_values(AXIS @ obj.matrix_local @ AXIS.inverted()),
                 "materials": [slot.material.name for slot in obj.material_slots]}
        if obj.type in {"MESH", "FONT"}:
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh()
            mesh.calc_loop_triangles()
            entry["triangles"] = len(mesh.loop_triangles)
            evaluated.to_mesh_clear()
            entry["bounds"] = bounds(obj)
        result[obj.name] = entry
    return result


def material_records(objects):
    result = {}
    for material in {slot.material for obj in objects for slot in obj.material_slots}:
        shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        result[material.name] = {
            "base_color": None if shader.inputs["Base Color"].is_linked
            else list(shader.inputs["Base Color"].default_value),
            "roughness": None if shader.inputs["Roughness"].is_linked
            else shader.inputs["Roughness"].default_value,
            "metallic": shader.inputs["Metallic"].default_value,
            "clearcoat": shader.inputs["Coat Weight"].default_value,
            "nodes": [n.type for n in material.node_tree.nodes],
        }
    return result


def bake_color(obj, output):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if len(obj.data.materials) != 1:
        raise ValueError(f"BAKE_CONTRACT: one material required on {obj.name}")
    uv = obj.data.uv_layers.new(name="R2UV")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.035)
    bpy.ops.object.mode_set(mode="OBJECT")
    material = obj.data.materials[0]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    surface = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    original = surface.inputs["Surface"].links[0].from_socket
    emission = nodes.new("ShaderNodeEmission")
    base = bsdf.inputs["Base Color"]
    if not base.is_linked:
        raise ValueError(f"BAKE_CONTRACT: expected procedural/image base on {obj.name}")
    links.new(base.links[0].from_socket, emission.inputs["Color"])
    links.new(emission.outputs[0], surface.inputs["Surface"])
    image = bpy.data.images.new(f"{obj.name}Base", width=256, height=256, alpha=False)
    image.colorspace_settings.name = "sRGB"
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    scene = bpy.context.scene
    scene.cycles.samples = 1
    bpy.ops.object.bake(type="EMIT", margin=4, use_clear=True)
    links.new(original, surface.inputs["Surface"])
    nodes.remove(emission)
    for link in list(base.links):
        links.remove(link)
    links.new(target.outputs["Color"], base)
    for name in ("Roughness", "Normal"):
        for link in list(bsdf.inputs[name].links):
            links.remove(link)
    bsdf.inputs["Roughness"].default_value = 0.65
    image.filepath_raw = str(output / f"{obj.name}-base.png")
    image.file_format = "PNG"
    image.save()
    image.pack()
    return {"object": obj.name, "image": image.name, "size": [256, 256],
            "sha256": checksum(image.filepath_raw), "pass": "EMIT", "samples": 1,
            "uv": uv.name, "roughness": 0.65, "normal": "source bump omitted",
            "classification": "reconstructed base-color bake; approximated roughness"}


def camera_for(objects, label):
    scene = bpy.context.scene
    points = [o.matrix_world @ Vector(c) for o in objects for c in local_corners(o)]
    lower = Vector([min(p[i] for p in points) for i in range(3)])
    upper = Vector([max(p[i] for p in points) for i in range(3)])
    center = (lower + upper) / 2
    radius = max((upper - lower).length / 2, 0.25)
    camera = scene.camera
    # Fixed framing per role; both renderers consume the resulting exact camera matrix.
    direction = Vector((1, -1.6, 0.9)).normalized()
    if label == "sign":
        direction = objects[0].matrix_world.to_quaternion() @ Vector((0, 0, 1))
    camera.location = center + direction * radius * 3.4
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = radius * 3.8
    camera.data.clip_start, camera.data.clip_end = 0.01, 1000
    bpy.context.view_layer.update()
    return {"matrix_world": matrix_values(AXIS @ camera.matrix_world),
            "ortho_width": camera.data.ortho_scale,
            "near": 0.01, "far": 1000, "size": [640, 360]}


def capture(objects, output, variant):
    scene = bpy.context.scene
    result = []
    requests = [("hero", frame, [o for o in objects if o.name in
                                {"Tire", "Spoke", "Roof", "Carbon"}]) for frame in FRAMES]
    requests += [("brick", 1, [bpy.data.objects["Brick"]]),
                 ("sign", 1, [bpy.data.objects["Sign"]]),
                 ("carbon", 1, [bpy.data.objects["Carbon"]])]
    requests += [("wheel", frame, [bpy.data.objects["Tire"], bpy.data.objects["Spoke"]])
                 for frame in FRAMES]
    requests += [("brick-standard", 1, [bpy.data.objects["Brick"]])]
    original_view = (scene.view_settings.view_transform, scene.view_settings.look,
                     scene.view_settings.exposure)
    scene.cycles.samples = 16
    for label, frame, focus in requests:
        profile = "standard" if label.endswith("-standard") else "source-agx"
        if profile == "standard":
            scene.view_settings.view_transform = "Standard"
            scene.view_settings.look = "None"
            scene.view_settings.exposure = 0
        else:
            scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure = original_view
        scene.frame_set(frame)
        for obj in objects:
            obj.hide_render = obj not in focus and obj.type != "EMPTY"
        camera = camera_for(focus, label)
        filename = f"{variant}-{label}-{frame}.png"
        scene.render.filepath = str(output / filename)
        bpy.ops.render.render(write_still=True)
        result.append({"label": label, "profile": profile, "frame": frame, "time": (frame - 1) / 24,
                       "visible": [o.name for o in focus],
                       "camera": camera, "file": filename, "sha256": checksum(output / filename)})
    for obj in objects:
        obj.hide_render = False
    scene.frame_set(1)
    scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure = original_view
    return result


def export(output, filename):
    settings = dict(
        export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_cameras=False, export_lights=False, export_extras=False,
        export_animations=True, export_animation_mode="SCENE",
        export_anim_scene_split_object=False, export_frame_range=True, export_frame_step=1,
        export_force_sampling=True, export_anim_slide_to_zero=True,
        export_optimize_animation_size=False, export_morph=False, export_skins=False,
        export_image_format="AUTO", will_save_settings=False,
    )
    bpy.ops.export_scene.gltf(filepath=str(output / filename), **settings)
    if not (output / filename).is_file():
        raise RuntimeError("EXPORT_MISSING")
    return settings


def main(source, output):
    if checksum(source) != EXPECTED:
        raise ValueError("SOURCE_IDENTITY: wrong scene")
    if source.resolve() == output.resolve() or not source.resolve().parent == output.resolve().parent:
        raise ValueError("OWNED_COPY_REQUIRED: source and fresh run must share owned root")
    output.mkdir(exist_ok=False)
    bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
    scene = bpy.context.scene
    if (scene.render.fps, scene.render.fps_base, scene.frame_start, scene.frame_end) != (24, 1, 1, 120):
        raise ValueError("SOURCE_TIMING")
    if scene.unit_settings.scale_length != 1:
        raise ValueError("SOURCE_UNITS")
    missing = set(ROLES) - set(scene.objects.keys())
    if missing:
        raise ValueError(f"SOURCE_CONTENT: {sorted(missing)}")
    source_images = [{"name": i.name, "sha256": hashlib.sha256(i.packed_file.data).hexdigest()}
                     for i in bpy.data.images if i.packed_file]
    observed_images = {i["name"]: i["sha256"] for i in source_images}
    for name, expected in BRICK_IMAGES.items():
        if observed_images.get(name) != expected:
            raise ValueError(f"SOURCE_TEXTURE_IDENTITY: {name}")
    for obj in list(scene.objects):
        if obj.name not in ROLES:
            bpy.data.objects.remove(obj, do_unlink=True)
    objects = list(scene.objects)
    for obj in objects:
        obj.name = ROLES[obj.name]
        if obj.data:
            obj.data.name = obj.name
    brick = bpy.data.objects["Brick"]
    old = brick.data
    faces = [list(p.vertices) for p in old.polygons if all(v < 8 for v in p.vertices)]
    if len(faces) != 6:
        raise ValueError("BRICK_SUBSET: expected first connected box")
    mesh = bpy.data.meshes.new("BrickSubset")
    mesh.from_pydata([v.co for v in old.vertices[:8]], [], faces)
    mesh.materials.append(old.materials[0])
    brick.data = mesh
    for obj in objects:
        obj.hide_set(False)
        obj.hide_render = False
    scene.frame_set(1)
    source_settings = {"engine": scene.render.engine, "view": scene.view_settings.view_transform,
                       "look": scene.view_settings.look, "exposure": scene.view_settings.exposure}
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.seed = 42
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.resolution_x, scene.render.resolution_y = 640, 360
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("R2Studio")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.12, 0.12, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.5
    sun_data = bpy.data.lights.new("R2Sun", "SUN")
    sun_data.energy = 3
    sun = bpy.data.objects.new("R2Sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(25), math.radians(-20), math.radians(-30))
    camera = bpy.data.objects.new("R2Camera", bpy.data.cameras.new("R2Camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    poses = []
    source_materials = material_records(objects)
    for frame in FRAMES:
        scene.frame_set(frame)
        poses.append({"frame": frame, "time": (frame - 1) / 24, "objects": inventory(objects)})
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "source-sample.blend"))
    source_captures = capture(objects, output, "source")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    settings = export(output, "direct.glb")
    sign = bpy.data.objects["Sign"]
    bpy.ops.object.select_all(action="DESELECT")
    sign.select_set(True)
    bpy.context.view_layer.objects.active = sign
    bpy.ops.object.convert(target="MESH")
    objects = [scene.objects[name] for name in ROLES.values()]
    conversions = [bake_color(scene.objects[name], output) for name in ("Brick", "Carbon")]
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "portable-sample.blend"))
    portable_captures = capture(objects, output, "portable")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    export(output, "portable.glb")
    direction = AXIS.to_3x3() @ (sun.matrix_world.to_quaternion() @ Vector((0, 0, -1)))
    record = {
        "schema": 1, "complete": True, "source_sha256": checksum(source),
        "script_sha256": checksum(__file__), "blender": bpy.app.version_string,
        "build_hash": bpy.app.build_hash.decode(), "source_roles": ROLES,
        "selection": "8 objects; Brick first 8 vertices / 6 faces, other selected objects unchanged",
        "source_images": source_images, "units": "meters", "axis": "Blender (x,y,z) -> glTF (x,z,-y)",
        "source_settings": source_settings, "settings": settings,
        "animation": {"fps": 24, "start": 1, "end": 120, "duration": 119 / 24,
                      "name": scene.name, "video_duration_not_clip_duration": 5},
        "poses": poses, "conversions": conversions,
        "source_materials": source_materials, "portable_materials": material_records(objects),
        "lighting": {"sun_direction": list(direction), "sun_energy": 3,
                     "world_linear_rgb": [0.12, 0.12, 0.12], "world_strength": 0.5,
                     "scope": "reconstructed neutral probe studio, not the delivered street lighting"},
        "captures": {"source": source_captures, "portable": portable_captures},
        "artifacts": {p.name: {"sha256": checksum(p), "bytes": p.stat().st_size}
                      for p in sorted(output.iterdir()) if p.is_file()},
    }
    if record["source_sha256"] != EXPECTED:
        raise ValueError("SOURCE_CHANGED")
    write(output / "export.json", record)
    print("R2_EXPORT_COMPLETE", json.dumps(record["artifacts"]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    main(args.source, args.output)
