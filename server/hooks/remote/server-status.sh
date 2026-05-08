#!/usr/bin/env bash

sample_delay="${SIMPLEUI_STATUS_SAMPLE_DELAY:-0.25}"

python3 - "$sample_delay" <<'PY'
import json
import os
import platform
import socket
import subprocess
import sys
import time

sample_delay = float(sys.argv[1] or 0.25)

def read_cpu():
    with open("/proc/stat", "r", encoding="utf-8", errors="ignore") as handle:
        parts = handle.readline().split()[1:]
    values = [int(item) for item in parts]
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    total = sum(values)
    return idle, total

def cpu_usage():
    try:
        idle_a, total_a = read_cpu()
        time.sleep(max(0.05, min(sample_delay, 1.0)))
        idle_b, total_b = read_cpu()
        total_delta = max(1, total_b - total_a)
        idle_delta = max(0, idle_b - idle_a)
        return round(max(0.0, min(100.0, (1 - idle_delta / total_delta) * 100)), 2)
    except Exception:
        return None

def meminfo():
    values = {}
    try:
        with open("/proc/meminfo", "r", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                key, raw = line.split(":", 1)
                values[key] = int(raw.strip().split()[0]) * 1024
    except Exception:
        return {}
    total = values.get("MemTotal", 0)
    available = values.get("MemAvailable", values.get("MemFree", 0))
    used = max(0, total - available)
    return {
        "total": total,
        "used": used,
        "available": available,
        "usedPercent": round((used / total) * 100, 2) if total else 0,
    }

def disk_usage(path="/"):
    try:
        stat = os.statvfs(path)
        total = stat.f_blocks * stat.f_frsize
        available = stat.f_bavail * stat.f_frsize
        used = max(0, total - available)
        return {
            "mount": path,
            "total": total,
            "used": used,
            "available": available,
            "usedPercent": round((used / total) * 100, 2) if total else 0,
        }
    except Exception:
        return {"mount": path, "total": 0, "used": 0, "available": 0, "usedPercent": 0}

def filesystems():
    rows = []
    try:
        output = subprocess.check_output(["df", "-P", "-B1"], text=True, stderr=subprocess.DEVNULL)
    except Exception:
        return rows
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 6:
            continue
        source, total, used, available, percent, mount = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        if source.startswith(("tmpfs", "devtmpfs", "overlay")) and mount not in {"/"}:
            continue
        try:
            total_i = int(total)
            used_i = int(used)
            available_i = int(available)
        except ValueError:
            continue
        rows.append({
            "source": source,
            "mount": mount,
            "total": total_i,
            "used": used_i,
            "available": available_i,
            "usedPercent": round((used_i / total_i) * 100, 2) if total_i else 0,
            "percent": percent,
        })
    return rows[:12]

def network():
    interfaces = []
    total_rx = 0
    total_tx = 0
    try:
        with open("/proc/net/dev", "r", encoding="utf-8", errors="ignore") as handle:
            lines = handle.readlines()[2:]
    except Exception:
        lines = []
    for line in lines:
        if ":" not in line:
            continue
        name, rest = line.split(":", 1)
        name = name.strip()
        values = rest.split()
        if len(values) < 16:
            continue
        rx = int(values[0])
        tx = int(values[8])
        interfaces.append({"name": name, "rx": rx, "tx": tx})
        if name != "lo":
            total_rx += rx
            total_tx += tx
    return {
        "rx": total_rx,
        "tx": total_tx,
        "interfaces": interfaces,
    }

def uptime_seconds():
    try:
        with open("/proc/uptime", "r", encoding="utf-8", errors="ignore") as handle:
            return int(float(handle.read().split()[0]))
    except Exception:
        return 0

def os_release():
    values = {}
    try:
        with open("/etc/os-release", "r", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                if "=" not in line:
                    continue
                key, value = line.rstrip().split("=", 1)
                values[key] = value.strip('"')
    except Exception:
        pass
    return values.get("PRETTY_NAME") or values.get("NAME") or platform.platform()

def service_state(name):
    try:
        return subprocess.check_output(["systemctl", "is-active", name], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return "unknown"

def managed_services():
    service_by_protocol = {
        "hysteria2": "hysteria-server.service",
        "trojan": "trojan.service",
    }
    protocols = []
    try:
        with open("/etc/simpleui/managed-protocols", "r", encoding="utf-8", errors="ignore") as handle:
            protocols = [line.strip() for line in handle if line.strip()]
    except Exception:
        for protocol in service_by_protocol:
            if os.path.isdir(f"/etc/simpleui/{protocol}"):
                protocols.append(protocol)
    return [
        {
            "protocol": protocol,
            "service": service_by_protocol.get(protocol, ""),
            "active": service_state(service_by_protocol.get(protocol, "")) if service_by_protocol.get(protocol) else "unknown",
        }
        for protocol in protocols
    ]

load1, load5, load15 = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
payload = {
    "hostname": socket.gethostname(),
    "os": os_release(),
    "kernel": platform.release(),
    "uptimeSeconds": uptime_seconds(),
    "cpu": {
        "usagePercent": cpu_usage(),
        "load1": round(load1, 2),
        "load5": round(load5, 2),
        "load15": round(load15, 2),
        "cores": os.cpu_count() or 0,
    },
    "memory": meminfo(),
    "disk": disk_usage("/"),
    "filesystems": filesystems(),
    "network": network(),
    "managedServices": managed_services(),
}
print("__SIMPLEUI_SERVER_STATUS__" + json.dumps(payload, ensure_ascii=False))
PY
