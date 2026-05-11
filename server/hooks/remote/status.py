#!/usr/bin/env python3
import ipaddress
import json
import os
import pathlib

import common


def default_service_for_protocol(protocol):
    if protocol == "hysteria2":
        return "hysteria-server.service"
    if protocol == "trojan":
        return "trojan.service"
    return ""


def command_first_line(args):
    return common.capture(args).splitlines()[0] if common.capture(args).splitlines() else ""


def curl_json(url, secret):
    return common.capture(["curl", "-fsS", "-H", f"Authorization: {secret}", url]).strip() or "{}"


def parse(raw, fallback):
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def enable_conntrack_accounting():
    path = pathlib.Path("/proc/sys/net/netfilter/nf_conntrack_acct")
    try:
        if os.access(path, os.W_OK):
            path.write_text("1", encoding="utf-8")
    except OSError:
        pass
    try:
        directory = pathlib.Path("/etc/sysctl.d")
        if directory.is_dir() and os.access(directory, os.W_OK):
            common.write_text("/etc/sysctl.d/99-simpleui-conntrack.conf", "net.netfilter.nf_conntrack_acct = 1\n")
    except OSError:
        pass


def traffic_prefix(protocol, port):
    return "".join(char if char.isalnum() or char == "_" else "_" for char in f"{protocol}_{port}")


def ensure_nft_rule(chain, needle, rule):
    output = common.capture(["nft", "list", "chain", "inet", "simpleui_traffic", chain])
    if needle not in output:
        common.run(["nft", rule], check=False)


def ensure_nft_traffic_accounting(prefix, protocols, port):
    if not common.command_exists("nft"):
        return False
    rx4 = f"{prefix}_rx4"
    tx4 = f"{prefix}_tx4"
    rx6 = f"{prefix}_rx6"
    tx6 = f"{prefix}_tx6"
    common.run(["nft", "add", "table", "inet", "simpleui_traffic"], check=False)
    common.run(["nft", "add chain inet simpleui_traffic input { type filter hook input priority -151; policy accept; }"], check=False)
    common.run(["nft", "add chain inet simpleui_traffic output { type filter hook output priority -151; policy accept; }"], check=False)
    for name, family in [(rx4, "ipv4_addr"), (tx4, "ipv4_addr"), (rx6, "ipv6_addr"), (tx6, "ipv6_addr")]:
        common.run(["nft", f"add set inet simpleui_traffic {name} {{ type {family}; flags dynamic; counter; }}"], check=False)
    for proto in protocols.split(","):
        if proto not in {"tcp", "udp"}:
            continue
        ensure_nft_rule("input", f"{proto} dport {port} update @{rx4}", f"add rule inet simpleui_traffic input meta nfproto ipv4 {proto} dport {port} update @{rx4} {{ ip saddr counter }}")
        ensure_nft_rule("output", f"{proto} sport {port} update @{tx4}", f"add rule inet simpleui_traffic output meta nfproto ipv4 {proto} sport {port} update @{tx4} {{ ip daddr counter }}")
        ensure_nft_rule("input", f"{proto} dport {port} update @{rx6}", f"add rule inet simpleui_traffic input meta nfproto ipv6 {proto} dport {port} update @{rx6} {{ ip6 saddr counter }}")
        ensure_nft_rule("output", f"{proto} sport {port} update @{tx6}", f"add rule inet simpleui_traffic output meta nfproto ipv6 {proto} sport {port} update @{tx6} {{ ip6 daddr counter }}")
    return True


def read_conntrack_lines(port):
    rows = []
    for path in ["/proc/net/nf_conntrack", "/proc/net/ip_conntrack"]:
        for line in common.read_text(path).splitlines():
            if f"dport={port}" in line:
                rows.append(line)
    return "\n".join(rows[-2000:])


def local_ips():
    values = []
    for line in common.capture(["ip", "-o", "addr", "show"]).splitlines():
        parts = line.split()
        if len(parts) > 3 and "/" in parts[3]:
            values.append(parts[3].split("/", 1)[0])
    return ",".join(values)


def interface_totals():
    rx = 0
    tx = 0
    for line in common.read_text("/proc/net/dev").splitlines()[2:]:
        values = line.split()
        if len(values) >= 10:
            rx += common.safe_int(values[1])
            tx += common.safe_int(values[9])
    return json.dumps({"rx": rx, "tx": tx})


