#!/usr/bin/env python3
import os
import subprocess
import time

import common


def reboot_delay():
    try:
        delay = int(os.environ.get("SIMPLEUI_REBOOT_DELAY", "8") or "8")
    except ValueError:
        delay = 8
    return min(max(delay, 3), 300)


def main():
    common.bootstrap()
    delay = reboot_delay()
    common.log(f"Scheduling server reboot in {delay} seconds")

    if common.command_exists("systemctl"):
        reboot_cmd = "systemctl reboot"
    elif common.command_exists("reboot"):
        reboot_cmd = "reboot"
    else:
        common.log("No reboot command found")
        raise SystemExit(127)

    schedule_method = ""
    if common.command_exists("systemd-run"):
        unit = f"simpleui-reboot-{int(time.time())}"
        result = common.run(
            ["systemd-run", f"--unit={unit}", f"--on-active={delay}s", "/bin/sh", "-c", reboot_cmd],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode == 0:
            schedule_method = "systemd-run"

    if not schedule_method:
        subprocess.Popen(
            ["/bin/sh", "-c", f"sleep {delay}; {reboot_cmd}"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        schedule_method = "nohup"

    common.emit("__SIMPLEUI_RESULT__", {
        "ok": True,
        "action": "server-reboot",
        "delaySeconds": delay,
        "method": schedule_method,
    })


if __name__ == "__main__":
    main()
