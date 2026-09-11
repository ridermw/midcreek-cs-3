import copy
import importlib.util
import json
from pathlib import Path
import sys
import unittest

try:
    import bpy
except ModuleNotFoundError as error:
    if error.name != "bpy":
        raise
    bpy = None

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("library", ROOT / "blender/build_library.py")
library = importlib.util.module_from_spec(spec)
spec.loader.exec_module(library)


class SpecificationTests(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT / "blender/asset_spec.json").read_text())

    def test_declares_only_five_visual_templates_and_exact_rigid_clips(self):
        library.validate_spec(self.spec)
        self.assertEqual(len(self.spec["assets"]), 5)
        actor = next(a for a in self.spec["assets"] if a["id"] == "technician-man")
        self.assertEqual([(c["name"], c["frames"]) for c in actor["clips"]],
                         [("Idle", [1, 61]), ("Walk", [1, 31]), ("Repair", [1, 61])])
        self.assertNotIn("placements", self.spec)
        self.assertNotIn("collision", self.spec)

    def test_rejects_geometry_identity_units_and_animation_drift(self):
        for field, value in [("units", "centimeters"), ("front", "+Y"), ("schema", 2)]:
            changed = copy.deepcopy(self.spec)
            changed[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "SPEC"):
                library.validate_spec(changed)
        for mutate in [
            lambda s: s["assets"].pop(),
            lambda s: s["assets"].append(s["assets"][0]),
            lambda s: s["assets"][-2]["clips"][1].update(frames=[1, 32]),
            lambda s: s["assets"][-2]["clips"][0].update(fps=24),
            lambda s: s["assets"][-2]["clips"][0].update(rootMotion=True),
            lambda s: s["assets"][1].update(root="FloorRoot"),
            lambda s: s.update(placements=[]),
        ]:
            changed = copy.deepcopy(self.spec)
            mutate(changed)
            with self.subTest(mutate=mutate), self.assertRaisesRegex(ValueError, "SPEC"):
                library.validate_spec(changed)

    def test_palette_png_is_deterministic_and_explicitly_srgb(self):
        png = library.palette_png(self.spec)
        self.assertEqual(png, library.palette_png(self.spec))
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(int.from_bytes(png[16:20], "big"), 256)
        self.assertEqual(int.from_bytes(png[20:24], "big"), 8)
        self.assertIn(b"sRGB", png)


