#!/usr/bin/env python3
import os
import subprocess

import common


def default_service(protocol):
    if protocol == "hysteria2":
        return "hysteria-server.service"
    if protocol == "trojan":
        return "trojan.service"
    return ""


def main():
    common.bootstrap()
    protocol = os.environ.get("SIMPLEUI_PROTOCOL", "hysteria2")
    action = os.environ.get("SIMPLEUI_SERVICE_ACTION", "restart")
    service = os.environ.get("SIMPLEUI_SERVICE", "") or default_service(protocol)

    if not service:
        common.log(f"No systemd service is known for {protocol}; register the monitor with a service name to control it.")
        raise SystemExit(51)
    if action not in {"start", "stop", "restart"}:
        common.log(f"Unsupported service action: {action}")
        raise SystemExit(50)

    common.run(["systemctl", action, service])
    common.run(["systemctl", "is-active", service], check=False, stderr=subprocess.DEVNULL)
    common.emit("__SIMPLEUI_RESULT__", {"ok": True, "service": service, "action": action})


if __name__ == "__main__":
    main()
