import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "run_guard.py"


class RunGuardTest(unittest.TestCase):
    def test_guard_exists(self):
        self.assertTrue(SCRIPT.is_file(), "implementation jobs need a resource guard")

    def test_counts_files_outside_job_root_without_following_links(self):
        self.assertTrue(SCRIPT.is_file())
        spec = importlib.util.spec_from_file_location("run_guard", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "jobs").mkdir()
            (root / "asset.bin").write_bytes(b"x" * 8192)
            (root / "alias").symlink_to(root / "asset.bin")
            self.assertGreaterEqual(module.usage(root), 8192)
            self.assertLess(module.usage(root), 16384)

    def test_expired_authorization_never_starts_child(self):
        self.assertTrue(SCRIPT.is_file())
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            auth = {
                "status": "authorized",
                "owned_roots": {"repository": str(root)},
                "resources": {
                    "work_deadline_utc": "2000-01-01T00:00:00Z",
                    "max_additional_bytes": 10000000,
                    "baseline_repository_bytes": 0,
                    "reserve_bytes": 1000,
                    "min_free_bytes": 1,
                    "max_heavy_jobs": 1,
                },
            }
            path = root / "authorization.json"
            path.write_text(json.dumps(auth))
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--authorization", str(path),
                 "--name", "expired", "--seconds", "10", "--",
                 sys.executable, "-c", "raise AssertionError('child must not run')"],
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("TIME_LIMIT", result.stderr)
            self.assertFalse((root / "expired.log").exists())

    def test_failure_has_receipt_and_cannot_overwrite_evidence(self):
        self.assertTrue(SCRIPT.is_file())
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            auth = {
                "status": "authorized",
                "owned_roots": {"repository": str(root)},
                "resources": {
                    "work_deadline_utc": "2099-01-01T00:00:00Z",
                    "max_additional_bytes": 10000000,
                    "baseline_repository_bytes": 0,
                    "reserve_bytes": 1000,
                    "min_free_bytes": 1,
                    "max_heavy_jobs": 1,
                },
            }
            path = root / "authorization.json"
            path.write_text(json.dumps(auth))
            command = [sys.executable, str(SCRIPT), "--authorization", str(path),
                       "--name", "failure", "--seconds", "5", "--",
                       sys.executable, "-c", "print('retained'); raise SystemExit(7)"]
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(first.returncode, 0)
            receipt = json.loads((root / "failure.job.json").read_text())
            self.assertFalse(receipt["complete"])
            self.assertEqual(receipt["exit_code"], 7)
            original = (root / "failure.log").read_bytes()
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertIn("EXISTING_JOB", second.stderr)
            self.assertEqual((root / "failure.log").read_bytes(), original)

    def test_sigterm_reaps_owned_child_and_records_interruption(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            auth = {
                "status": "authorized",
                "owned_roots": {"repository": str(root)},
                "resources": {
                    "work_deadline_utc": "2099-01-01T00:00:00Z",
                    "max_additional_bytes": 10000000,
                    "baseline_repository_bytes": 0, "reserve_bytes": 1000,
                    "min_free_bytes": 1, "max_heavy_jobs": 1,
                },
            }
            path = root / "authorization.json"
            path.write_text(json.dumps(auth))
            child_pid = root / "child.pid"
            command = [sys.executable, str(SCRIPT), "--authorization", str(path),
                       "--name", "interrupted", "--seconds", "20", "--",
                       sys.executable, "-c",
                       "import os,time,pathlib; pathlib.Path('child.pid').write_text(str(os.getpid())); time.sleep(5)"]
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not child_pid.exists() and process.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.02)
                self.assertTrue(child_pid.exists())
                process.terminate()
                process.communicate(timeout=8)
                receipt = root / "interrupted.job.json"
                self.assertTrue(receipt.exists(), "SIGTERM must close the owned job with a receipt")
                self.assertIn("INTERRUPTED", json.loads(receipt.read_text())["error"])
                import os
                with self.assertRaises(ProcessLookupError):
                    os.kill(int(child_pid.read_text()), 0)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate(timeout=8)


if __name__ == "__main__":
    unittest.main()
