target="${SIMPLEUI_BAN_IP:-}"

if [ -z "$target" ]; then
  simpleui_log "No connection source IP supplied."
  exit 40
fi

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

simpleui_log "Adding remote firewall DROP rule for connection source IP $source_ip"
mkdir -p /etc/simpleui
touch /etc/simpleui/banned-source-ips.txt
chmod 600 /etc/simpleui/banned-source-ips.txt

if [ "$source_family" = "6" ]; then
  if command -v ip6tables >/dev/null 2>&1; then
    ip6tables -C INPUT -s "$source_ip" -j DROP 2>/dev/null || ip6tables -I INPUT -s "$source_ip" -j DROP
  elif command -v nft >/dev/null 2>&1; then
    nft add table inet simpleui 2>/dev/null || true
    nft add chain inet simpleui input '{ type filter hook input priority -10; policy accept; }' 2>/dev/null || true
    nft add rule inet simpleui input ip6 saddr "$source_ip" drop 2>/dev/null || true
  else
    simpleui_log "Neither ip6tables nor nft is available."
    exit 42
  fi
else
  if command -v iptables >/dev/null 2>&1; then
    iptables -C INPUT -s "$source_ip" -j DROP 2>/dev/null || iptables -I INPUT -s "$source_ip" -j DROP
  elif command -v nft >/dev/null 2>&1; then
    nft add table inet simpleui 2>/dev/null || true
    nft add chain inet simpleui input '{ type filter hook input priority -10; policy accept; }' 2>/dev/null || true
    nft add rule inet simpleui input ip saddr "$source_ip" drop 2>/dev/null || true
  else
    simpleui_log "Neither iptables nor nft is available."
    exit 42
  fi
fi

if ! grep -qxF "$source_ip" /etc/simpleui/banned-source-ips.txt; then
  printf '%s\n' "$source_ip" >> /etc/simpleui/banned-source-ips.txt
fi
simpleui_save_firewall
printf '__SIMPLEUI_RESULT__{"ok":true,"kind":"source-ip","target":"%s","ipFamily":%s}\n' "$source_ip" "$source_family"
