#!/usr/bin/env python3
import ipaddress
import json
import os
import platform
import shlex
import socket
import subprocess
import time

import common


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


def sample_delay():
    try:
        return float(os.environ.get("SIMPLEUI_STATUS_SAMPLE_DELAY", "0.25") or "0.25")
    except ValueError:
        return 0.25


def read_cpu():
    parts = common.read_text("/proc/stat").splitlines()[0].split()[1:]
    values = [int(item) for item in parts]
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    return idle, sum(values)


def cpu_usage():
    try:
        idle_a, total_a = read_cpu()
        time.sleep(max(0.05, min(sample_delay(), 1.0)))
        idle_b, total_b = read_cpu()
        total_delta = max(1, total_b - total_a)
        idle_delta = max(0, idle_b - idle_a)
        return round(max(0.0, min(100.0, (1 - idle_delta / total_delta) * 100)), 2)
    except Exception:
        return None


def meminfo():
    values = {}
    for line in common.read_text("/proc/meminfo").splitlines():
        if ":" not in line:
            continue
        key, raw = line.split(":", 1)
        values[key] = common.safe_int(raw.strip().split()[0]) * 1024
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
    output = common.capture(["df", "-P", "-B1"])
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 6:
            continue
        source, total, used, available, percent, mount = parts[:6]
        if source.startswith(("tmpfs", "devtmpfs", "overlay")) and mount != "/":
            continue
        total_i = common.safe_int(total)
        used_i = common.safe_int(used)
        available_i = common.safe_int(available)
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
    for line in common.read_text("/proc/net/dev").splitlines()[2:]:
        if ":" not in line:
            continue
        name, rest = line.split(":", 1)
        values = rest.split()
        if len(values) < 16:
            continue
        rx = common.safe_int(values[0])
        tx = common.safe_int(values[8])
        name = name.strip()
        interfaces.append({"name": name, "rx": rx, "tx": tx})
        if name != "lo":
            total_rx += rx
            total_tx += tx
    return {"rx": total_rx, "tx": total_tx, "interfaces": interfaces}


def uptime_seconds():
    try:
        return int(float(common.read_text("/proc/uptime").split()[0]))
    except Exception:
        return 0