@unittest.skipUnless(bpy, "requires a real Blender process and owned library source")
class EvaluatedLibraryTests(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads((ROOT / "blender/asset_spec.json").read_text())
        self.record = json.loads(Path(bpy.data.filepath).with_name("authoring.json").read_text())
        library.activate_clip(self.record, None)

    def bounds(self, root):
        points = []
        graph = bpy.context.evaluated_depsgraph_get()
        for obj in root.children_recursive:
            if obj.type != "MESH":
                continue
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh()
            self.assertGreater(len(mesh.vertices), 0, obj.name)
            for vertex in mesh.vertices:
                x, y, z = evaluated.matrix_world @ vertex.co
                points.append((x, z, -y))
            evaluated.to_mesh_clear()
        self.assertTrue(points, root.name)
        return [[min(p[i] for p in points) for i in range(3)],
                [max(p[i] for p in points) for i in range(3)]]

    def assert_envelope(self, observed, allowed, subject):
        for axis in range(3):
            self.assertGreaterEqual(observed[0][axis], allowed[0][axis]-2e-4, subject)
            self.assertLessEqual(observed[1][axis], allowed[1][axis]+2e-4, subject)

    def test_exact_nodes_units_portable_materials_uv_and_identity_roots(self):
        scene = bpy.context.scene
        self.assertEqual(scene.unit_settings.scale_length, 1)
        self.assertEqual((scene.render.fps, scene.render.fps_base), (30, 1))
        expected = set(library.ROOTS)
        expected.update(f"{r}Mesh" for r in library.ROOTS if r != "TechnicianRoot")
        expected.update(self.record["animatedNodes"])
        expected.update(f"{n}Mesh" for n in self.record["animatedNodes"])
        self.assertEqual(set(scene.objects.keys()), expected)
        for root in library.ROOTS:
            obj = scene.objects[root]
            self.assertIsNone(obj.parent)
            self.assertIsNone(obj.animation_data)
            self.assertEqual(tuple(obj.location), (0, 0, 0))
            self.assertEqual(tuple(obj.rotation_euler), (0, 0, 0))
            self.assertEqual(tuple(obj.scale), (1, 1, 1))
        for obj in scene.objects:
            self.assertEqual(tuple(obj.scale), (1, 1, 1), obj.name)
            self.assertFalse(obj.constraints, obj.name)
            self.assertFalse(obj.modifiers, obj.name)
            if obj.type == "MESH":
                self.assertIsNone(obj.data.shape_keys)
                self.assertEqual(len(obj.data.materials), 1)
                self.assertEqual(obj.data.uv_layers.active.name, "PaletteUV")
                material = obj.data.materials[0]
                self.assertEqual(set(n.type for n in material.node_tree.nodes),
                                 {"OUTPUT_MATERIAL", "BSDF_PRINCIPLED", "TEX_IMAGE"})
                image = next(n.image for n in material.node_tree.nodes if n.type == "TEX_IMAGE")
                self.assertEqual(tuple(image.size), (256, 8))
                self.assertEqual(image.colorspace_settings.name, "sRGB")
                self.assertTrue(image.packed_file)

    def test_evaluated_rest_geometry_meets_bounds_and_exact_heights(self):
        for asset in self.spec["assets"]:
            bounds = self.bounds(bpy.data.objects[asset["root"]])
            self.assert_envelope(bounds, asset["restBounds"], asset["id"])
            if asset["id"] in ("rack-standard", "cooling-unit", "technician-man"):
                self.assertAlmostEqual(bounds[1][1], asset["restBounds"][1][1], delta=2e-4)
                self.assertAlmostEqual(bounds[0][1], 0, delta=2e-4)

    def test_three_named_rigid_tracks_and_duplicate_loop_end_poses(self):
        nodes = [bpy.data.objects[n] for n in self.record["animatedNodes"]]
        for obj in nodes:
            self.assertEqual([t.name for t in obj.animation_data.nla_tracks], ["Idle", "Walk", "Repair"])
            for track, (_, frames) in zip(obj.animation_data.nla_tracks, library.CLIPS):
                self.assertEqual(len(track.strips), 1)
                strip = track.strips[0]
                self.assertEqual((strip.frame_start, strip.frame_end), tuple(frames))
                for layer in strip.action.layers:
                    for action_strip in layer.strips:
                        for curve in action_strip.channelbag(strip.action_slot).fcurves:
                            self.assertEqual(set(k.interpolation for k in curve.keyframe_points), {"LINEAR"})
        for name, frames in library.CLIPS:
            library.activate_clip(self.record, name)
            bpy.context.scene.frame_set(frames[0])
            start = {n.name: tuple(v for row in n.matrix_world for v in row) for n in nodes}
            bpy.context.scene.frame_set(frames[1])
            for obj in nodes:
                end = tuple(v for row in obj.matrix_world for v in row)
                self.assertLess(max(abs(a-b) for a,b in zip(start[obj.name],end)), 1e-6, f"{name}/{obj.name}")

    def test_all_exported_keys_and_midpoints_fit_conservative_swept_envelope(self):
        actor = self.spec["assets"][3]
        root = bpy.data.objects[actor["root"]]
        for name, frames in library.CLIPS:
            library.activate_clip(self.record, name)
            if name == "Walk":
                bpy.context.scene.frame_set(8)
                self.assertGreater(abs(bpy.data.objects["ThighL"].rotation_euler.x), 0.2, "walk must actually animate")
            for half in range((frames[1]-1)*2+1):
                bpy.context.scene.frame_set(1+half//2, subframe=(half % 2)/2)
                self.assert_envelope(self.bounds(root), actor["animatedBounds"], f"{name}/{half/2}")


if __name__ == "__main__":
    if "--" in sys.argv:
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--source", type=Path, required=True)
        parser.add_argument("--sha256", required=True)
        args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
        if library.checksum(args.source) != args.sha256:
            raise ValueError("SOURCE_IDENTITY")
        bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()), use_scripts=False)
        result = unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
        if not result.wasSuccessful():
            raise RuntimeError("BLENDER_LIBRARY_TEST_FAILURE")
    else:
        unittest.main()
