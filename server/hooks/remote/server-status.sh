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
    if not name:
        return "unknown"
    try:
        proc = subprocess.run(["systemctl", "is-active", name], text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        return proc.stdout.strip() or "unknown"
    except Exception:
        return "unknown"

SERVICE_BY_PROTOCOL = {
    "hysteria2": "hysteria-server.service",
    "trojan": "trojan.service",
}

CONFIG_BY_PROTOCOL = {
    "hysteria2": "/etc/hysteria/config.yaml",
    "trojan": "/usr/src/trojan/server.conf",
}

PROTOCOL_META = {
    "hysteria2": {"name": "Hysteria2", "serviceProtocol": "udp"},
    "trojan": {"name": "Trojan", "serviceProtocol": "tcp"},
    "shadowsocks": {"name": "Shadowsocks", "serviceProtocol": "tcp,udp"},
    "vmess": {"name": "VMess", "serviceProtocol": "tcp"},
    "vless": {"name": "VLESS", "serviceProtocol": "tcp"},
    "naive": {"name": "Naive", "serviceProtocol": "tcp,udp"},
    "hysteria": {"name": "Hysteria", "serviceProtocol": "udp"},
    "shadowtls": {"name": "ShadowTLS", "serviceProtocol": "tcp"},
    "tuic": {"name": "TUIC", "serviceProtocol": "udp"},
    "anytls": {"name": "AnyTLS", "serviceProtocol": "tcp"},
    "wireguard": {"name": "WireGuard", "serviceProtocol": "udp"},
    "socks": {"name": "SOCKS", "serviceProtocol": "tcp"},
    "http": {"name": "HTTP", "serviceProtocol": "tcp"},
    "mixed": {"name": "Mixed", "serviceProtocol": "tcp"},
}

SING_BOX_INBOUND_PROTOCOLS = {
    "mixed", "socks", "http", "shadowsocks", "vmess", "trojan", "naive",
    "hysteria", "shadowtls", "vless", "tuic", "hysteria2", "anytls",
}

SING_BOX_SERVICES = ["sing-box.service", "singbox.service"]
SING_BOX_CONFIG_CANDIDATES = [
    "/etc/sing-box/config.json",
    "/usr/local/etc/sing-box/config.json",
    "/usr/local/etc/singbox/config.json",
    "/etc/singbox/config.json",
    "/opt/sing-box/config.json",
]

def protocol_name(protocol):
    return PROTOCOL_META.get(protocol, {}).get("name") or protocol

def protocol_service_proto(protocol, network=""):
    configured = str(network or "").strip().lower()
    if configured:
        values = []
        for part in configured.replace("/", ",").replace(" ", ",").split(","):
            if part in {"tcp", "udp"} and part not in values:
                values.append(part)
        if values:
            return ",".join(values)
    return PROTOCOL_META.get(protocol, {}).get("serviceProtocol") or "tcp"

def service_unit_exists(service):
    if not service:
        return False
    try:
        proc = subprocess.run(["systemctl", "cat", service], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if proc.returncode == 0:
            return True
    except Exception:
        pass
    return os.path.exists(f"/etc/systemd/system/{service}") or os.path.exists(f"/lib/systemd/system/{service}")

def first_existing_service(candidates):
    for service in candidates:
        if service_unit_exists(service):
            return service
    return candidates[0] if candidates else ""

def managed_protocols():
    protocols = []
    try:
        with open("/etc/simpleui/managed-protocols", "r", encoding="utf-8", errors="ignore") as handle:
            protocols = [line.strip() for line in handle if line.strip()]
    except Exception:
        for protocol in SERVICE_BY_PROTOCOL:
            if os.path.isdir(f"/etc/simpleui/{protocol}"):
                protocols.append(protocol)
    return [protocol for protocol in dict.fromkeys(protocols) if protocol in SERVICE_BY_PROTOCOL]

def managed_services():
    services = [
        {
            "protocol": protocol,
            "service": SERVICE_BY_PROTOCOL.get(protocol, ""),
            "active": service_state(SERVICE_BY_PROTOCOL.get(protocol, "")) if SERVICE_BY_PROTOCOL.get(protocol) else "unknown",
        }
        for protocol in managed_protocols()
    ]
    sing_box_service = first_existing_service(SING_BOX_SERVICES)
    if sing_box_service and service_unit_exists(sing_box_service):
        services.append({
            "protocol": "sing-box",
            "service": sing_box_service,
            "active": service_state(sing_box_service),
        })
    return services

def read_env_file(path):
    values = {}
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
                    value = value[1:-1]
                if key.startswith("SIMPLEUI_"):
                    values[key] = value
    except Exception:
        pass
    return values

def int_or_none(value):
    try:
        number = int(str(value or "").strip())
        return number if 1 <= number <= 65535 else None
    except Exception:
        return None

def read_kv_usernames(path):
    usernames = []
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            for raw in handle:
                if ":" not in raw:
                    continue
                username, _ = raw.split(":", 1)
                username = username.strip()
                if username:
                    usernames.append(username)
    except Exception:
        pass
    return usernames

def read_json_usernames(path):
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            data = json.load(handle)
    except Exception:
        return []
    if isinstance(data, dict):
        return [str(key).strip() for key in data if str(key).strip()]
    if isinstance(data, list):
        names = []
        for item in data:
            if isinstance(item, dict) and str(item.get("username", "")).strip():
                names.append(str(item.get("username")).strip())
        return names
    return []

def unique_strings(values):
    output = []
    seen = set()
    for value in values:
        text = str(value or "").strip()
        if text and text not in seen:
            seen.add(text)
            output.append(text)
    return output

def strip_json_comments(text):
    output = []
    index = 0
    in_string = False
    escaped = False
    while index < len(text):
        char = text[index]
        next_char = text[index + 1] if index + 1 < len(text) else ""
        if in_string:
            output.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            index += 1
            continue
        if char == '"':
            in_string = True
            output.append(char)
            index += 1
            continue
        if char == "/" and next_char == "/":
            index += 2
            while index < len(text) and text[index] not in "\r\n":
                index += 1
            continue
        if char == "/" and next_char == "*":
            index += 2
            while index + 1 < len(text) and not (text[index] == "*" and text[index + 1] == "/"):
                index += 1
            index += 2
            continue
        output.append(char)
        index += 1
    return "".join(output)

def read_json_file(path):
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            raw = handle.read()
        return json.loads(strip_json_comments(raw))
    except Exception:
        return None

def normalize_blacklist_target(raw):
    try:
        import ipaddress
        text = str(raw or "").strip()
        if not text:
            return None
        parsed = ipaddress.ip_network(text, strict=False) if "/" in text else ipaddress.ip_address(text)
        if getattr(parsed, "ipv4_mapped", None):
            parsed = parsed.ipv4_mapped
        elif hasattr(parsed, "network_address") and getattr(parsed.network_address, "ipv4_mapped", None) and parsed.prefixlen >= 96:
            parsed = ipaddress.ip_network(f"{parsed.network_address.ipv4_mapped}/{parsed.prefixlen - 96}", strict=False)
        return {"target": str(parsed), "ipFamily": parsed.version}
    except Exception:
        return None

def read_legacy_blacklist_targets():
    targets = []
    try:
        with open("/etc/simpleui/banned-source-ips.txt", "r", encoding="utf-8", errors="ignore") as handle:
            for line in handle:
                normalized = normalize_blacklist_target(line.strip())
                if normalized:
                    targets.append(normalized)
    except Exception:
        pass
    unique = {}
    for item in targets:
        unique[item["target"]] = item
    return list(unique.values())

def discover_blacklists(discovered_nodes):
    records = []
    seen = set()
    data = read_json_file("/etc/simpleui/source-ip-blacklist.json")
    nodes = data.get("nodes") if isinstance(data, dict) and isinstance(data.get("nodes"), dict) else {}
    for remote_key, node_entry in nodes.items():
        if not isinstance(node_entry, dict):
            continue
        targets = node_entry.get("targets") if isinstance(node_entry.get("targets"), dict) else {}
        for target_key, target_entry in targets.items():
            entry = target_entry if isinstance(target_entry, dict) else {"target": target_key}
            if str(entry.get("status") or "active") not in {"active", "pending"}:
                continue
            normalized = normalize_blacklist_target(entry.get("target") or target_key)
            if not normalized:
                continue
            key = (str(node_entry.get("remoteKey") or remote_key), normalized["target"])
            seen.add(key)
            records.append({
                "remoteKey": key[0],
                "protocol": node_entry.get("protocol", ""),
                "service": node_entry.get("service", ""),
                "serviceProtocol": node_entry.get("serviceProtocol", ""),
                "configPath": node_entry.get("configPath", ""),
                "listenPort": node_entry.get("listenPort"),
                "nodeName": node_entry.get("nodeName", ""),
                "target": normalized["target"],
                "ipFamily": normalized["ipFamily"],
                "targetKind": "source-ip",
                "source": "simpleui",
                "createdAt": entry.get("createdAt"),
                "updatedAt": entry.get("updatedAt"),
            })

    legacy_targets = read_legacy_blacklist_targets()
    for node in discovered_nodes:
        remote_key = str(node.get("remoteKey") or "").strip()
        if not remote_key:
            continue
        for target in legacy_targets:
            key = (remote_key, target["target"])
            if key in seen:
                continue
            records.append({
                "remoteKey": remote_key,
                "protocol": node.get("protocol", ""),
                "service": node.get("service", ""),
                "serviceProtocol": node.get("serviceProtocol", ""),
                "configPath": node.get("configPath", ""),
                "listenPort": node.get("listenPort"),
                "nodeName": node.get("name", ""),
                "target": target["target"],
                "ipFamily": target["ipFamily"],
                "targetKind": "source-ip",
                "source": "legacy-server",
            })
    return records

def systemd_exec_configs(service):
    configs = []
    if not service:
        return configs
    try:
        output = subprocess.check_output(["systemctl", "cat", service], text=True, stderr=subprocess.DEVNULL)
    except Exception:
        return configs
    tokens = []
    for raw in output.splitlines():
        line = raw.strip()
        if not line.startswith("ExecStart="):
            continue
        try:
            import shlex
            tokens.extend(shlex.split(line.split("=", 1)[1]))
        except Exception:
            tokens.extend(line.split())
    for index, token in enumerate(tokens):
        if token in {"-c", "--config"} and index + 1 < len(tokens):
            configs.append(tokens[index + 1])
        elif token.startswith("--config="):
            configs.append(token.split("=", 1)[1])
    return configs

def sing_box_config_paths(service):
    paths = []
    for path in systemd_exec_configs(service) + SING_BOX_CONFIG_CANDIDATES:
        clean = str(path or "").strip()
        if clean and clean not in paths and os.path.isfile(clean):
            paths.append(clean)
    return paths

def endpoint_host_from_listen(listen):
    value = str(listen or "").strip()
    if value in {"", "::", "0.0.0.0", "[::]", "*"}:
        return ""
    return value

def sing_box_usernames(inbound):
    names = []
    for item in inbound.get("users") or []:
        if not isinstance(item, dict):
            continue
        names.append(item.get("name") or item.get("username") or item.get("uuid") or "")
    return unique_strings(names)

def discover_sing_box_nodes(skip_pairs):
    nodes = []
    service = first_existing_service(SING_BOX_SERVICES)
    if not service or not service_unit_exists(service):
        return nodes
    active = service_state(service)
    for config_path in sing_box_config_paths(service):
        config = read_json_file(config_path)
        if not isinstance(config, dict):
            continue
        for index, inbound in enumerate(config.get("inbounds") or []):
            if not isinstance(inbound, dict):
                continue
            protocol = str(inbound.get("type") or "").strip().lower()
            if protocol not in SING_BOX_INBOUND_PROTOCOLS:
                continue
            port = int_or_none(inbound.get("listen_port"))
            if not port:
                continue
            pair = (protocol, port)
            if pair in skip_pairs:
                continue
            tag = str(inbound.get("tag") or f"{protocol}-{index + 1}").strip()
            listen = endpoint_host_from_listen(inbound.get("listen"))
            service_protocol = protocol_service_proto(protocol, inbound.get("network", ""))
            tls = inbound.get("tls") if isinstance(inbound.get("tls"), dict) else {}
            cert_path = tls.get("certificate_path") or tls.get("certificate") or ""
            key_path = tls.get("key_path") or tls.get("key") or ""
            nodes.append({
                "protocol": protocol,
                "name": f"{protocol_name(protocol)} {tag}",
                "service": service,
                "serviceProtocol": service_protocol,
                "configPath": config_path,
                "remoteKey": f"sing-box:{config_path}:inbound:{tag}:{port}",
                "domain": "",
                "connectHost": listen,
                "listenPort": port,
                "active": active,
                "users": sing_box_usernames(inbound),
                "managedBy": "sing-box",
                "importSource": "sing-box-discovery",
                "monitorOnly": True,
                "certPath": cert_path,
                "keyPath": key_path,
                "tag": tag,
            })
        for index, endpoint in enumerate(config.get("endpoints") or []):
            if not isinstance(endpoint, dict):
                continue
            protocol = str(endpoint.get("type") or "").strip().lower()
            if protocol != "wireguard":
                continue
            port = int_or_none(endpoint.get("listen_port"))
            if not port:
                continue
            pair = (protocol, port)
            if pair in skip_pairs:
                continue
            tag = str(endpoint.get("tag") or endpoint.get("name") or f"wireguard-{index + 1}").strip()
            nodes.append({
                "protocol": "wireguard",
                "name": f"WireGuard {tag}",
                "service": service,
                "serviceProtocol": "udp",
                "configPath": config_path,
                "remoteKey": f"sing-box:{config_path}:endpoint:{tag}:{port}",
                "domain": "",
                "connectHost": "",
                "listenPort": port,
                "active": active,
                "users": [],
                "managedBy": "sing-box",
                "importSource": "sing-box-discovery",
                "monitorOnly": True,
                "tag": tag,
            })
    return nodes

def discover_nodes():
    nodes = []
    skip_pairs = set()
    for protocol in managed_protocols():
        env_path = f"/etc/simpleui/{protocol}/managed.env"
        env = read_env_file(env_path)
        if not env and not os.path.isdir(f"/etc/simpleui/{protocol}"):
            continue
        service = env.get("SIMPLEUI_SERVICE") or SERVICE_BY_PROTOCOL.get(protocol, "")
        config = env.get("SIMPLEUI_CONFIG") or CONFIG_BY_PROTOCOL.get(protocol, "")
        port = int_or_none(env.get("SIMPLEUI_PORT")) or (443 if protocol in {"hysteria2", "trojan"} else None)
        if port:
            skip_pairs.add((protocol, port))
        domain = env.get("SIMPLEUI_DOMAIN", "")
        connect_host = env.get("SIMPLEUI_CONNECT_HOST") or domain
        users = unique_strings(
            read_kv_usernames(f"/etc/simpleui/{protocol}/users.kv") +
            read_json_usernames(f"/etc/simpleui/{protocol}/users.json") +
            read_json_usernames(f"/etc/simpleui/{protocol}/share-links.json")
        )
        node = {
            "protocol": protocol,
            "name": "HY2" if protocol == "hysteria2" else "Trojan",
            "service": service,
            "serviceProtocol": protocol_service_proto(protocol),
            "configPath": config,
            "remoteKey": f"{protocol}:{config}:{port or ''}",
            "domain": domain,
            "connectHost": connect_host,
            "listenPort": port,
            "active": service_state(service) if service else "unknown",
            "users": users,
            "managedEnvPath": env_path,
            "managedBy": "simpleui",
            "importSource": "remote-discovery",
            "monitorOnly": False,
        }
        if protocol == "hysteria2":
            jump_start = int_or_none(env.get("SIMPLEUI_JUMP_PORT_START"))
            jump_end = int_or_none(env.get("SIMPLEUI_JUMP_PORT_END"))
            node.update({
                "tlsMode": env.get("SIMPLEUI_TLS_MODE") or "acme-http",
                "selfSignedHost": connect_host if env.get("SIMPLEUI_TLS_MODE") == "self-signed" else "",
                "portHoppingEnabled": bool(jump_start and jump_end),
                "jumpPortStart": jump_start,
                "jumpPortEnd": jump_end,
                "jumpPortInterface": env.get("SIMPLEUI_JUMP_PORT_INTERFACE", ""),
                "jumpPortIpv6Enabled": bool(env.get("SIMPLEUI_JUMP_PORT_IPV6_INTERFACE")),
                "jumpPortIpv6Interface": env.get("SIMPLEUI_JUMP_PORT_IPV6_INTERFACE", ""),
            })
        elif protocol == "trojan":
            node.update({
                "tlsMode": "acme-http",
                "certPath": os.path.join(env.get("SIMPLEUI_CERT_DIR") or "/usr/src/trojan-cert", "fullchain.cer"),
                "keyPath": os.path.join(env.get("SIMPLEUI_CERT_DIR") or "/usr/src/trojan-cert", "private.key"),
            })
        nodes.append(node)
    nodes.extend(discover_sing_box_nodes(skip_pairs))
    return nodes

discovered_nodes = discover_nodes()
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
    "discoveredNodes": discovered_nodes,
    "blacklists": discover_blacklists(discovered_nodes),
}
print("__SIMPLEUI_SERVER_STATUS__" + json.dumps(payload, ensure_ascii=False))
PY
