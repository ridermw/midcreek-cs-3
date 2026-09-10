"""Isolate base-color reconstruction from lighting, roughness and tone mapping."""

import json
import hashlib
from pathlib import Path
import sys

import bpy
from mathutils import Matrix

arguments = sys.argv[sys.argv.index("--") + 1:]
run = Path(arguments[0]).resolve()
receipt = json.loads((run / "export.json").read_text())
output = run / (arguments[1] if len(arguments) > 1 else "emission-diagnostic")
if output.resolve().parent != run:
    raise ValueError("DIAGNOSTIC_OUTPUT_ESCAPE")
output.mkdir(exist_ok=False)
axis = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
records = []
for variant in ("source", "portable"):
    for role in ("Brick", "Carbon"):
        bpy.ops.wm.open_mainfile(filepath=str(run / f"{variant}-sample.blend"), use_scripts=False)
        scene = bpy.context.scene
        capture = next(c for c in receipt["captures"][variant] if c["label"] == role.lower())
        for obj in scene.objects:
            if obj.type in {"MESH", "FONT"}:
                obj.hide_render = obj.name != role
        obj = scene.objects[role]
        material = obj.material_slots[0].material
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
        output_node = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
        emission = nodes.new("ShaderNodeEmission")
        base = bsdf.inputs["Base Color"]
        if not base.is_linked:
            raise ValueError(f"BASE_COLOR_UNLINKED: {variant}/{role}")
        links.new(base.links[0].from_socket, emission.inputs["Color"])
        links.new(emission.outputs[0], output_node.inputs["Surface"])
        values = capture["camera"]["matrix_world"]
        camera_matrix = Matrix([[values[c * 4 + r] for c in range(4)] for r in range(4)])
        scene.camera.matrix_world = axis.inverted() @ camera_matrix
        scene.camera.data.type = "ORTHO"
        scene.camera.data.ortho_scale = capture["camera"]["ortho_width"]
        scene.camera.data.clip_start = capture["camera"]["near"]
        scene.camera.data.clip_end = capture["camera"]["far"]
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
        scene.view_settings.exposure = 0
        scene.cycles.samples = 16
        scene.frame_set(1)
        scene.render.filepath = str(output / f"{variant}-{role}.png")
        bpy.ops.render.render(write_still=True)
        records.append({"variant": variant, "role": role, "file": f"{variant}-{role}.png",
                        "sha256": hashlib.sha256(Path(scene.render.filepath).read_bytes()).hexdigest(),
                        "camera": capture["camera"]})
(output / "diagnostic.json").write_text(json.dumps({
    "scope": "base-color emission only; lighting/roughness/bump excluded; Standard, no look, exposure 0",
    "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "inputs": {name: hashlib.sha256((run / name).read_bytes()).hexdigest()
               for name in ["source-sample.blend", "portable-sample.blend", "export.json"]},
    "records": records,
}, indent=2) + "\n")
print("R2_MATERIAL_DIAGNOSTIC_COMPLETE")
