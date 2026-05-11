#!/usr/bin/env python3
import os
import pathlib
import re
import subprocess

import common


REBOOT_ACTIONS = {
    "adaptive-system",
    "xanmod-main",
    "xanmod-lts",
    "xanmod-edge",
    "xanmod-rt",
    "official-stable-kernel",
    "official-latest-kernel",
}

MENU_NUMBERS = {
    "bbr-fq": "20",
    "bbr-fq-pie": "21",
    "bbr-cake": "22",
    "bbrplus-fq": "23",
    "ecn-on": "30",
    "ecn-off": "31",
    "adaptive-system": "32",
    "anti-cc": "33",
    "ipv6-off": "35",
    "ipv6-on": "36",
    "xanmod-main": "9",
    "xanmod-lts": "10",
    "xanmod-edge": "11",
    "xanmod-rt": "12",
    "official-stable-kernel": "7",
    "official-latest-kernel": "8",
}


def read_proc(path, default="unknown"):
    return common.read_text(path, default).strip() or default


def tcpx_status():
    conf = "/etc/sysctl.d/99-sysctl.conf"
    kernel = common.capture(["uname", "-r"]).strip()
    qdisc = read_proc("/proc/sys/net/core/default_qdisc")
    cc = read_proc("/proc/sys/net/ipv4/tcp_congestion_control")
    available_cc = read_proc("/proc/sys/net/ipv4/tcp_available_congestion_control")
    ecn = read_proc("/proc/sys/net/ipv4/tcp_ecn")
    common.emit("__SIMPLEUI_OPTIMIZE__", {
        "ok": True,
        "kernel": kernel,
        "queueDiscipline": qdisc,
        "congestionControl": cc,
        "availableCongestionControl": available_cc.split(),
        "ecn": ecn,
        "sysctlConfig": conf if os.path.exists(conf) else None,
        "xanmodRunning": "xanmod" in kernel.lower(),
        "needsReboot": False,
    })


def download_tcpx():
    directory = pathlib.Path("/opt/simpleui-hook/upstream/tcpx")
    script = directory / "tcpx.sh"
    common.mkdir(directory, 0o700)
    common.ensure_tool("curl", "curl")
    common.log("Downloading upstream Linux-NetSpeed tcpx.sh")
    common.download("https://raw.githubusercontent.com/ylx2016/Linux-NetSpeed/master/tcpx.sh", str(script))
    common.chmod(script, 0o700)
    return script


def show_kernels():
    common.log("Installed kernel packages:")
    if common.command_exists("rpm"):
        output = common.capture(["rpm", "-qa"])
        rows = [line for line in output.splitlines() if re.search(r"^kernel-(image|core|modules|devel|headers)", line)]
        for line in sorted(rows):
            print(line)
    elif common.command_exists("dpkg-query"):
        output = common.capture(["dpkg-query", "-W", "-f=${Package} ${Version}\n", "linux-image*", "linux-headers*", "linux-modules*"])
        rows = [line for line in output.splitlines() if re.search(r"^(linux-image|linux-headers|linux-modules)", line)]
        for line in sorted(rows):
            print(line)
    common.log("Boot kernels:")
    for item in sorted(pathlib.Path("/boot").glob("vmlinuz-*")):
        print(item)
    common.log(f"Running kernel: {common.capture(['uname', '-r']).strip()}")
    optimize_result("show-kernels", 0)


def optimize_result(action, code):
    common.emit("__SIMPLEUI_OPTIMIZE__", {
        "ok": code == 0,
        "action": action,
        "exitCode": code,
        "kernel": common.capture(["uname", "-r"]).strip(),
        "queueDiscipline": read_proc("/proc/sys/net/core/default_qdisc"),
        "congestionControl": read_proc("/proc/sys/net/ipv4/tcp_congestion_control"),
        "ecn": read_proc("/proc/sys/net/ipv4/tcp_ecn"),
        "needsReboot": action in REBOOT_ACTIONS,
    })


def run_tcpx_action(action):
    menu_number = MENU_NUMBERS.get(action)
    if not menu_number:
        common.log(f"Unsupported optimize action: {action}")
        raise SystemExit(64)
    script = download_tcpx()
    common.log(f"Running upstream tcpx.sh menu option {menu_number} for action {action}")
    proc = subprocess.run(["bash", str(script)], input=f"{menu_number}\n", text=True)
    optimize_result(action, proc.returncode)
    raise SystemExit(proc.returncode)


def main():
    common.bootstrap()
    action = os.environ.get("SIMPLEUI_OPTIMIZE_ACTION", "status")
    if action == "status":
        common.log("Reading current acceleration status")
        tcpx_status()
    elif action == "show-kernels":
        show_kernels()
    else:
        run_tcpx_action(action)


if __name__ == "__main__":
    main()
