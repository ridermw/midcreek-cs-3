import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
module = importlib.util.spec_from_file_location("builder", ROOT / "blender/build_library.py")
builder = importlib.util.module_from_spec(module)
module.loader.exec_module(builder)


class AtlasTests(unittest.TestCase):
    def test_conforming_garment_and_face_marks_are_owned_opaque_texels(self):
        spec = json.loads((ROOT / "blender/asset_spec.json").read_text())
        pixels = builder.atlas_pixels(spec)
        width, height = spec["texture"]["width"], spec["texture"]["height"]
        self.assertEqual((width, height), (512, 512))
        self.assertEqual(len(pixels), width * height * 4)
        self.assertTrue(all(alpha == 255 for alpha in pixels[3::4]))
        self.assertEqual(pixels, builder.atlas_pixels(spec))
        atlas = builder.authoring_module("atlas")
        for chart, u, z, color in [
            ("torso", 0.25, 0.20, "lime"),
            ("torso", 0.25, 0.13, "silver"),
            ("torso", 0.75, 0.32, "shirt"),
            ("head", 0.25, 0.10, "hair"),
            ("head", 0.75, -0.04, "skin"),
        ]:
            with self.subTest(chart=chart, color=color):
                uv = atlas.chart_uv(chart, u, z)
                x = int(uv[0] * width)
                y = int((1 - uv[1]) * height)
                offset = (y * width + x) * 4
                self.assertEqual(pixels[offset:offset+3], bytes.fromhex(spec["palette"][color][1:]))

    def test_palette_slots_are_separate_from_the_surface_charts(self):
        spec = json.loads((ROOT / "blender/asset_spec.json").read_text())
        pixels = builder.atlas_pixels(spec)
        width, height = spec["texture"]["width"], spec["texture"]["height"]
        for index, color in enumerate(spec["palette"].values()):
            u, v = builder.palette_coordinate(index, spec)
            x, y = int(u * width), int((1 - v) * height)
            self.assertEqual(pixels[(y*width+x)*4:(y*width+x)*4+3], bytes.fromhex(color[1:]))


if __name__ == "__main__":
    unittest.main()
