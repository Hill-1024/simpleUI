protocol="${SIMPLEUI_PROTOCOL:-hysteria2}"
port="${SIMPLEUI_PORT:-443}"
service="hysteria-server.service"
service_proto="udp"
if [ "$protocol" = "trojan" ]; then
  service="trojan.service"
  service_proto="tcp"
fi

active="$(systemctl is-active "$service" 2>/dev/null || true)"
version=""
if [ "$protocol" = "hysteria2" ] && command -v hysteria >/dev/null 2>&1; then
  version="$(hysteria version 2>/dev/null | head -n 1 || true)"
elif [ "$protocol" = "trojan" ] && [ -x /usr/src/trojan/trojan ]; then
  version="$(/usr/src/trojan/trojan --version 2>/dev/null | head -n 1 || true)"
fi

traffic="{}"
online="{}"
streams="{}"
if [ "$protocol" = "hysteria2" ]; then
  envfile="/etc/hy2config/simpleui.env"
  if [ -f "$envfile" ]; then
    # shellcheck disable=SC1090
    . "$envfile"
  fi
  if [ "${SIMPLEUI_TRAFFIC_ENABLED:-0}" = "1" ] && [ -n "${SIMPLEUI_TRAFFIC_PORT:-}" ]; then
    api="http://127.0.0.1:${SIMPLEUI_TRAFFIC_PORT}"
    secret="${SIMPLEUI_TRAFFIC_SECRET:-}"
    traffic="$(curl -fsS -H "Authorization: ${secret}" "$api/traffic" 2>/dev/null || printf '{}')"
    online="$(curl -fsS -H "Authorization: ${secret}" "$api/online" 2>/dev/null || printf '{}')"
    streams="$(curl -fsS -H "Authorization: ${secret}" "$api/dump/streams" 2>/dev/null || printf '{}')"
  fi
fi

enable_conntrack_accounting() {
  if [ -w /proc/sys/net/netfilter/nf_conntrack_acct ]; then
    printf '1' > /proc/sys/net/netfilter/nf_conntrack_acct || true
  fi
  if [ -d /etc/sysctl.d ] && [ -w /etc/sysctl.d ]; then
    printf 'net.netfilter.nf_conntrack_acct = 1\n' > /etc/sysctl.d/99-simpleui-conntrack.conf || true
  fi
}

read_conntrack_lines() {
  {
    [ -r /proc/net/nf_conntrack ] && cat /proc/net/nf_conntrack
    [ -r /proc/net/ip_conntrack ] && cat /proc/net/ip_conntrack
  } 2>/dev/null | awk -v p="$port" 'index($0, "dport=" p)' | tail -n 2000 | sed 's/"/\\"/g'
}

traffic_prefix() {
  printf '%s_%s' "$protocol" "$port" | sed 's/[^A-Za-z0-9_]/_/g'
}

ensure_nft_rule() {
  local chain="$1"
  local needle="$2"
  local rule="$3"
  if ! nft list chain inet simpleui_traffic "$chain" 2>/dev/null | grep -F "$needle" >/dev/null 2>&1; then
    nft "$rule" >/dev/null 2>&1 || true
  fi
}