def split_endpoint(endpoint):
    endpoint = endpoint.strip().strip('"')
    if not endpoint or endpoint in {"*", "*:*", "0.0.0.0:*", "[::]:*"}:
        return "", ""
    if endpoint.startswith("[") and "]" in endpoint:
        host = endpoint[1:endpoint.index("]")]
        suffix = endpoint[endpoint.index("]") + 1:]
        return host, suffix[1:] if suffix.startswith(":") else ""
    if endpoint.count(":") == 1:
        return tuple(endpoint.rsplit(":", 1))
    if ":" in endpoint:
        host, port_value = endpoint.rsplit(":", 1)
        if port_value == "*" or port_value.isdigit():
            try:
                ipaddress.ip_address(host)
                return host, port_value
            except ValueError:
                pass
        try:
            ipaddress.ip_address(endpoint)
            return endpoint, ""
        except ValueError:
            return endpoint, ""
    return endpoint, ""


def normalize_ip(value):
    try:
        address = ipaddress.ip_address(value)
        if getattr(address, "ipv4_mapped", None):
            return str(address.ipv4_mapped)
        return str(address)
    except ValueError:
        return ""


def clean_source_ip(remote):
    host, _ = split_endpoint(remote)
    return normalize_ip(host)


def ip_family(host):
    try:
        return ipaddress.ip_address(host).version
    except ValueError:
        return None


def conntrack_groups(line):
    groups = []
    current = {}
    for token in line.split():
        if "=" not in token:
            continue
        key, value = token.split("=", 1)
        if key == "src" and "src" in current:
            groups.append(current)
            current = {}
        current[key] = value
    if current:
        groups.append(current)
    return groups


def add_remote_traffic(bucket, remote_ip, proto, rx, tx):
    remote_ip = normalize_ip(remote_ip)
    if not remote_ip:
        return
    item = bucket.setdefault(remote_ip, {
        "remoteIp": remote_ip,
        "clientIp": remote_ip,
        "ipFamily": ip_family(remote_ip),
        "rx": 0,
        "tx": 0,
        "connections": 0,
        "protocols": set(),
    })
    item["rx"] += max(0, common.safe_int(rx))
    item["tx"] += max(0, common.safe_int(tx))
    item["connections"] += 1
    if proto:
        item["protocols"].add(proto)


def add_counter_traffic(bucket, remote_ip, direction, byte_count, proto):
    remote_ip = normalize_ip(remote_ip)
    if not remote_ip:
        return
    item = bucket.setdefault(remote_ip, {
        "remoteIp": remote_ip,
        "clientIp": remote_ip,
        "ipFamily": ip_family(remote_ip),
        "rx": 0,
        "tx": 0,
        "connections": 0,
        "protocols": set(),
    })
    item[direction] += max(0, common.safe_int(byte_count))
    if proto:
        item["protocols"].add(proto)


def nft_remote_traffic(raw, prefix, proto):
    bucket = {}
    data = parse(raw, {})
    directions = {
        f"{prefix}_rx4": "rx",
        f"{prefix}_rx6": "rx",
        f"{prefix}_tx4": "tx",
        f"{prefix}_tx6": "tx",
    }
    for entry in data.get("nftables", []):
        nft_set = entry.get("set")
        if not nft_set:
            continue
        direction = directions.get(nft_set.get("name"))
        if not direction:
            continue
        for wrapper in nft_set.get("elem", []):
            elem = wrapper.get("elem", wrapper)
            add_counter_traffic(bucket, elem.get("val"), direction, elem.get("counter", {}).get("bytes", 0), proto)
    return bucket


def conntrack_remote_traffic(raw, service_port, local_ip_set):
    bucket = {}
    service_port = str(service_port or "")
    if not service_port or not local_ip_set:
        return bucket
    for line in raw.splitlines():
        parts = line.split()
        proto = next((part for part in parts[:6] if part in {"tcp", "udp"}), "")
        groups = conntrack_groups(line)
        if not groups:
            continue
        first = groups[0]
        second = groups[1] if len(groups) > 1 else {}
        first_src = normalize_ip(first.get("src", ""))
        first_dst = normalize_ip(first.get("dst", ""))
        if first.get("dport") == service_port and first_dst in local_ip_set and first_src not in local_ip_set:
            add_remote_traffic(bucket, first.get("src", ""), proto, first.get("bytes"), second.get("bytes", 0))
    return bucket


