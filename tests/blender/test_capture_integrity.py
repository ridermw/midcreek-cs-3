import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

try:
    import bpy
except ModuleNotFoundError as error:
    if error.name != "bpy":
        raise
    bpy = None

ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(bpy, "requires the actual Blender capture entry point")
class CaptureIntegrityTests(unittest.TestCase):
    def test_rejects_changed_incomplete_and_wrong_source_authoring_before_opening_blend(self):
        module = importlib.util.spec_from_file_location("capture", ROOT / "blender/capture_library.py")
        capture = importlib.util.module_from_spec(module)
        module.loader.exec_module(capture)
        self.assertTrue(os.environ.get("CS3_JOB_ROOT"))
        for failure in ("changed", "incomplete", "source"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory(
                    prefix="u5-integrity-", dir=ROOT / ".artifacts/assets") as directory:
                root = Path(directory)
                export = root / "export"
                export.mkdir()
                blend = export / "owned.blend"
                blend.write_bytes(b"must reject the sidecar before opening this file")
                source_hash = capture.builder.checksum(blend)
                authoring = {"complete": failure != "incomplete",
                             "sourceSha256": "0" * 64 if failure == "source" else source_hash,
                             "rest": {}}
                sidecar = root / "authoring.json"
                sidecar.write_text(json.dumps(authoring))
                receipt = {"kind": "cs3-library-export", "complete": True,
                           "sourceSha256": source_hash,
                           "authoringReceiptSha256": capture.builder.checksum(sidecar),
                           "inputs": {"blender/build_library.py":
                                      capture.builder.checksum(ROOT / "blender/build_library.py")}}
                if failure == "changed":
                    authoring["rest"]["Hips"] = {"location": [0, 0, 99]}
                    sidecar.write_text(json.dumps(authoring))
                record = export / "export.json"
                record.write_text(json.dumps(receipt))
                with self.assertRaisesRegex(ValueError, "AUTHORING_IDENTITY"):
                    capture.main(record, export / "captures")
                self.assertFalse((export / "captures").exists())


if __name__ == "__main__":
    result = unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(CaptureIntegrityTests))
    if not result.wasSuccessful():
        raise RuntimeError("CAPTURE_INTEGRITY_TEST_FAILURE")