def os_release():
    values = {}
    for line in common.read_text("/etc/os-release").splitlines():
        if "=" in line:
            key, value = line.rstrip().split("=", 1)
            values[key] = value.strip('"')
    return values.get("PRETTY_NAME") or values.get("NAME") or platform.platform()


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
    proc = common.run(["systemctl", "cat", service], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc.returncode == 0 or os.path.exists(f"/etc/systemd/system/{service}") or os.path.exists(f"/lib/systemd/system/{service}")


def first_existing_service(candidates):
    for service in candidates:
        if service_unit_exists(service):
            return service
    return candidates[0] if candidates else ""


def managed_protocols():
    protocols = [line.strip() for line in common.read_text("/etc/simpleui/managed-protocols").splitlines() if line.strip()]
    if not protocols:
        for protocol in SERVICE_BY_PROTOCOL:
            if os.path.isdir(f"/etc/simpleui/{protocol}"):
                protocols.append(protocol)
    return [protocol for protocol in dict.fromkeys(protocols) if protocol in SERVICE_BY_PROTOCOL]


def managed_services():
    services = [{
        "protocol": protocol,
        "service": SERVICE_BY_PROTOCOL.get(protocol, ""),
        "active": common.service_state(SERVICE_BY_PROTOCOL.get(protocol, "")) if SERVICE_BY_PROTOCOL.get(protocol) else "unknown",
    } for protocol in managed_protocols()]
    sing_box_service = first_existing_service(SING_BOX_SERVICES)
    if sing_box_service and service_unit_exists(sing_box_service):
        services.append({"protocol": "sing-box", "service": sing_box_service, "active": common.service_state(sing_box_service)})
    return services


def read_kv_usernames(path):
    usernames = []
    for raw in common.read_text(path).splitlines():
        if ":" not in raw:
            continue
        username, _ = raw.split(":", 1)
        username = username.strip()
        if username:
            usernames.append(username)
    return usernames


def read_json_usernames(path):
    data = common.read_json(path)
    if isinstance(data, dict):
        return [str(key).strip() for key in data if str(key).strip()]
    if isinstance(data, list):
        return [str(item.get("username", "")).strip() for item in data if isinstance(item, dict) and str(item.get("username", "")).strip()]
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
        return json.loads(strip_json_comments(common.read_text(path)))
    except Exception:
        return None


def normalize_blacklist_target(raw):
    try:
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
    for line in common.read_text("/etc/simpleui/banned-source-ips.txt").splitlines():
        normalized = normalize_blacklist_target(line.strip())
        if normalized:
            targets.append(normalized)
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

    for node in discovered_nodes:
        remote_key = str(node.get("remoteKey") or "").strip()
        if not remote_key:
            continue
        for target in read_legacy_blacklist_targets():
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
    output = common.capture(["systemctl", "cat", service])
    tokens = []
    for raw in output.splitlines():
        line = raw.strip()
        if not line.startswith("ExecStart="):
            continue
        try:
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
    return "" if value in {"", "::", "0.0.0.0", "[::]", "*"} else value


def sing_box_usernames(inbound):
    names = []
    for item in inbound.get("users") or []:
        if isinstance(item, dict):
            names.append(item.get("name") or item.get("username") or item.get("uuid") or "")
    return unique_strings(names)


def discover_sing_box_nodes(skip_pairs):
    nodes = []
    service = first_existing_service(SING_BOX_SERVICES)
    if not service or not service_unit_exists(service):
        return nodes
    active = common.service_state(service)
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
            port = common.int_or_none(inbound.get("listen_port"))
            if not port or (protocol, port) in skip_pairs:
                continue
            tag = str(inbound.get("tag") or f"{protocol}-{index + 1}").strip()
            tls = inbound.get("tls") if isinstance(inbound.get("tls"), dict) else {}
            nodes.append({
                "protocol": protocol,
                "name": f"{protocol_name(protocol)} {tag}",
                "service": service,
                "serviceProtocol": protocol_service_proto(protocol, inbound.get("network", "")),
                "configPath": config_path,
                "remoteKey": f"sing-box:{config_path}:inbound:{tag}:{port}",
                "domain": "",
                "connectHost": endpoint_host_from_listen(inbound.get("listen")),
                "listenPort": port,
                "active": active,
                "users": sing_box_usernames(inbound),
                "managedBy": "sing-box",
                "importSource": "sing-box-discovery",
                "monitorOnly": True,
                "certPath": tls.get("certificate_path") or tls.get("certificate") or "",
                "keyPath": tls.get("key_path") or tls.get("key") or "",
                "tag": tag,
            })
        for index, endpoint in enumerate(config.get("endpoints") or []):
            if not isinstance(endpoint, dict):
                continue
            protocol = str(endpoint.get("type") or "").strip().lower()
            port = common.int_or_none(endpoint.get("listen_port"))
            if protocol != "wireguard" or not port or (protocol, port) in skip_pairs:
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
        env = common.read_env_file(env_path)
        if not env and not os.path.isdir(f"/etc/simpleui/{protocol}"):
            continue
        service = env.get("SIMPLEUI_SERVICE") or SERVICE_BY_PROTOCOL.get(protocol, "")
        config = env.get("SIMPLEUI_CONFIG") or CONFIG_BY_PROTOCOL.get(protocol, "")
        port = common.int_or_none(env.get("SIMPLEUI_PORT")) or (443 if protocol in {"hysteria2", "trojan"} else None)
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
            "active": common.service_state(service) if service else "unknown",
            "users": users,
            "managedEnvPath": env_path,
            "managedBy": "simpleui",
            "importSource": "remote-discovery",
            "monitorOnly": False,
        }
        if protocol == "hysteria2":
            jump_start = common.int_or_none(env.get("SIMPLEUI_JUMP_PORT_START"))
            jump_end = common.int_or_none(env.get("SIMPLEUI_JUMP_PORT_END"))
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


def main():
    common.bootstrap()
    discovered_nodes = discover_nodes()
    load1, load5, load15 = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
    common.emit("__SIMPLEUI_SERVER_STATUS__", {
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
    })


if __name__ == "__main__":
    main()