ensure_nft_traffic_accounting() {
  command -v nft >/dev/null 2>&1 || return 1
  local prefix="$1"
  local rx4="${prefix}_rx4"
  local tx4="${prefix}_tx4"
  local rx6="${prefix}_rx6"
  local tx6="${prefix}_tx6"
  nft add table inet simpleui_traffic >/dev/null 2>&1 || true
  nft 'add chain inet simpleui_traffic input { type filter hook input priority -151; policy accept; }' >/dev/null 2>&1 || true
  nft 'add chain inet simpleui_traffic output { type filter hook output priority -151; policy accept; }' >/dev/null 2>&1 || true
  nft "add set inet simpleui_traffic ${rx4} { type ipv4_addr; flags dynamic; counter; }" >/dev/null 2>&1 || true
  nft "add set inet simpleui_traffic ${tx4} { type ipv4_addr; flags dynamic; counter; }" >/dev/null 2>&1 || true
  nft "add set inet simpleui_traffic ${rx6} { type ipv6_addr; flags dynamic; counter; }" >/dev/null 2>&1 || true
  nft "add set inet simpleui_traffic ${tx6} { type ipv6_addr; flags dynamic; counter; }" >/dev/null 2>&1 || true
  ensure_nft_rule input "dport ${port} update @${rx4}" "add rule inet simpleui_traffic input meta nfproto ipv4 ${service_proto} dport ${port} update @${rx4} { ip saddr counter }"
  ensure_nft_rule output "sport ${port} update @${tx4}" "add rule inet simpleui_traffic output meta nfproto ipv4 ${service_proto} sport ${port} update @${tx4} { ip daddr counter }"
  ensure_nft_rule input "dport ${port} update @${rx6}" "add rule inet simpleui_traffic input meta nfproto ipv6 ${service_proto} dport ${port} update @${rx6} { ip6 saddr counter }"
  ensure_nft_rule output "sport ${port} update @${tx6}" "add rule inet simpleui_traffic output meta nfproto ipv6 ${service_proto} sport ${port} update @${tx6} { ip6 daddr counter }"
}

enable_conntrack_accounting
nft_prefix="$(traffic_prefix)"
ensure_nft_traffic_accounting "$nft_prefix" || true
socket_lines="$(ss -Htunp 2>/dev/null | tail -n 300 | sed 's/"/\\"/g' || true)"
conntrack_lines="$(read_conntrack_lines || true)"
local_ips="$(ip -o addr show 2>/dev/null | awk '{split($4, a, "/"); if (a[1] != "") print a[1]}' | paste -sd, -)"
nft_json="$(nft -j list table inet simpleui_traffic 2>/dev/null || printf '{}')"
interfaces="$(awk 'NR>2 {rx+=$2; tx+=$10} END {printf "{\"rx\":%d,\"tx\":%d}", rx, tx}' /proc/net/dev 2>/dev/null || printf '{"rx":0,"tx":0}')"

python3 - "$protocol" "$service" "$service_proto" "$active" "$version" "$traffic" "$online" "$streams" "$interfaces" "$socket_lines" "$conntrack_lines" "$local_ips" "$nft_json" "$nft_prefix" "$port" <<'PY'
import ipaddress
import json
import sys

protocol, service, service_proto, active, version, traffic_raw, online_raw, streams_raw, interfaces_raw, socket_raw, conntrack_raw, local_ips_raw, nft_json_raw, nft_prefix, port = sys.argv[1:16]

def parse(raw, fallback):
    try:
        return json.loads(raw)
    except Exception:
        return fallback

def split_endpoint(endpoint):
    endpoint = endpoint.strip().strip('"')
    if not endpoint:
        return "", ""
    if endpoint in {"*", "*:*", "0.0.0.0:*", "[::]:*"}:
        return "", ""
    if endpoint.startswith("[") and "]" in endpoint:
        host = endpoint[1:endpoint.index("]")]
        suffix = endpoint[endpoint.index("]") + 1:]
        return host, suffix[1:] if suffix.startswith(":") else ""
    if endpoint.count(":") == 1:
        host, port_value = endpoint.rsplit(":", 1)
        return host, port_value
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

def clean_source_ip(remote):
    host, _ = split_endpoint(remote)
    try:
        address = ipaddress.ip_address(host)
        if getattr(address, "ipv4_mapped", None):
            return str(address.ipv4_mapped)
        return str(address)
    except ValueError:
        return ""

def ip_family(host):
    try:
        return ipaddress.ip_address(host).version
    except ValueError:
        return None

def normalize_ip(value):
    try:
        address = ipaddress.ip_address(value)
        if getattr(address, "ipv4_mapped", None):
            return str(address.ipv4_mapped)
        return str(address)
    except ValueError:
        return ""

