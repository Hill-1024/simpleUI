#!/usr/bin/env python3
import os
import pathlib
import re
import subprocess
from datetime import datetime, timezone

import common


def download_ipquality():
    directory = pathlib.Path("/opt/simpleui-hook/upstream/ipquality")
    script = directory / "ip.sh"
    common.mkdir(directory, 0o700)
    common.ensure_tool("curl", "curl")
    common.log("Downloading upstream IPQuality script")
    common.download("https://raw.githubusercontent.com/xykt/IPQuality/main/ip.sh", str(script))
    common.chmod(script, 0o700)
    return script


def ipquality_args(report):
    mode = os.environ.get("SIMPLEUI_IPQUALITY_MODE", "dual")
    args = ["-y"]
    if os.environ.get("SIMPLEUI_IPQUALITY_PRIVACY", "1") != "0":
        args.append("-p")
    if mode == "ipv4":
        args.append("-4")
    elif mode == "ipv6":
        args.append("-6")
    elif mode not in {"dual", ""}:
        common.log(f"Unsupported IPQuality mode: {mode}")
        raise SystemExit(64)
    if os.environ.get("SIMPLEUI_IPQUALITY_FULL_IP") not in {"", None, "0"}:
        args.append("-f")
    optional = [
        ("SIMPLEUI_IPQUALITY_LANGUAGE", "-l"),
        ("SIMPLEUI_IPQUALITY_INTERFACE", "-i"),
        ("SIMPLEUI_IPQUALITY_PROXY", "-x"),
    ]
    for env_name, flag in optional:
        value = os.environ.get(env_name, "")
        if value:
            args.extend([flag, value])
    args.extend(["-o", str(report)])
    return args


def text_report_ok(report, log_file):
    report_path = pathlib.Path(report)
    log_path = pathlib.Path(log_file)
    return (report_path.exists() and report_path.stat().st_size > 0) or (log_path.exists() and log_path.stat().st_size > 0)


def ipquality_result(code, upstream_code, mode, report, log_file):
    size = pathlib.Path(report).stat().st_size if pathlib.Path(report).exists() else 0
    source = report if size else log_file
    raw = common.read_text(source)
    log_raw = common.read_text(log_file)
    match = re.search(r"https://Report\.Check\.Place/[^\s\x1b\"'<>]+", raw + "\n" + log_raw)
    common.emit("__SIMPLEUI_IPQUALITY__", {
        "ok": code == 0,
        "exitCode": code,
        "upstreamExitCode": upstream_code,
        "mode": mode,
        "reportPath": str(report),
        "logPath": str(log_file),
        "reportUrl": match.group(0) if match else None,
        "reportBytes": size,
        "rawOutput": raw,
    })


def main():
    common.bootstrap()
    script = download_ipquality()
    out_dir = pathlib.Path("/etc/simpleui/ipquality")
    common.mkdir(out_dir, 0o700)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = out_dir / f"report-{timestamp}.ansi"
    log_file = out_dir / f"run-{timestamp}.log"
    args = ipquality_args(report)

    common.log("Running IPQuality original report output")
    with open(log_file, "w", encoding="utf-8") as handle:
        proc = subprocess.run(["bash", str(script), *args], stdout=handle, stderr=subprocess.STDOUT)
    code = proc.returncode

    common.log(f"IPQuality exit code: {code}")
    common.log(f"IPQuality report: {report}")
    common.log(f"IPQuality log: {log_file}")
    if not text_report_ok(report, log_file) and log_file.exists() and log_file.stat().st_size:
        common.log("Last IPQuality output lines:")
        lines = common.read_text(log_file).splitlines()[-80:]
        for line in lines:
            print(line)

    effective_code = 0 if text_report_ok(report, log_file) else code
    ipquality_result(effective_code, code, os.environ.get("SIMPLEUI_IPQUALITY_MODE", "dual"), report, log_file)
    raise SystemExit(effective_code)


if __name__ == "__main__":
    main()
