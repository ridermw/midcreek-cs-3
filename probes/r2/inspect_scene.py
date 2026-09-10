"""Read an owned scene copy and emit the inventory needed to bound the probe."""

import hashlib
import json
from pathlib import Path
import sys

import bpy

source, output = map(Path, sys.argv[sys.argv.index("--") + 1:])
bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
scene = bpy.context.scene
properties = {}
for prop in bpy.ops.export_scene.gltf.get_rna_type().properties:
    if prop.type == "ENUM":
        properties[prop.identifier] = [item.identifier for item in prop.enum_items]
    elif prop.identifier != "rna_type":
        properties[prop.identifier] = str(prop.default) if hasattr(prop, "default") else prop.type
record = {
    "blender": bpy.app.version_string, "build_hash": bpy.app.build_hash.decode(),
    "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "units": {"system": scene.unit_settings.system, "scale": scene.unit_settings.scale_length},
    "fps": scene.render.fps, "fps_base": scene.render.fps_base,
    "frames": [scene.frame_start, scene.frame_end],
    "view": {"transform": scene.view_settings.view_transform,
             "look": scene.view_settings.look, "exposure": scene.view_settings.exposure},
    "objects": [{"name": o.name, "type": o.type, "parent": o.parent.name if o.parent else None,
                 "vertices": len(o.data.vertices) if o.type == "MESH" else None,
                 "materials": [s.material.name for s in o.material_slots],
                 "animated": bool(o.animation_data), "location": list(o.location)}
                for o in sorted(scene.objects, key=lambda o: o.name)],
    "materials": [{"name": m.name, "nodes": [n.type for n in m.node_tree.nodes]}
                  for m in bpy.data.materials if m.use_nodes],
    "images": [{"name": im.name, "size": list(im.size),
                "packed_sha256": hashlib.sha256(im.packed_file.data).hexdigest()
                if im.packed_file else None} for im in bpy.data.images],
    "exporter_properties": properties,
}
output.write_text(json.dumps(record, indent=2) + "\n")
print("R2_INVENTORY_COMPLETE")
