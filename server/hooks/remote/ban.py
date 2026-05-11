#!/usr/bin/env python3
import ipaddress
import json
import os
import pathlib
import subprocess
from datetime import datetime, timezone

import common


BLACKLIST_STORE = "/etc/simpleui/source-ip-blacklist.json"
LEGACY_BLACKLIST = "/etc/simpleui/banned-source-ips.txt"


def normalize_target(raw):
    text = str(raw or "").strip()
    if text.startswith("[") and "]" in text:
        host = text[1:text.index("]")]
        suffix = text[text.index("]") + 1:]
        text = f"{host}{suffix}" if suffix.startswith("/") else host
    elif text.count(":") == 1 and "." in text:
        text = text.rsplit(":", 1)[0]
    parsed = ipaddress.ip_network(text, strict=False) if "/" in text else ipaddress.ip_address(text)
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped:
        parsed = parsed.ipv4_mapped
    elif isinstance(parsed, ipaddress.IPv6Network) and parsed.network_address.ipv4_mapped and parsed.prefixlen >= 96:
        parsed = ipaddress.ip_network(f"{parsed.network_address.ipv4_mapped}/{parsed.prefixlen - 96}", strict=False)
    return str(parsed), parsed.version


def iptables_tool(family):
    if family == 6 and common.command_exists("ip6tables"):
        return "ip6tables"
    if family == 4 and common.command_exists("iptables"):
        return "iptables"
    return ""


def rule_args(proto, source_ip, port=None):
    args = ["INPUT"]
    if port:
        args.extend(["-p", proto, "--dport", str(port), "-s", source_ip, "-j", "DROP"])
    else:
        args.extend(["-s", source_ip, "-j", "DROP"])
    return args


