"""Matched asset-centered views of the actual owned portable-PBR source."""

import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import sys

import bpy
from mathutils import Matrix, Vector

CODE = Path(__file__).resolve().parent
sys.path.insert(0, str(CODE))
from export_receipt import load_technical

module = importlib.util.spec_from_file_location("cs3_builder", CODE / "build_library.py")
builder = importlib.util.module_from_spec(module)
module.loader.exec_module(builder)
AXIS = Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))


def linear(hex_color):
    values = [int(hex_color[i:i+2], 16)/255 for i in (1,3,5)]
    return [v/12.92 if v <= 0.04045 else ((v+0.055)/1.055)**2.4 for v in values]


def matrix_values(matrix):
    return [matrix[row][column] for column in range(4) for row in range(4)]


def setup():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device, scene.cycles.samples = "CPU", 128
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 640, 360, 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.view_settings.view_transform, scene.view_settings.look = "Standard", "None"
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    world = bpy.data.worlds.new("CS3 comparison fill")
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    coordinates = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    remap = nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1
    remap.inputs["From Max"].default_value = 1
    mix = nodes.new("ShaderNodeMixRGB")
    mix.inputs[1].default_value = (*linear("#DEE6EB"),1)
    mix.inputs[2].default_value = (*linear("#9FD0F0"),1)
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = 1
    camera_background = nodes.new("ShaderNodeBackground")
    camera_background.inputs["Color"].default_value = (*linear("#E7EDF1"),1)
    light_path = nodes.new("ShaderNodeLightPath")
    ray_mix = nodes.new("ShaderNodeMixShader")
    output = nodes.new("ShaderNodeOutputWorld")
    links.new(coordinates.outputs["Normal"], separate.inputs[0])
    links.new(separate.outputs["Z"], remap.inputs["Value"])
    links.new(remap.outputs[0], mix.inputs[0])
    links.new(mix.outputs[0], background.inputs["Color"])
    links.new(light_path.outputs["Is Camera Ray"], ray_mix.inputs[0])
    links.new(background.outputs[0], ray_mix.inputs[1])
    links.new(camera_background.outputs[0], ray_mix.inputs[2])
    links.new(ray_mix.outputs[0], output.inputs["Surface"])
    scene.world = world
    light = bpy.data.lights.new("CS3 comparison key", "SUN")
    light.energy, light.angle = 2, 0.025
    sun = bpy.data.objects.new("CS3 comparison key", light)
    scene.collection.objects.link(sun)
    sun.location = (0,3,12)
    sun.rotation_euler = (-sun.location).to_track_quat("-Z", "Y").to_euler()
    camera = bpy.data.objects.new("CS3 comparison camera", bpy.data.cameras.new("CS3 comparison camera"))
    scene.collection.objects.link(camera)
    camera.data.type, camera.data.clip_start, camera.data.clip_end = "ORTHO", 0.01, 1000
    scene.camera = camera
    bpy.ops.mesh.primitive_plane_add(size=100, location=(0,0,-0.002))
    stage = bpy.context.object
    stage.name = "Comparison stage (not an exported asset)"
    material = bpy.data.materials.new("Comparison stage")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear("#DEE6EB"),1)
    shader.inputs["Roughness"].default_value = 0.85
    stage.data.materials.append(material)
    return camera, stage


