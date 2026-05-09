target="${SIMPLEUI_BAN_IP:-}"
ban_action="${SIMPLEUI_BAN_ACTION:-ban}"
protocol="${SIMPLEUI_PROTOCOL:-hysteria2}"
service="${SIMPLEUI_SERVICE:-}"
service_proto="${SIMPLEUI_SERVICE_PROTO:-}"
config_path="${SIMPLEUI_CONFIG:-}"
port="${SIMPLEUI_PORT:-}"
node_name="${SIMPLEUI_NODE_NAME:-}"
remote_key="${SIMPLEUI_REMOTE_KEY:-}"
blacklist_store="/etc/simpleui/source-ip-blacklist.json"
legacy_blacklist="/etc/simpleui/banned-source-ips.txt"

if [ -z "$target" ]; then
  simpleui_log "No connection source IP supplied."
  exit 40
fi

case "$ban_action" in
  ban|add|block) ban_action="ban" ;;
  unban|remove|delete|unblock) ban_action="unban" ;;
  *)
    simpleui_log "Unsupported blacklist action: $ban_action"
    exit 43
    ;;
esac

source_ip="$(python3 - "$target" <<'PY'
import ipaddress
import sys

raw = sys.argv[1].strip()
if raw.startswith("[") and "]" in raw:
    host = raw[1:raw.index("]")]
    suffix = raw[raw.index("]") + 1:]
    raw = f"{host}{suffix}" if suffix.startswith("/") else host
elif raw.count(":") == 1 and "." in raw:
    raw = raw.rsplit(":", 1)[0]

try:
    parsed = ipaddress.ip_network(raw, strict=False) if "/" in raw else ipaddress.ip_address(raw)
except ValueError:
    raise SystemExit(2)

if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped:
    parsed = parsed.ipv4_mapped
elif isinstance(parsed, ipaddress.IPv6Network) and parsed.network_address.ipv4_mapped and parsed.prefixlen >= 96:
    parsed = ipaddress.ip_network(f"{parsed.network_address.ipv4_mapped}/{parsed.prefixlen - 96}", strict=False)

print(str(parsed))
PY
)" || {
  simpleui_log "Invalid connection source IP: $target"
  exit 41
}

source_family="$(python3 - "$source_ip" <<'PY'
import ipaddress
import sys
raw = sys.argv[1].strip()
parsed = ipaddress.ip_network(raw, strict=False) if "/" in raw else ipaddress.ip_address(raw)
print(parsed.version)
PY
)"

default_proto_for_protocol() {
  case "$1" in
    hysteria2|hysteria|tuic|wireguard) printf 'udp' ;;
    shadowsocks|naive) printf 'tcp,udp' ;;
    *) printf 'tcp' ;;
  esac
}

normalize_service_protocols() {
  local raw="${1:-}"
  if [ -z "$raw" ]; then
    raw="$(default_proto_for_protocol "$protocol")"
  fi
  printf '%s' "$raw" | tr '/ ' ',,' | awk -F, '
    {
      for (i = 1; i <= NF; i++) {
        if (($i == "tcp" || $i == "udp") && !seen[$i]++) out = out ? out "," $i : $i
      }
    }
    END { print out ? out : "tcp" }
  '
}

service_proto="$(normalize_service_protocols "$service_proto")"
if [ -z "$remote_key" ]; then
  remote_key="${protocol}:${config_path:-managed}:${port:-}"
fi

iptables_tool() {
  if [ "$source_family" = "6" ]; then
    command -v ip6tables >/dev/null 2>&1 && printf 'ip6tables'
  else
    command -v iptables >/dev/null 2>&1 && printf 'iptables'
  fi
}

add_iptables_rule() {
  local tool="$1"
  local proto="$2"
  if [ -n "$port" ]; then
    "$tool" -C INPUT -p "$proto" --dport "$port" -s "$source_ip" -j DROP 2>/dev/null \
      || "$tool" -I INPUT -p "$proto" --dport "$port" -s "$source_ip" -j DROP
  else
    "$tool" -C INPUT -s "$source_ip" -j DROP 2>/dev/null \
      || "$tool" -I INPUT -s "$source_ip" -j DROP
  fi
}

remove_iptables_rule() {
  local tool="$1"
  local proto="$2"
  if [ -n "$port" ]; then
    while "$tool" -C INPUT -p "$proto" --dport "$port" -s "$source_ip" -j DROP >/dev/null 2>&1; do
      "$tool" -D INPUT -p "$proto" --dport "$port" -s "$source_ip" -j DROP >/dev/null 2>&1 || break
    done
  fi
  while "$tool" -C INPUT -s "$source_ip" -j DROP >/dev/null 2>&1; do
    "$tool" -D INPUT -s "$source_ip" -j DROP >/dev/null 2>&1 || break
  done
}

ensure_nft_chain() {
  command -v nft >/dev/null 2>&1 || return 1
  nft add table inet simpleui >/dev/null 2>&1 || true
  nft add chain inet simpleui input '{ type filter hook input priority -10; policy accept; }' >/dev/null 2>&1 || true
}

