#!/usr/bin/env bash

python3 - <<'PY'
import json
import os
import selectors
import signal
import subprocess
import sys
import time

command = os.environ.get("SIMPLEUI_EXEC_COMMAND", "").strip()
cwd = os.environ.get("SIMPLEUI_EXEC_CWD", "/root").strip() or "/root"

try:
    timeout_seconds = int(os.environ.get("SIMPLEUI_EXEC_TIMEOUT", "600") or "600")
except ValueError:
    timeout_seconds = 600
timeout_seconds = min(max(timeout_seconds, 1), 3600)

try:
    output_limit = int(os.environ.get("SIMPLEUI_EXEC_OUTPUT_LIMIT", "200000") or "200000")
except ValueError:
    output_limit = 200000
output_limit = min(max(output_limit, 4096), 1000000)

if not command:
    print("[simpleui] No command supplied.")
    print("__SIMPLEUI_RESULT__" + json.dumps({"ok": False, "exitCode": 64, "error": "No command supplied"}))
    raise SystemExit(0)

if not os.path.isdir(cwd):
    print(f"[simpleui] Working directory does not exist: {cwd}")
    print("__SIMPLEUI_RESULT__" + json.dumps({"ok": False, "exitCode": 66, "error": "Working directory does not exist"}))
    raise SystemExit(0)

selector = selectors.DefaultSelector()
started = time.monotonic()
captured = bytearray()
truncated = False
timed_out = False

proc = subprocess.Popen(
    ["bash", "-lc", command],
    cwd=cwd,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    stdin=subprocess.DEVNULL,
    start_new_session=True,
)

selector.register(proc.stdout, selectors.EVENT_READ)

while True:
    if time.monotonic() - started > timeout_seconds:
        timed_out = True
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        time.sleep(0.5)
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        break

    events = selector.select(timeout=0.1)
    for key, _ in events:
        chunk = key.fileobj.read1(8192)
        if not chunk:
            selector.unregister(key.fileobj)
            continue
        remaining = output_limit - len(captured)
        if remaining > 0:
            take = chunk[:remaining]
            captured.extend(take)
            sys.stdout.write(take.decode("utf-8", errors="replace"))
            sys.stdout.flush()
        if len(chunk) > remaining:
            truncated = True

    if proc.poll() is not None:
        rest = proc.stdout.read() if proc.stdout else b""
        if rest:
            remaining = output_limit - len(captured)
            if remaining > 0:
                take = rest[:remaining]
                captured.extend(take)
                sys.stdout.write(take.decode("utf-8", errors="replace"))
                sys.stdout.flush()
            if len(rest) > remaining:
                truncated = True
        break

exit_code = proc.wait() if proc.poll() is not None else 124
if timed_out:
    exit_code = 124
    print(f"\n[simpleui] Command timed out after {timeout_seconds}s.")
if truncated:
    print(f"\n[simpleui] Output truncated at {output_limit} bytes.")

payload = {
    "ok": exit_code == 0,
    "exitCode": exit_code,
    "cwd": cwd,
    "durationMs": int((time.monotonic() - started) * 1000),
    "timedOut": timed_out,
    "truncated": truncated,
    "outputBytes": len(captured),
}
print("__SIMPLEUI_RESULT__" + json.dumps(payload, ensure_ascii=False))
PY