def main(export_file, output):
    export_file, output = export_file.resolve(), output.resolve()
    if (not os.environ.get("CS3_JOB_ROOT") or output.parent != export_file.parent
            or not output.is_relative_to(CODE.parent/".artifacts/assets")
            or not re.fullmatch(r"[a-z0-9-]+", output.name)):
        raise ValueError("OWNED_CAPTURE_OUTPUT")
    receipt = load_technical(export_file)
    if receipt.get("kind") != "cs3-library-export" or not receipt.get("complete"):
        raise ValueError("EXPORT_INCOMPLETE")
    source = export_file.parent/"owned.blend"
    if builder.checksum(source) != receipt["sourceSha256"]:
        raise ValueError("SOURCE_IDENTITY")
    sidecar = export_file.parent.parent / "authoring.json"
    if builder.checksum(sidecar) != receipt["authoringReceiptSha256"]:
        raise ValueError("AUTHORING_IDENTITY")
    authoring = json.loads(sidecar.read_text())
    if authoring.get("complete") is not True or authoring.get("sourceSha256") != receipt["sourceSha256"]:
        raise ValueError("AUTHORING_IDENTITY")
    if builder.checksum(CODE / "build_library.py") != receipt["inputs"]["blender/build_library.py"]:
        raise ValueError("CAPTURE_INPUT_CHANGED")
    bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
    output.mkdir(exist_ok=False)
    camera, stage = setup()
    scene = bpy.context.scene
    captured = []
    roots = [bpy.data.objects[a["root"]] for a in receipt["assets"]]
    lighting = {
        "profile": "cs3-lighting-v1/asset-centered", "keyPosition": [0,12,-3], "keyTarget": [0,0,0],
        "keyColor": "#FFFFFF", "keyIntensity": 2, "sky": "#9FD0F0", "ground": "#DEE6EB",
        "hemisphereIntensity": 1, "background": "#E7EDF1", "stageColor": "#DEE6EB",
        "stageHeight": -0.002, "shadowMap": [1024,1024],
        "comparisonNote": "Cycles directional/environment illumination and WebGL directional/hemisphere fill are recorded approximations, not renderer equivalence."
    }
    for asset in receipt["assets"]:
        root = bpy.data.objects[asset["root"]]
        visible = [o.name for o in root.children_recursive if o.type == "MESH"]
        for other in roots:
            for child in other.children_recursive:
                child.hide_render = other != root
        requests = [(f"rest-{heading}", None, 0, heading, False) for heading in
                    ([45,135,225,315] if asset["clips"] else [45,225])]
        for clip in asset["clips"]:
            duration = clip["duration"]
            requests.extend((f"{clip['name'].lower()}-{label}", clip["name"], time, 45, repeat)
                            for label,time,repeat in [
                                ("start",0,False),("quarter",duration/4,False),
                                ("mid",duration/2,False),("end",duration,False),
                                ("loop-before",duration-1/60,True),("loop-after",duration+1/60,True)])
        bounds = asset["restBounds"]
        lower = Vector((bounds["min"]["x"],-bounds["max"]["z"],bounds["min"]["y"]))
        upper = Vector((bounds["max"]["x"],-bounds["min"]["z"],bounds["max"]["y"]))
        center, radius = (lower+upper)/2, max((upper-lower).length/2,0.3)
        for label, clip_name, time, heading, repeat in requests:
            builder.activate_clip(authoring, clip_name)
            source_time = time
            if repeat:
                duration = next(c["duration"] for c in asset["clips"] if c["name"] == clip_name)
                source_time %= duration
            frame = 1+source_time*30
            scene.frame_set(int(frame), subframe=frame % 1)
            angle = math.radians(heading)
            direction = Vector((math.sin(angle),-math.cos(angle),1/math.sqrt(2))).normalized()
            camera.location = center+direction*radius*4
            camera.rotation_euler = (center-camera.location).to_track_quat("-Z","Y").to_euler()
            camera.data.ortho_scale = radius*3.8
            stage.hide_render = asset["id"] == "floor-slab"
            bpy.context.view_layer.update()
            filename = f"{asset['id']}-{label}.png"
            scene.render.filepath = str(output/filename)
            bpy.ops.render.render(write_still=True)
            captured.append({
                "asset": asset["id"], "label": label, "clip": clip_name, "time": time,
                "sourceTime": source_time, "frame": frame, "repeat": repeat,
                "profile": "cs3-standard-v1", "lighting": lighting["profile"],
                "visible": visible, "stage": not stage.hide_render,
                "camera": {"matrix_world": matrix_values(AXIS@camera.matrix_world),
                           "ortho_width": camera.data.ortho_scale, "near": 0.01, "far": 1000, "size": [640,360]},
                "file": filename, "sha256": builder.checksum(output/filename),
            })
            builder.write_json(output/f"{filename}.capture.json", {
                "schema": 1, "kind": "cs3-image-capture", "renderer": "source",
                "sourceSha256": receipt["sourceSha256"], "capture": captured[-1],
            })
    builder.write_json(output/"captures.json", {
        "schema": 1, "complete": True, "kind": "cs3-library-source-captures",
        "exportSha256": builder.checksum(export_file), "sourceSha256": receipt["sourceSha256"],
        "authoringReceiptSha256": builder.checksum(sidecar),
        "builderSha256": builder.checksum(CODE / "build_library.py"),
        "scriptSha256": builder.checksum(__file__), "lighting": lighting,
        "receiptAdapterSha256": builder.checksum(CODE / "export_receipt.py"),
        "profile": "cs3-standard-v1", "renderer": {"engine": "Cycles", "device": "CPU", "samples": 128, "denoising": True,
            "blender": bpy.app.version_string, "build": bpy.app.build_hash.decode(),
            "viewTransform": "Standard", "look": "None", "exposure": 0, "gamma": 1, "display": "sRGB"},
        "materialAdaptation": receipt["specification"]["adaptation"],
        "sourceAndPortable": "The same intentionally authored portable-PBR scene; no separate bake or material-adapter pass is claimed.",
        "captures": captured,
    })
    if builder.checksum(source) != receipt["sourceSha256"]:
        raise ValueError("SOURCE_MUTATED")
    print(json.dumps({"complete": True, "captures": len(captured)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--export", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    main(args.export, args.output)