def compact_client_connections(rows, service_proto_label):
    bucket = {}
    for connection in rows:
        source_ip = normalize_ip(connection.get("sourceIp", ""))
        if not source_ip:
            continue
        item = bucket.setdefault(source_ip, {
            "protocol": "",
            "protocols": set(),
            "sourceIp": source_ip,
            "remote": "",
            "local": "",
            "state": "",
            "auth": connection.get("auth"),
            "rx": 0,
            "tx": 0,
            "connections": 0,
            "ipFamily": ip_family(source_ip),
        })
        if connection.get("protocol"):
            item["protocols"].add(connection.get("protocol"))
        for key in ["remote", "local", "state"]:
            if not item[key] and connection.get(key):
                item[key] = connection.get(key)
        if not item.get("auth") and connection.get("auth"):
            item["auth"] = connection.get("auth")
        item["rx"] += common.safe_int(connection.get("rx", 0))
        item["tx"] += common.safe_int(connection.get("tx", 0))
        item["connections"] += max(1, common.safe_int(connection.get("connections", 1)))
    compacted = []
    for item in bucket.values():
        protocols = sorted(item.pop("protocols"))
        item["protocols"] = protocols
        item["protocol"] = "/".join(protocols) if protocols else service_proto_label
        item["state"] = item["state"] or "active"
        compacted.append(item)
    compacted.sort(key=lambda item: (item["rx"] + item["tx"], item["connections"]), reverse=True)
    return compacted


def socket_connections(socket_raw, port, local_ip_set):
    connections = []
    seen = set()
    for raw in socket_raw.splitlines():
        parts = raw.split()
        if len(parts) < 5:
            continue
        proto = parts[0].lower()
        state = parts[1] if proto.startswith("tcp") else "UDP"
        local = parts[4]
        remote = parts[5] if len(parts) > 5 else ""
        local_host, local_port = split_endpoint(local)
        local_ip = normalize_ip(local_host)
        if port and local_port != str(port):
            continue
        if local_ip and local_ip_set and local_ip not in local_ip_set:
            continue
        source_ip = clean_source_ip(remote)
        if not source_ip or source_ip in local_ip_set:
            continue
        key = (proto, source_ip, remote, local)
        if key in seen:
            continue
        seen.add(key)
        connections.append({
            "protocol": "tcp" if proto.startswith("tcp") else "udp",
            "sourceIp": source_ip,
            "remote": remote,
            "local": local,
            "state": state,
            "connections": 1,
            "rx": 0,
            "tx": 0,
            "ipFamily": ip_family(source_ip),
        })
    return connections, seen


def add_hysteria_streams(connections, seen, streams_raw):
    streams = parse(streams_raw, {})
    stream_clients = {}
    for stream in streams.get("streams", []):
        remote = stream.get("remote_addr") or stream.get("remoteAddr") or stream.get("remote") or ""
        source_ip = clean_source_ip(remote)
        if not source_ip:
            continue
        item = stream_clients.setdefault(source_ip, {
            "protocol": "hysteria-stream",
            "sourceIp": source_ip,
            "remote": remote,
            "local": "",
            "state": "stream",
            "auth": stream.get("auth"),
            "tx": 0,
            "rx": 0,
            "connections": 0,
            "ipFamily": ip_family(source_ip),
        })
        item["tx"] += common.safe_int(stream.get("tx", 0))
        item["rx"] += common.safe_int(stream.get("rx", 0))
        item["connections"] += 1
        if not item.get("auth") and stream.get("auth"):
            item["auth"] = stream.get("auth")
    for item in stream_clients.values():
        key = ("hysteria-client", item["sourceIp"])
        if key in seen:
            continue
        seen.add(key)
        connections.append(item)


def version_for(protocol, service):
    if protocol == "hysteria2" and common.command_exists("hysteria"):
        return common.capture(["hysteria", "version"]).splitlines()[0] if common.capture(["hysteria", "version"]).splitlines() else ""
    if protocol == "trojan" and os.access("/usr/src/trojan/trojan", os.X_OK):
        return common.capture(["/usr/src/trojan/trojan", "--version"]).splitlines()[0] if common.capture(["/usr/src/trojan/trojan", "--version"]).splitlines() else ""
    if "sing-box" in service.lower() and common.command_exists("sing-box"):
        return common.capture(["sing-box", "version"]).splitlines()[0] if common.capture(["sing-box", "version"]).splitlines() else ""
    return ""


