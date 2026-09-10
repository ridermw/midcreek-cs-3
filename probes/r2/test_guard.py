import json
import datetime as dt
import os
import sys
import tempfile
import unittest
from pathlib import Path

from guard import capacity, inside, run, verified_copy


class GuardTests(unittest.TestCase):
    def test_wrong_identity_does_not_create_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            source.write_bytes(b"original")
            with self.assertRaisesRegex(ValueError, "SOURCE_IDENTITY"):
                verified_copy(source, root / "copy", "0" * 64)
            self.assertFalse((root / "copy").exists())
            self.assertEqual(source.read_bytes(), b"original")

    def test_escape_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "OUTPUT_ESCAPE"):
                inside(Path(tmp), Path(tmp) / ".." / "escape")

    def test_symlink_escape_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "owned"
            root.mkdir()
            (root / "link").symlink_to(Path(tmp), target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "OUTPUT_ESCAPE"):
                inside(root, root / "link" / "escape")

    def config(self, root):
        return {"root": str(root),
                "work_deadline_utc": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=60)).isoformat(),
                "max_bytes": 10_000_000, "reserve_bytes": 1_000_000, "min_free_bytes": 0}

    def test_exhausted_time_rejects_before_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            config["work_deadline_utc"] = "2000-01-01T00:00:00Z"
            with self.assertRaisesRegex(RuntimeError, "TIME_LIMIT"):
                run(config, "expired", 10, [sys.executable, "-c", "raise Exception('must not run')"])
            self.assertFalse((Path(tmp) / "expired.log").exists())

    def test_disk_and_free_space_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            config["max_bytes"] = config["reserve_bytes"]
            with self.assertRaisesRegex(RuntimeError, "DISK_LIMIT"):
                capacity(config)
            config["max_bytes"] = 10_000_000
            config["min_free_bytes"] = 10 ** 18
            with self.assertRaisesRegex(RuntimeError, "FREE_SPACE_LIMIT"):
                capacity(config)

    def test_timeout_reaps_owned_process_and_preserves_previous_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            previous = root / "last-complete.json"
            previous.write_text('{"complete": true}\n')
            original = previous.read_bytes()
            with self.assertRaisesRegex(RuntimeError, "JOB_TIMEOUT"):
                run(self.config(root), "timeout", 0.05,
                    [sys.executable, "-c", "import time; time.sleep(60)"])
            receipt = json.loads((root / "timeout.job.json").read_text())
            self.assertFalse(receipt["complete"])
            with self.assertRaises(ProcessLookupError):
                os.kill(receipt["pid"], 0)
            self.assertEqual(previous.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
