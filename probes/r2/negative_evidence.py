"""Exercise real corrupt/interrupted candidates without replacing complete evidence."""

import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import re
import subprocess
import sys
import time

from guard import atomic_json, capacity, digest, inside, verified_copy
from promote import promote


def main(root, label):
    if not re.fullmatch(r"[a-z0-9-]+", label):
        raise ValueError("INVALID_NEGATIVE_LABEL")
    root = Path(root).resolve()
    allowance = json.loads((root / "allowance.json").read_text())
    capacity(allowance)
    original = digest(root / "last-complete.json")
    checks = []
    try:
        verified_copy(root / "source.blend", root / "wrong-source-copy.blend", "0" * 64)
    except ValueError as error:
        assert "SOURCE_IDENTITY" in str(error)
        assert not (root / "wrong-source-copy.blend").exists()
        checks.append({"name": "wrong source identity", "error": str(error), "pass": True})
    else:
        raise AssertionError("Wrong source accepted")
    pointer = json.loads((root / "last-complete.json").read_text())
    first, second = [record["run"] for record in pointer["runs"]]
    broken_name = f"negative-corrupt-{label}"
    broken = inside(root, root / broken_name)
    shutil.copytree(inside(root, root / first), broken)
    capacity(allowance)
    with (broken / "portable.glb").open("r+b") as stream:
        stream.write(b"BAD!")
    try:
        promote(root, [broken_name, second], pointer["runs"][0]["checks_file"].removesuffix(".json"))
    except ValueError as error:
        assert "ARTIFACT_IDENTITY" in str(error)
        checks.append({"name": "corrupt candidate promotion", "error": str(error), "pass": True})
    else:
        raise AssertionError("Corrupt candidate promoted")
    assert digest(root / "last-complete.json") == original
    code = Path(__file__).resolve().parent
    pid_file = root / f"interrupted-child-{label}.pid"
    child_code = (
        "import os,time;from pathlib import Path;"
        f"Path({str(pid_file)!r}).write_text(str(os.getpid()));"
        f"Path({str(root / f'interrupted-{label}.partial')!r}).write_text('incomplete candidate');"
        "time.sleep(60)"
    )
    with (root / f"interrupt-supervisor-{label}.log").open("x") as log:
        process = subprocess.Popen([
            sys.executable, "-B", str(code / "guard.py"), "--allowance", str(root / "allowance.json"),
            "--name", f"interrupted-{label}", "--seconds", "60", "--", sys.executable, "-c", child_code,
        ], stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 5
            while not pid_file.exists():
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError("INTERRUPTION_SETUP_FAILED")
                time.sleep(0.02)
            process.send_signal(signal.SIGINT)
            process.wait(timeout=5)
        finally:
            if process.poll() is None:
                process.send_signal(signal.SIGINT)
                process.wait(timeout=5)
    assert process.returncode != 0
    child_pid = int(pid_file.read_text())
    try:
        os.kill(child_pid, 0)
    except ProcessLookupError:
        pass
    else:
        raise AssertionError(f"Owned child still running: {child_pid}")
    interrupted = json.loads((root / f"interrupted-{label}.job.json").read_text())
    assert interrupted["complete"] is False and "KeyboardInterrupt" in interrupted["error"]
    assert digest(root / "last-complete.json") == original
    checks.append({"name": "SIGINT of owned supervisor", "pass": True,
                   "child_reaped": child_pid, "error": interrupted["error"]})
    atomic_json(root / f"negative-evidence-{label}.json", {
        "complete": True, "checks": checks, "last_complete_before": original,
        "last_complete_after": digest(root / "last-complete.json"),
    })
    print(json.dumps({"complete": True, "checks": checks}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--label", required=True)
    args = parser.parse_args()
    main(args.root, args.label)