def add_iptables_rule(tool, proto, source_ip, port):
    args = rule_args(proto, source_ip, port)
    if common.run([tool, "-C", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        common.run([tool, "-I", *args])


def remove_iptables_rule(tool, proto, source_ip, port):
    if port:
        args = rule_args(proto, source_ip, port)
        while common.run([tool, "-C", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            if common.run([tool, "-D", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
                break
    args = rule_args(proto, source_ip, None)
    while common.run([tool, "-C", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        if common.run([tool, "-D", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
            break


def ensure_nft_chain():
    if not common.command_exists("nft"):
        return False
    common.run(["nft", "add", "table", "inet", "simpleui"], check=False)
    common.run(["nft", "add", "chain", "inet", "simpleui", "input", "{ type filter hook input priority -10; policy accept; }"], check=False)
    return True


def add_nft_rule(proto, family, source_ip, port):
    if not ensure_nft_chain():
        return
    family_expr = "ip6" if family == 6 else "ip"
    args = ["nft", "add", "rule", "inet", "simpleui", "input"]
    if port:
        args.extend(["meta", "l4proto", proto, "th", "dport", str(port), family_expr, "saddr", source_ip, "drop"])
    else:
        args.extend([family_expr, "saddr", source_ip, "drop"])
    common.run(args, check=False)


def remove_nft_rule(proto, family, source_ip, port):
    if not common.command_exists("nft"):
        return
    family_expr = "ip6 saddr" if family == 6 else "ip saddr"
    output = common.capture(["nft", "-a", "list", "chain", "inet", "simpleui", "input"])
    for line in output.splitlines():
        if family_expr not in line or source_ip not in line:
            continue
        if port and (f"dport {port}" not in line or proto not in line):
            continue
        handle = line.split()[-1] if line.split() else ""
        if handle:
            common.run(["nft", "delete", "rule", "inet", "simpleui", "input", "handle", handle], check=False)


def apply_firewall(action, source_ip, family, protocols, port):
    tool = iptables_tool(family)
    if not tool and not common.command_exists("nft"):
        common.log("Neither iptables/ip6tables nor nft is available.")
        raise SystemExit(42)
    for proto in protocols.split(","):
        if proto not in {"tcp", "udp"}:
            continue
        if action == "ban":
            if tool:
                add_iptables_rule(tool, proto, source_ip, port)
            else:
                add_nft_rule(proto, family, source_ip, port)
        else:
            if tool:
                remove_iptables_rule(tool, proto, source_ip, port)
            remove_nft_rule(proto, family, source_ip, port)


def update_blacklist_store(action, source_ip, family, remote_key, protocol, service, service_proto, config_path, port, node_name):
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    data = common.read_json(BLACKLIST_STORE, {})
    if not isinstance(data, dict):
        data = {}
    data.setdefault("version", 1)
    nodes = data.setdefault("nodes", {})
    node = nodes.setdefault(remote_key, {
        "remoteKey": remote_key,
        "protocol": protocol,
        "service": service,
        "serviceProtocol": service_proto,
        "configPath": config_path,
        "listenPort": int(port) if str(port).isdigit() else None,
        "nodeName": node_name,
        "targets": {},
    })
    node.update({
        "remoteKey": remote_key,
        "protocol": protocol,
        "service": service,
        "serviceProtocol": service_proto,
        "configPath": config_path,
        "listenPort": int(port) if str(port).isdigit() else None,
        "nodeName": node_name,
        "updatedAt": now,
    })
    targets = node.setdefault("targets", {})

    if action == "unban":
        targets.pop(source_ip, None)
        if not targets:
            nodes.pop(remote_key, None)
    else:
        current = targets.get(source_ip) if isinstance(targets.get(source_ip), dict) else {}
        targets[source_ip] = {
            **current,
            "target": source_ip,
            "targetKind": "source-ip",
            "ipFamily": family,
            "status": "active",
            "createdAt": current.get("createdAt") or now,
            "updatedAt": now,
        }

    data["updatedAt"] = now
    common.atomic_write(BLACKLIST_STORE, json.dumps(data, ensure_ascii=False, indent=2), 0o600)
    common.emit("__SIMPLEUI_RESULT__", {
        "ok": True,
        "action": action,
        "kind": "source-ip",
        "target": source_ip,
        "ipFamily": family,
        "remoteKey": remote_key,
        "protocol": protocol,
        "serviceProtocol": service_proto,
        "listenPort": int(port) if str(port).isdigit() else None,
        "createdAt": targets.get(source_ip, {}).get("createdAt") if action == "ban" else None,
    })


def remove_legacy_target(source_ip, action):
    if action != "unban" or not pathlib.Path(LEGACY_BLACKLIST).exists():
        return
    lines = [line for line in common.read_text(LEGACY_BLACKLIST).splitlines() if line != source_ip]
    if lines:
        common.atomic_write(LEGACY_BLACKLIST, "\n".join(lines), 0o600)
    else:
        common.rm_f(LEGACY_BLACKLIST)


def main():
    common.bootstrap()
    target = os.environ.get("SIMPLEUI_BAN_IP", "")
    action = os.environ.get("SIMPLEUI_BAN_ACTION", "ban")
    protocol = os.environ.get("SIMPLEUI_PROTOCOL", "hysteria2")
    service = os.environ.get("SIMPLEUI_SERVICE", "")
    service_proto_raw = os.environ.get("SIMPLEUI_SERVICE_PROTO", "")
    config_path = os.environ.get("SIMPLEUI_CONFIG", "")
    port = os.environ.get("SIMPLEUI_PORT", "")
    node_name = os.environ.get("SIMPLEUI_NODE_NAME", "")
    remote_key = os.environ.get("SIMPLEUI_REMOTE_KEY", "")

    if not target:
        common.log("No connection source IP supplied.")
        raise SystemExit(40)
    if action in {"ban", "add", "block"}:
        action = "ban"
    elif action in {"unban", "remove", "delete", "unblock"}:
        action = "unban"
    else:
        common.log(f"Unsupported blacklist action: {action}")
        raise SystemExit(43)

    try:
        source_ip, family = normalize_target(target)
    except ValueError:
        common.log(f"Invalid connection source IP: {target}")
        raise SystemExit(41)

    service_proto = common.normalize_service_protocols(service_proto_raw, protocol)
    if not remote_key:
        remote_key = f"{protocol}:{config_path or 'managed'}:{port or ''}"

    if action == "ban":
        common.log(f"Adding node-scoped firewall DROP rule for {source_ip} on {node_name or remote_key}")
    else:
        common.log(f"Removing node-scoped firewall DROP rule for {source_ip} on {node_name or remote_key}")

    apply_firewall(action, source_ip, family, service_proto, port)
    update_blacklist_store(action, source_ip, family, remote_key, protocol, service, service_proto, config_path, port, node_name)
    remove_legacy_target(source_ip, action)
    common.save_firewall()


if __name__ == "__main__":
    main()