def main():
    common.bootstrap()
    protocol = os.environ.get("SIMPLEUI_PROTOCOL", "hysteria2")
    port = os.environ.get("SIMPLEUI_PORT", "443")
    service = os.environ.get("SIMPLEUI_SERVICE", "") or default_service_for_protocol(protocol)
    service_proto = common.normalize_service_protocols(os.environ.get("SIMPLEUI_SERVICE_PROTO", ""), protocol)
    service_proto_label = "/".join([item for item in service_proto.split(",") if item]) or "tcp"
    active = common.service_state(service) if service else "unknown"
    version = version_for(protocol, service)

    traffic_raw = "{}"
    online_raw = "{}"
    streams_raw = "{}"
    if protocol == "hysteria2":
        hy_env = common.read_env_file("/etc/hy2config/simpleui.env")
        if hy_env.get("SIMPLEUI_TRAFFIC_ENABLED", "0") == "1" and hy_env.get("SIMPLEUI_TRAFFIC_PORT"):
            api = f"http://127.0.0.1:{hy_env['SIMPLEUI_TRAFFIC_PORT']}"
            secret = hy_env.get("SIMPLEUI_TRAFFIC_SECRET", "")
            traffic_raw = curl_json(f"{api}/traffic", secret)
            online_raw = curl_json(f"{api}/online", secret)
            streams_raw = curl_json(f"{api}/dump/streams", secret)

    enable_conntrack_accounting()
    nft_prefix = traffic_prefix(protocol, port)
    ensure_nft_traffic_accounting(nft_prefix, service_proto, port)
    socket_raw = "\n".join(common.capture(["ss", "-Htunp"]).splitlines()[-300:])
    conntrack_raw = read_conntrack_lines(port)
    local_ips_raw = local_ips()
    nft_json_raw = common.capture(["nft", "-j", "list", "table", "inet", "simpleui_traffic"]) if common.command_exists("nft") else "{}"
    nft_json_raw = nft_json_raw or "{}"
    interfaces_raw = interface_totals()

    local_ip_set = {normalize_ip(item) for item in local_ips_raw.split(",") if normalize_ip(item)}
    connections, seen = socket_connections(socket_raw, port, local_ip_set)
    add_hysteria_streams(connections, seen, streams_raw)
    connections = compact_client_connections(connections, service_proto_label)

    remote_traffic = nft_remote_traffic(nft_json_raw, nft_prefix, service_proto_label)
    conntrack_traffic = conntrack_remote_traffic(conntrack_raw, port, local_ip_set)
    for remote_ip, item in conntrack_traffic.items():
        existing = remote_traffic.setdefault(remote_ip, {
            "remoteIp": remote_ip,
            "clientIp": remote_ip,
            "ipFamily": item.get("ipFamily"),
            "rx": 0,
            "tx": 0,
            "connections": 0,
            "protocols": set(),
        })
        if existing["rx"] + existing["tx"] == 0:
            existing["rx"] = item["rx"]
            existing["tx"] = item["tx"]
        existing["connections"] += item.get("connections", 0)
        existing["protocols"].update(item.get("protocols", set()))
    for connection in connections:
        source_ip = connection.get("sourceIp", "")
        if not source_ip:
            continue
        item = remote_traffic.setdefault(source_ip, {
            "remoteIp": source_ip,
            "clientIp": source_ip,
            "ipFamily": ip_family(source_ip),
            "rx": 0,
            "tx": 0,
            "connections": 0,
            "protocols": set(),
        })
        if item["connections"] == 0:
            item["connections"] = max(1, common.safe_int(connection.get("connections", 1)))
        if item["rx"] + item["tx"] == 0 and (connection.get("rx") or connection.get("tx")):
            item["rx"] = common.safe_int(connection.get("rx", 0))
            item["tx"] = common.safe_int(connection.get("tx", 0))
        for protocol_value in connection.get("protocols") or [connection.get("protocol")]:
            if protocol_value:
                item["protocols"].add(protocol_value)

    remote_traffic_list = []
    for item in remote_traffic.values():
        remote_traffic_list.append({**item, "protocols": sorted(item["protocols"]), "total": item["rx"] + item["tx"]})
    remote_traffic_list.sort(key=lambda item: item["total"], reverse=True)

    common.emit("__SIMPLEUI_STATUS__", {
        "protocol": protocol,
        "service": service,
        "serviceProtocol": service_proto,
        "active": active,
        "version": version,
        "traffic": parse(traffic_raw, {}),
        "online": parse(online_raw, {}),
        "interfaces": parse(interfaces_raw, {"rx": 0, "tx": 0}),
        "connections": connections[:100],
        "remoteTraffic": remote_traffic_list[:200],
    })


if __name__ == "__main__":
    main()
