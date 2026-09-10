"""Validate two complete runs before atomically replacing the local evidence pointer."""

import argparse
import json
from pathlib import Path

from guard import atomic_json, digest, inside

SOURCE_SHA256 = "0e4c90b1ab5bcfb052d2f5d2c5c4628a89b5b7145f6b6e9bf399d7f31cda4d05"


def promote(root, runs, tag):
    root = Path(root).resolve()
    code = Path(__file__).resolve().parent
    if len(runs) != 2 or len(set(runs)) != 2:
        raise ValueError("REPEAT_REQUIRED: two distinct fresh runs")
    if digest(root / "source.blend") != SOURCE_SHA256:
        raise ValueError("SOURCE_IDENTITY")
    receipts = []
    for run in runs:
        directory = inside(root, root / run)
        export_path = inside(directory, directory / "export.json")
        check_path = inside(directory, directory / f"{tag}.json")
        export = json.loads(export_path.read_text())
        checks = json.loads(check_path.read_text())
        if export.get("complete") is not True or checks.get("complete") is not True:
            raise ValueError(f"INCOMPLETE_EVIDENCE: {run}")
        if len(checks["checks"]) != 16 or len({c["name"] for c in checks["checks"]}) != 16:
            raise ValueError(f"CHECK_SET_INCOMPLETE: {run}")
        if len(checks["captures"]) != 10:
            raise ValueError(f"CAPTURE_SET_INCOMPLETE: {run}")
        if set(checks["code"]) != {
            "package.json", "package-lock.json", "browser.mjs", "lifecycle.mjs", "glb.mjs", "check.mjs"
        }:
            raise ValueError(f"CODE_IDENTITIES_INCOMPLETE: {run}")
        if export["source_sha256"] != SOURCE_SHA256 or checks["source"] != SOURCE_SHA256:
            raise ValueError(f"SOURCE_IDENTITY: {run}")
        if export["script_sha256"] != digest(code / "export_sample.py"):
            raise ValueError(f"STALE_EXPORT_SCRIPT: {run}")
        if checks["exportScript"] != export["script_sha256"]:
            raise ValueError(f"CHECK_EXPORT_MISMATCH: {run}")
        for name, checksum in checks["code"].items():
            if digest(inside(code, code / name)) != checksum:
                raise ValueError(f"STALE_CHECK_CODE: {name}")
        for name, artifact in export["artifacts"].items():
            file = inside(directory, directory / name)
            if digest(file) != artifact["sha256"] or file.stat().st_size != artifact["bytes"]:
                raise ValueError(f"ARTIFACT_IDENTITY: {run}/{name}")
        for capture in checks["captures"]:
            if digest(inside(directory, directory / capture["file"])) != capture["sha256"]:
                raise ValueError(f"CAPTURE_IDENTITY: {capture['file']}")
        for check in checks["checks"]:
            if check["pass"] is not True:
                raise ValueError(f"FAILED_CHECK: {check['name']}")
            if check["name"].startswith("matched three-way"):
                for comparison in check["detail"]:
                    if digest(inside(directory, directory / comparison["contact"])) != comparison["sha256"]:
                        raise ValueError(f"COMPARISON_IDENTITY: {comparison['contact']}")
        receipts.append({
            "run": run, "export_sha256": digest(export_path), "checks_sha256": digest(check_path),
            "checks_file": f"{tag}.json", "checks": len(checks["checks"]),
            "glbs": {name: export["artifacts"][name] for name in ("direct.glb", "portable.glb")},
            "poses": export["poses"], "versions": checks["versions"],
            "renderer": checks["renderer"],
        })
    if receipts[0]["glbs"] != receipts[1]["glbs"] or receipts[0]["poses"] != receipts[1]["poses"]:
        raise ValueError("REPEAT_DIFFERENCE: GLB bytes or declared poses differ")
    pointer = {"schema": 1, "complete": True, "source_sha256": SOURCE_SHA256,
               "classification": "adapted sample passes; direct material export incompatible",
               "runs": receipts, "performance_qualified": False, "user_accepted": False}
    atomic_json(root / "last-complete.json", pointer)
    return pointer


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--runs", nargs=2, required=True)
    parser.add_argument("--tag", default="checks-1")
    args = parser.parse_args()
    record = promote(args.root, args.runs, args.tag)
    print(json.dumps({"complete": True, "runs": [r["run"] for r in record["runs"]],
                      "pointer": str(args.root / "last-complete.json")}))
