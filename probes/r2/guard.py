"""Local R2 job guard. Every execution needs a fresh, explicit allowance."""

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def inside(root, path):
    root, path = Path(root).resolve(), Path(path).resolve()
    if not path.is_relative_to(root) or path == root:
        raise ValueError(f"OUTPUT_ESCAPE: {path}")
    return path


def verified_copy(source, target, expected):
    if digest(source) != expected:
        raise ValueError("SOURCE_IDENTITY: retained digest mismatch")
    target = Path(target)
    with Path(source).open("rb") as src, target.open("xb") as dst:
        shutil.copyfileobj(src, dst)
    if digest(target) != expected or digest(source) != expected:
        raise ValueError("SOURCE_IDENTITY: bytes changed during copy")


def usage(root):
    logical, allocated = 0, 0
    for directory, _, files in os.walk(root, followlinks=False):
        for name in files:
            path = Path(directory) / name
            if not path.is_symlink():
                stat = path.stat()
                logical += stat.st_size
                allocated += stat.st_blocks * 512
    return max(logical, allocated)


def capacity(config):
    root = Path(config["root"]).resolve()
    if dt.datetime.now(dt.timezone.utc) >= dt.datetime.fromisoformat(
        config["work_deadline_utc"].replace("Z", "+00:00")
    ):
        raise RuntimeError("TIME_LIMIT: recovery reserve reached")
    used = usage(root)
    free = shutil.disk_usage(root).free
    if used >= config["max_bytes"] - config["reserve_bytes"]:
        raise RuntimeError("DISK_LIMIT: recovery reserve reached")
    if free <= config["min_free_bytes"]:
        raise RuntimeError("FREE_SPACE_LIMIT")
    return {"used_bytes": used, "free_bytes": free}


def stop_group(process):
    # This PID is the group leader created by this supervisor, never a name match.
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def run(config, name, seconds, command):
    root = Path(config["root"]).resolve()
    log_path = inside(root, root / f"{name}.log")
    receipt_path = inside(root, root / f"{name}.job.json")
    if log_path.exists() or receipt_path.exists():
        raise ValueError("EXISTING_JOB: use a fresh job name")
    for directory in ("tmp", "npm-cache", "browser-cache"):
        inside(root, root / directory).mkdir(exist_ok=True)
    environment = dict(os.environ, TMPDIR=str(root / "tmp"),
                       npm_config_cache=str(root / "npm-cache"),
                       PLAYWRIGHT_BROWSERS_PATH=str(root / "browser-cache"),
                       PYTHONDONTWRITEBYTECODE="1")
    started = time.monotonic()
    process = None
    receipt = {"command": command, "complete": False,
               "started_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
               "allowance": config, "job_timeout_seconds": seconds}
    with (root / "heavy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        receipt["capacity_before"] = capacity(config)
        try:
            with log_path.open("x") as log:
                process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                           env=environment, start_new_session=True)
                receipt["pid"] = process.pid
                while process.poll() is None:
                    capacity(config)
                    if time.monotonic() - started > seconds:
                        raise RuntimeError("JOB_TIMEOUT")
                    time.sleep(0.25)
                receipt["exit_code"] = process.returncode
                if process.returncode != 0:
                    raise RuntimeError(f"JOB_FAILED: exit {process.returncode}; {log_path}")
                capacity(config)
                receipt["complete"] = True
        except BaseException as error:
            receipt["error"] = f"{type(error).__name__}: {error}"
            raise
        finally:
            if process is not None:
                stop_group(process)
            receipt["seconds"] = time.monotonic() - started
            receipt["used_bytes_after"] = usage(root)
            receipt["log_sha256"] = digest(log_path) if log_path.exists() else None
            atomic_json(receipt_path, receipt)
    print(json.dumps({"job": name, "complete": True, "seconds": receipt["seconds"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--allowance", type=Path, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--seconds", type=float, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command or args.seconds <= 0:
        parser.error("a positive timeout and command are required")
    run(json.loads(args.allowance.read_text()), args.name, args.seconds, command)
