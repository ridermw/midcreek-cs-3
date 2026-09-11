import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from export_fixture import ROOT, fixture, mapped_fixture, sha
from export_receipt import canonical_json, map_asset, build_receipt, load_technical


class ExportReceiptTests(unittest.TestCase):
    def setUp(self):
        self.technical, self.documents, self.source, self.inputs, _ = fixture()

    def mapped(self, index=3):
        asset = self.technical["assets"][index]
        document, binary = self.documents[asset["id"]]
        return map_asset(asset, document, binary, self.source, self.inputs)

    def test_mapping_preserves_actual_scene_geometry_materials_and_node_name_tracks(self):
        asset = self.mapped()
        self.assertEqual(asset["scene"], "CS3 Library")
        self.assertEqual(asset["nodes"][1]["parent"], "TechnicianRoot")
        self.assertEqual(asset["nodes"][1]["uvSets"], [0])
        self.assertEqual(asset["geometry"], {"meshes": 1, "primitives": 1, "triangles": 1})
        self.assertEqual(asset["materials"][0]["classification"], "portable-pbr")
        self.assertEqual(asset["textures"][0]["sourcePath"], "source/CS3-Atlas.png")
        self.assertEqual(asset["clips"][1]["frames"], [1, 31])
        self.assertEqual(asset["clips"][1]["tracks"][0]["node"], "TechnicianRootMesh")
        self.assertEqual(len(asset["clips"][1]["samples"]), 61)
        self.assertEqual(asset["clips"][1]["samples"][1]["transforms"], asset["rest"])
        self.assertEqual(asset["coordinates"]["rootMatrix"], asset["rest"][0]["localMatrix"])
        self.assertFalse(asset["permissions"]["publicAssetApproved"])
        self.assertEqual(set(asset["permissions"]), {"publicAssetApproved", "sources", "textures", "fonts"})
        self.assertNotIn("vertices", canonical_json(asset))
        self.assertNotIn("referenceIds", canonical_json(asset))

    def test_missing_or_changed_evidence_fails_closed(self):
        for fault, expected in [
            ("uv", "UV"), ("parent", "PARENT"), ("texture", "TEXTURE"),
            ("pixels", "TEXTURE"), ("clip", "CLIP"), ("interpolation", "INTERPOLATION"),
            ("target", "TRACK"), ("sample", "SAMPLE"), ("rest", "REST"),
            ("extension", "EXTENSION"), ("triangles", "TRIANGLE"), ("rest-offset", "REST"),
            ("private", "PRIVATE"), ("filter", "FILTER"),
        ]:
            with self.subTest(fault=fault):
                self.setUp()
                asset = self.technical["assets"][3]
                doc, _ = self.documents[asset["id"]]
                if fault == "uv":
                    del doc["meshes"][0]["primitives"][0]["attributes"]["TEXCOORD_0"]
                elif fault == "parent":
                    doc["nodes"][0]["children"] = []
                elif fault == "texture":
                    doc["images"][0]["uri"] = "/private/local.png"
                elif fault == "pixels":
                    asset["textures"][0]["pixelSha256"] = "0" * 64
                elif fault == "clip":
                    doc["animations"].pop()
                elif fault == "interpolation":
                    doc["animations"][0]["samplers"][0]["interpolation"] = "STEP"
                elif fault == "target":
                    doc["animations"][0]["channels"][0]["target"]["node"] = 0
                elif fault == "sample":
                    asset["clips"][0]["samples"].pop(1)
                elif fault == "rest":
                    del asset["rest"]["TechnicianRootMesh"]
                elif fault == "extension":
                    doc["extensionsUsed"] = ["KHR_materials_unlit"]
                elif fault == "rest-offset":
                    doc["nodes"][1]["translation"] = [0, 1, 0]
                elif fault == "private":
                    asset["permissions"]["terms"] = "Internal /Users/private-account/secret"
                elif fault == "filter":
                    doc["samplers"][0]["magFilter"] = 9728
                else:
                    doc["accessors"][2]["count"] = 6
                with self.assertRaisesRegex(ValueError, expected):
                    self.mapped()

    def test_private_paths_are_rejected_after_common_prose_delimiters(self):
        for value in ("path=/Users/example/private", "source:(/private/input)", "reference ~/private/input"):
            with self.subTest(value=value):
                self.setUp()
                self.technical["assets"][0]["permissions"]["terms"] = value
                with self.assertRaisesRegex(ValueError, "PRIVATE"):
                    self.mapped(0)

    def test_canonical_hashes_use_record_sets_but_preserve_scalar_order(self):
        a = {"b": [{"id": "z", "v": -0.0}, {"id": "a", "v": 1.0}], "a": [1, 2]}
        b = {"a": [1, 2], "b": list(reversed(a["b"]))}
        self.assertEqual(canonical_json(a), '{"a":[1,2],"b":[{"id":"a","v":1},{"id":"z","v":0}]}')
        self.assertEqual(sha(canonical_json(a).encode()), sha(canonical_json(b).encode()))
        b["a"].reverse()
        self.assertNotEqual(canonical_json(a), canonical_json(b))
        for invalid in [float("nan"), float("inf")]:
            with self.assertRaisesRegex(ValueError, "FINITE"):
                canonical_json(invalid)

    def test_recipe_hash_changes_for_settings_not_generated_process_evidence(self):
        receipt = mapped_fixture()
        profile = json.loads((ROOT / "blender/render_profile.json").read_text())
        arguments = [self.technical, self.documents, self.source, receipt["inputs"], profile,
                     receipt["tools"], receipt["exporter"]]
        baseline = build_receipt(*arguments)
        arguments[3] = copy.deepcopy(receipt["inputs"])
        next(i for i in arguments[3] if i["path"] == "technical.json")["sha256"] = "0" * 64
        generated = build_receipt(*arguments)
        self.assertEqual(baseline["recipeSha256"], generated["recipeSha256"])
        self.assertNotEqual(canonical_json(baseline), canonical_json(generated))
        arguments[0] = copy.deepcopy(self.technical)
        arguments[0]["effectiveSettings"]["export_texcoords"] = False
        changed = build_receipt(*arguments)
        self.assertNotEqual(baseline["recipeSha256"], changed["recipeSha256"])

    def test_exact_assets_clips_and_successful_exporter_required(self):
        receipt = mapped_fixture()
        self.assertEqual(len(receipt["assets"]), 5)
        self.assertEqual(receipt["specificationSha256"], sha(canonical_json(receipt["specification"]).encode()))
        self.assertEqual(receipt, mapped_fixture())
        profile = json.loads((ROOT / "blender/render_profile.json").read_text())
        for fault, expected in [("missing", "EXPORTER"), ("failed", "EXPORTER"),
                                ("tool", "TOOL"), ("incomplete", "INCOMPLETE"),
                                ("asset", "ASSET_SET"), ("frames", "CLIP")]:
            with self.subTest(fault=fault):
                technical = copy.deepcopy(self.technical)
                exporter = copy.deepcopy(receipt["exporter"])
                tools = copy.deepcopy(receipt["tools"])
                if fault == "missing":
                    del exporter["revision"]
                elif fault == "failed":
                    exporter["exitCode"] = 1
                elif fault == "tool":
                    tools["gltfExporter"] = "unknown"
                elif fault == "incomplete":
                    technical["complete"] = False
                elif fault == "asset":
                    technical["assets"].pop()
                else:
                    technical["assets"][3]["clips"][0]["frames"] = [1, 62]
                with self.assertRaisesRegex(ValueError, expected):
                    build_receipt(technical, self.documents, self.source, receipt["inputs"], profile, tools, exporter)

    def test_complete_frozen_influencing_input_inventory_is_required(self):
        receipt = mapped_fixture()
        profile = json.loads((ROOT / "blender/render_profile.json").read_text())
        for path in ("blender/build_library.py", "blender/atlas.py", "blender/equipment.py",
                     "blender/profiles.py", "blender/technician.py"):
            inputs = [item for item in receipt["inputs"] if item["path"] != path]
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "INPUT"):
                build_receipt(self.technical, self.documents, self.source, inputs, profile,
                              receipt["tools"], receipt["exporter"])

    def test_committed_input_rejects_tree_objects(self):
        import export_library
        tree = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD^{tree}"],
                              check=True, capture_output=True, text=True).stdout.strip()
        with self.assertRaisesRegex(ValueError, "COMMIT"):
            export_library.committed_input("blender/asset_spec.json", tree,
                                           sha((ROOT / "blender/asset_spec.json").read_bytes()))

    def test_supervisor_requires_actual_zero_exit_and_pending_worker_output(self):
        import export_library
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            for code in (1, -9):
                with self.subTest(code=code), self.assertRaisesRegex(ValueError, "EXPORTER_FAILED"):
                    export_library.finish_export(output, code, "node")
                self.assertFalse((output / "export.json").exists())
            with self.assertRaisesRegex(ValueError, "EXPORTER_OUTPUT_MISSING"):
                export_library.finish_export(output, 0, "node")
            self.assertFalse((output / "export.json").exists())

    def test_worker_launch_has_python_failure_exit_and_uses_no_branch_lookup(self):
        import export_library
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "export"
            process = type("Process", (), {"returncode": 7})()
            with patch.object(export_library, "validate_job_paths"), \
                    patch.object(export_library.subprocess, "run", return_value=process) as run:
                with self.assertRaisesRegex(ValueError, "EXPORTER_FAILED"):
                    export_library.supervise(Path(directory) / "library.blend", "a" * 64, output,
                                             "b" * 40, "c" * 40, "node", "guarded-blender")
                argv = run.call_args.args[0]
                self.assertEqual(argv[0], "guarded-blender")
                self.assertIn("--factory-startup", argv)
                self.assertEqual(argv[argv.index("--python-exit-code") + 1], "1")
                self.assertIn("--worker", argv)
                self.assertNotIn("HEAD", argv)
                observed = json.loads((output / "process.json").read_text())
                self.assertEqual(observed["exitCode"], 7)
                self.assertFalse((output / "export.json").exists())

    def test_cli_requires_explicit_both_revisions_without_importing_bpy(self):
        for field in ("--source-commit", "--exporter-revision"):
            arguments = ["--source", "missing.blend", "--sha256", "a" * 64, "--output", "missing-output",
                         "--blender", "must-not-run", "--source-commit", "b" * 40, "--exporter-revision", "c" * 40]
            index = arguments.index(field)
            del arguments[index:index + 2]
            process = subprocess.run([sys.executable, "-B", str(ROOT / "blender/export_library.py"), *arguments],
                                     capture_output=True, text=True, check=False)
            self.assertEqual(process.returncode, 2)
            self.assertIn(field, process.stderr)
            self.assertNotIn("bpy", process.stderr)

    def test_strict_capture_adapter_rejects_tampering_and_keeps_legacy_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "export"
            receipt = mapped_fixture(output)
            technical = load_technical(output / "export.json")
            self.assertTrue(technical["assets"][0]["geometry"]["triangleUvs"])
            (output / "technical.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "TECHNICAL_IDENTITY"):
                load_technical(output / "export.json")
            (output / "export.json").write_text(json.dumps(self.technical))
            self.assertEqual(load_technical(output / "export.json"), self.technical)
            self.assertEqual(receipt["source"]["sha256"], self.source["sha256"])


if __name__ == "__main__":
    unittest.main()
