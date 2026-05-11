#!/usr/bin/env python3
import os
import selectors
import signal
import subprocess
import sys
import time

import common


def bounded_int(name, default, minimum, maximum):
    try:
        value = int(os.environ.get(name, str(default)) or str(default))
    except ValueError:
        value = default
    return min(max(value, minimum), maximum)


def main():
    common.bootstrap()
    command = os.environ.get("SIMPLEUI_EXEC_COMMAND", "").strip()
    cwd = os.environ.get("SIMPLEUI_EXEC_CWD", "/root").strip() or "/root"
    timeout_seconds = bounded_int("SIMPLEUI_EXEC_TIMEOUT", 600, 1, 3600)
    output_limit = bounded_int("SIMPLEUI_EXEC_OUTPUT_LIMIT", 200000, 4096, 1000000)

    if not command:
        common.log("No command supplied.")
        common.emit("__SIMPLEUI_RESULT__", {"ok": False, "exitCode": 64, "error": "No command supplied"})
        return
    if not os.path.isdir(cwd):
        common.log(f"Working directory does not exist: {cwd}")
        common.emit("__SIMPLEUI_RESULT__", {"ok": False, "exitCode": 66, "error": "Working directory does not exist"})
        return

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

    common.emit("__SIMPLEUI_RESULT__", {
        "ok": exit_code == 0,
        "exitCode": exit_code,
        "cwd": cwd,
        "durationMs": int((time.monotonic() - started) * 1000),
        "timedOut": timed_out,
        "truncated": truncated,
        "outputBytes": len(captured),
    })


if __name__ == "__main__":
    main()