def as_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0

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
    item["rx"] += max(0, as_int(rx))
    item["tx"] += max(0, as_int(tx))
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
    item[direction] += max(0, as_int(byte_count))
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
            value = elem.get("val")
            counter = elem.get("counter", {})
            add_counter_traffic(bucket, value, direction, counter.get("bytes", 0), proto)
    return bucket

local_ips = {normalize_ip(item) for item in local_ips_raw.split(",") if normalize_ip(item)}

def conntrack_remote_traffic(raw, service_port):
    bucket = {}
    service_port = str(service_port or "")
    if not service_port or not local_ips:
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
        if first.get("dport") == service_port and first_dst in local_ips and first_src not in local_ips:
            add_remote_traffic(bucket, first.get("src", ""), proto, first.get("bytes"), second.get("bytes", 0))
    return bucket

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
    if local_ip and local_ips and local_ip not in local_ips:
        continue
    source_ip = clean_source_ip(remote)
    if not source_ip or source_ip in local_ips:
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
    item["tx"] += as_int(stream.get("tx", 0))
    item["rx"] += as_int(stream.get("rx", 0))
    item["connections"] += 1
    if not item.get("auth") and stream.get("auth"):
        item["auth"] = stream.get("auth")

for item in stream_clients.values():
    key = ("hysteria-client", item["sourceIp"])
    if key in seen:
        continue
    seen.add(key)
    connections.append(item)

def compact_client_connections(rows):
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
        protocol_value = connection.get("protocol")
        if protocol_value:
            item["protocols"].add(protocol_value)
        if not item["remote"] and connection.get("remote"):
            item["remote"] = connection.get("remote")
        if not item["local"] and connection.get("local"):
            item["local"] = connection.get("local")
        if not item["state"] and connection.get("state"):
            item["state"] = connection.get("state")
        if not item.get("auth") and connection.get("auth"):
            item["auth"] = connection.get("auth")
        item["rx"] += as_int(connection.get("rx", 0))
        item["tx"] += as_int(connection.get("tx", 0))
        item["connections"] += max(1, as_int(connection.get("connections", 1)))
    compacted = []
    for item in bucket.values():
        protocols = sorted(item.pop("protocols"))
        item["protocols"] = protocols
        item["protocol"] = "/".join(protocols) if protocols else service_proto
        item["state"] = item["state"] or "active"
        compacted.append(item)
    compacted.sort(key=lambda item: (item["rx"] + item["tx"], item["connections"]), reverse=True)
    return compacted

connections = compact_client_connections(connections)

remote_traffic = nft_remote_traffic(nft_json_raw, nft_prefix, service_proto)
conntrack_traffic = conntrack_remote_traffic(conntrack_raw, port)
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
        item["connections"] = max(1, as_int(connection.get("connections", 1)))
    if item["rx"] + item["tx"] == 0 and (connection.get("rx") or connection.get("tx")):
        item["rx"] = as_int(connection.get("rx", 0))
        item["tx"] = as_int(connection.get("tx", 0))
    for protocol_value in connection.get("protocols") or [connection.get("protocol")]:
        if protocol_value:
            item["protocols"].add(protocol_value)

remote_traffic_list = []
for item in remote_traffic.values():
    remote_traffic_list.append({
        **item,
        "protocols": sorted(item["protocols"]),
        "total": item["rx"] + item["tx"],
    })
remote_traffic_list.sort(key=lambda item: item["total"], reverse=True)

payload = {
    "protocol": protocol,
    "service": service,
    "active": active,
    "version": version,
    "traffic": parse(traffic_raw, {}),
    "online": parse(online_raw, {}),
    "interfaces": parse(interfaces_raw, {"rx": 0, "tx": 0}),
    "connections": connections[:100],
    "remoteTraffic": remote_traffic_list[:200],
}
print("__SIMPLEUI_STATUS__" + json.dumps(payload, ensure_ascii=False))
PY