add_nft_rule() {
  local proto="$1"
  ensure_nft_chain || return 1
  if [ "$source_family" = "6" ]; then
    if [ -n "$port" ]; then
      nft add rule inet simpleui input meta l4proto "$proto" th dport "$port" ip6 saddr "$source_ip" drop >/dev/null 2>&1 || true
    else
      nft add rule inet simpleui input ip6 saddr "$source_ip" drop >/dev/null 2>&1 || true
    fi
  else
    if [ -n "$port" ]; then
      nft add rule inet simpleui input meta l4proto "$proto" th dport "$port" ip saddr "$source_ip" drop >/dev/null 2>&1 || true
    else
      nft add rule inet simpleui input ip saddr "$source_ip" drop >/dev/null 2>&1 || true
    fi
  fi
}

remove_nft_rule() {
  local proto="$1"
  local family_expr="ip saddr"
  [ "$source_family" = "6" ] && family_expr="ip6 saddr"
  command -v nft >/dev/null 2>&1 || return 0
  nft -a list chain inet simpleui input 2>/dev/null \
    | awk -v family_expr="$family_expr" -v source="$source_ip" -v proto="$proto" -v port="$port" '
        index($0, family_expr " " source) &&
        (port == "" || index($0, "dport " port)) &&
        (port == "" || index($0, proto)) { print $NF }
      ' \
    | while IFS= read -r handle; do
        [ -n "$handle" ] && nft delete rule inet simpleui input handle "$handle" >/dev/null 2>&1 || true
      done
}

apply_firewall() {
  local tool
  tool="$(iptables_tool || true)"
  if [ -z "$tool" ] && ! command -v nft >/dev/null 2>&1; then
    simpleui_log "Neither iptables/ip6tables nor nft is available."
    exit 42
  fi

  printf '%s' "$service_proto" | tr ',' '\n' | while IFS= read -r proto; do
    [ "$proto" = "tcp" ] || [ "$proto" = "udp" ] || continue
    if [ "$ban_action" = "ban" ]; then
      if [ -n "$tool" ]; then
        add_iptables_rule "$tool" "$proto"
      else
        add_nft_rule "$proto"
      fi
    else
      if [ -n "$tool" ]; then
        remove_iptables_rule "$tool" "$proto"
      fi
      remove_nft_rule "$proto"
    fi
  done
}

update_blacklist_store() {
  mkdir -p /etc/simpleui
  python3 - "$blacklist_store" "$ban_action" "$source_ip" "$source_family" "$remote_key" "$protocol" "$service" "$service_proto" "$config_path" "$port" "$node_name" <<'PY'
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

store_path, action, target, family, remote_key, protocol, service, service_proto, config_path, port, node_name = sys.argv[1:12]
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

try:
    with open(store_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    data = {}

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
    targets.pop(target, None)
    if not targets:
        nodes.pop(remote_key, None)
else:
    current = targets.get(target) if isinstance(targets.get(target), dict) else {}
    targets[target] = {
        **current,
        "target": target,
        "targetKind": "source-ip",
        "ipFamily": int(family),
        "status": "active",
        "createdAt": current.get("createdAt") or now,
        "updatedAt": now,
    }

data["updatedAt"] = now
directory = os.path.dirname(store_path)
os.makedirs(directory, mode=0o700, exist_ok=True)
fd, tmp = tempfile.mkstemp(prefix=".blacklist-", dir=directory)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, store_path)
finally:
    try:
        if os.path.exists(tmp):
            os.unlink(tmp)
    except OSError:
        pass

print("__SIMPLEUI_RESULT__" + json.dumps({
    "ok": True,
    "action": action,
    "kind": "source-ip",
    "target": target,
    "ipFamily": int(family),
    "remoteKey": remote_key,
    "protocol": protocol,
    "serviceProtocol": service_proto,
    "listenPort": int(port) if str(port).isdigit() else None,
    "createdAt": targets.get(target, {}).get("createdAt") if action == "ban" else None,
}, ensure_ascii=False))
PY
}

remove_legacy_target() {
  [ "$ban_action" = "unban" ] || return 0
  [ -f "$legacy_blacklist" ] || return 0
  tmp_file="${legacy_blacklist}.tmp"
  grep -vxF "$source_ip" "$legacy_blacklist" > "$tmp_file" || true
  if [ -s "$tmp_file" ]; then
    mv "$tmp_file" "$legacy_blacklist"
    chmod 600 "$legacy_blacklist"
  else
    rm -f "$tmp_file" "$legacy_blacklist"
  fi
}

if [ "$ban_action" = "ban" ]; then
  simpleui_log "Adding node-scoped firewall DROP rule for $source_ip on ${node_name:-$remote_key}"
else
  simpleui_log "Removing node-scoped firewall DROP rule for $source_ip on ${node_name:-$remote_key}"
fi

apply_firewall
update_blacklist_store
remove_legacy_target
simpleui_save_firewall
