"""Run one owned implementation job under its immutable launch authorization."""

import argparse
import datetime as dt
import fcntl
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "probes" / "r2"))
from guard import atomic_json, digest, stop_group, usage


def capacity(authorization):
    limits = authorization["resources"]
    if authorization["status"] != "authorized" or limits["max_heavy_jobs"] != 1:
        raise ValueError("AUTHORIZATION: an approved single-heavy-job envelope is required")
    deadline = dt.datetime.fromisoformat(limits["work_deadline_utc"].replace("Z", "+00:00"))
    if dt.datetime.now(dt.timezone.utc) >= deadline:
        raise RuntimeError("TIME_LIMIT: closeout reserve reached")
    repository = Path(authorization["owned_roots"]["repository"]).resolve()
    used = usage(repository)
    additional = max(0, used - limits["baseline_repository_bytes"])
    free = shutil.disk_usage(repository).free
    if additional >= limits["max_additional_bytes"] - limits["reserve_bytes"]:
        raise RuntimeError("DISK_LIMIT: closeout reserve reached")
    if free <= limits["min_free_bytes"]:
        raise RuntimeError("FREE_SPACE_LIMIT")
    return {"repository_bytes": used, "additional_bytes": additional, "free_bytes": free}


def run(authorization_path, name, seconds, command):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}", name):
        raise ValueError("JOB_NAME: expected a bounded identifier")
    if not command or not math.isfinite(seconds) or seconds <= 0:
        raise ValueError("JOB_COMMAND: positive finite timeout and command required")
    authorization_path = Path(authorization_path).resolve()
    root = authorization_path.parent
    authorization = json.loads(authorization_path.read_text())
    repository = Path(authorization["owned_roots"]["repository"]).resolve()
    if not root.is_relative_to(repository):
        raise ValueError("OUTPUT_ESCAPE: run root is outside its approved repository")
    log_path, receipt_path = root / f"{name}.log", root / f"{name}.job.json"
    if log_path.exists() or receipt_path.exists():
        raise ValueError("EXISTING_JOB: evidence requires a fresh job name")
    environment = dict(os.environ)
    for key, directory in (
        ("TMPDIR", "tmp"), ("npm_config_cache", "tmp/npm-cache"),
        ("PLAYWRIGHT_BROWSERS_PATH", "tmp/browser-cache"),
        ("NODE_COMPILE_CACHE", "tmp/node-compile-cache"),
    ):
        target = root / directory
        target.mkdir(parents=True, exist_ok=True)
        environment[key] = str(target)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    environment["CS3_RUN_ROOT"] = str(root)
    environment["CS3_JOB_ROOT"] = str(root / name)
    started = time.monotonic()
    process = None
    receipt = {
        "command": command, "complete": False, "authorization_sha256": digest(authorization_path),
        "started_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "job_timeout_seconds": seconds,
    }
    with (root / "heavy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        receipt["capacity_before"] = capacity(authorization)
        try:
            with log_path.open("x") as log:
                process = subprocess.Popen(
                    command, cwd=repository, env=environment, stdout=log,
                    stderr=subprocess.STDOUT, start_new_session=True,
                )
                receipt["pid"] = process.pid
                while process.poll() is None:
                    capacity(authorization)
                    if time.monotonic() - started >= seconds:
                        raise RuntimeError("JOB_TIMEOUT")
                    time.sleep(0.5)
                receipt["exit_code"] = process.returncode
                if process.returncode:
                    raise RuntimeError(f"JOB_FAILED: exit {process.returncode}; {log_path}")
                receipt["capacity_after"] = capacity(authorization)
                receipt["complete"] = True
        except BaseException as error:
            receipt["error"] = f"{type(error).__name__}: {error}"
            raise
        finally:
            if process is not None:
                stop_group(process)
            receipt["seconds"] = time.monotonic() - started
            receipt["log_sha256"] = digest(log_path) if log_path.exists() else None
            atomic_json(receipt_path, receipt)
    print(json.dumps({"job": name, "complete": True, "seconds": receipt["seconds"]}))


if __name__ == "__main__":
    def interrupted(signum, _frame):
        raise InterruptedError(f"INTERRUPTED: signal {signum}")

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authorization", type=Path, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--seconds", type=float, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    run(args.authorization, args.name, args.seconds,
        args.command[1:] if args.command[:1] == ["--"] else args.command)
