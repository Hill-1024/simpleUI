managed_file="/etc/simpleui/managed-protocols"
uninstall_scope="${SIMPLEUI_UNINSTALL_SCOPE:-server}"
target_protocol="${SIMPLEUI_PROTOCOL:-}"
protocols=""

if [ "${SIMPLEUI_MONITOR_ONLY:-0}" = "1" ]; then
  cleanup_traffic_accounting() {
    return 0
  }
  simpleui_log "Monitor-only node; remote proxy files will not be changed."
  printf '__SIMPLEUI_RESULT__{"ok":true,"action":"monitor-remove","protocol":"%s"}\n' "$target_protocol"
  exit 0
fi

if [ "$uninstall_scope" = "node" ]; then
  if [ -z "$target_protocol" ]; then
    simpleui_log "Node uninstall requires SIMPLEUI_PROTOCOL"
    exit 22
  fi
  simpleui_log "Cleaning SimpleUI-managed ${target_protocol} node and keeping hook agent"
  protocols="$target_protocol"
else
  simpleui_log "Cleaning SimpleUI-managed nodes and uninstalling hook agent"
  if [ -f "$managed_file" ]; then
    protocols="$(cat "$managed_file" || true)"
  else
    [ -d /etc/simpleui/hysteria2 ] && protocols="${protocols}
hysteria2"
    [ -d /etc/simpleui/trojan ] && protocols="${protocols}
trojan"
  fi
fi

traffic_prefix() {
  printf '%s_%s' "$1" "$2" | sed 's/[^A-Za-z0-9_]/_/g'
}

cleanup_traffic_accounting() {
  local protocol="$1"
  local port="$2"
  command -v nft >/dev/null 2>&1 || return 0
  [ -n "$protocol" ] && [ -n "$port" ] || return 0
  local prefix
  prefix="$(traffic_prefix "$protocol" "$port")"
  for chain in input output; do
    nft -a list chain inet simpleui_traffic "$chain" 2>/dev/null \
      | awk -v marker="@${prefix}_" 'index($0, marker) { print $NF }' \
      | while IFS= read -r handle; do
          [ -n "$handle" ] && nft delete rule inet simpleui_traffic "$chain" handle "$handle" >/dev/null 2>&1 || true
        done
  done
  for suffix in rx4 tx4 rx6 tx6; do
    nft delete set inet simpleui_traffic "${prefix}_${suffix}" >/dev/null 2>&1 || true
  done
}

cleanup_bans() {
  simpleui_log "Cleaning SimpleUI firewall DROP rules"
  emit_blacklist_rows() {
    python3 <<'PY'
import ipaddress
import json
import os
import sys

def normalize(raw):
    try:
        text = str(raw or "").strip()
        if not text:
            return None
        parsed = ipaddress.ip_network(text, strict=False) if "/" in text else ipaddress.ip_address(text)
        if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped:
            parsed = parsed.ipv4_mapped
        elif isinstance(parsed, ipaddress.IPv6Network) and parsed.network_address.ipv4_mapped and parsed.prefixlen >= 96:
            parsed = ipaddress.ip_network(f"{parsed.network_address.ipv4_mapped}/{parsed.prefixlen - 96}", strict=False)
        return str(parsed), parsed.version
    except Exception:
        return None

def protocols(raw, protocol):
    values = []
    for part in str(raw or "").replace("/", ",").replace(" ", ",").split(","):
        if part in {"tcp", "udp"} and part not in values:
            values.append(part)
    if values:
        return ",".join(values)
    return "udp" if protocol in {"hysteria2", "hysteria", "tuic", "wireguard"} else "tcp"

rows = []
try:
    with open("/etc/simpleui/source-ip-blacklist.json", "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    data = {}

nodes = data.get("nodes") if isinstance(data, dict) and isinstance(data.get("nodes"), dict) else {}
for node in nodes.values():
    if not isinstance(node, dict):
        continue
    targets = node.get("targets") if isinstance(node.get("targets"), dict) else {}
    for key, entry in targets.items():
        entry = entry if isinstance(entry, dict) else {"target": key}
        normalized = normalize(entry.get("target") or key)
        if not normalized:
            continue
        target, family = normalized
        rows.append((target, family, str(node.get("listenPort") or ""), protocols(node.get("serviceProtocol", ""), node.get("protocol", ""))))

try:
    with open("/etc/simpleui/banned-source-ips.txt", "r", encoding="utf-8", errors="ignore") as handle:
        for line in handle:
            normalized = normalize(line.strip())
            if normalized:
                target, family = normalized
                rows.append((target, family, "", "tcp,udp"))
except Exception:
    pass

seen = set()
for target, family, port, protocol_list in rows:
    key = (target, family, port, protocol_list)
    if key in seen:
        continue
    seen.add(key)
    print(f"{family}|{target}|{port}|{protocol_list}")
PY
  }

  remove_nft_rules() {
    local family="$1"
    local source_ip="$2"
    local node_port="$3"
    local proto="$4"
    local family_expr="ip saddr"
    [ "$family" = "6" ] && family_expr="ip6 saddr"
    command -v nft >/dev/null 2>&1 || return 0
    nft -a list chain inet simpleui input 2>/dev/null \
      | awk -v family_expr="$family_expr" -v source="$source_ip" -v proto="$proto" -v port="$node_port" '
          index($0, family_expr " " source) &&
          (port == "" || index($0, "dport " port)) &&
          (port == "" || index($0, proto)) { print $NF }
        ' \
      | while IFS= read -r handle; do
          [ -n "$handle" ] && nft delete rule inet simpleui input handle "$handle" >/dev/null 2>&1 || true
        done
  }

  while IFS='|' read -r family source_ip node_port protocols; do
    [ -n "$source_ip" ] || continue
    tool=""
    if [ "$family" = "6" ] && command -v ip6tables >/dev/null 2>&1; then
      tool="ip6tables"
    elif [ "$family" = "4" ] && command -v iptables >/dev/null 2>&1; then
      tool="iptables"
    fi
    printf '%s' "$protocols" | tr ',' '\n' | while IFS= read -r proto; do
      [ "$proto" = "tcp" ] || [ "$proto" = "udp" ] || continue
      if [ -n "$tool" ] && [ -n "$node_port" ]; then
        while "$tool" -C INPUT -p "$proto" --dport "$node_port" -s "$source_ip" -j DROP >/dev/null 2>&1; do
          "$tool" -D INPUT -p "$proto" --dport "$node_port" -s "$source_ip" -j DROP >/dev/null 2>&1 || break
        done
      fi
      remove_nft_rules "$family" "$source_ip" "$node_port" "$proto"
    done
    if [ -n "$tool" ]; then
      while "$tool" -C INPUT -s "$source_ip" -j DROP >/dev/null 2>&1; do
        "$tool" -D INPUT -s "$source_ip" -j DROP >/dev/null 2>&1 || break
      done
    fi
  done < <(emit_blacklist_rows)
  nft delete table inet simpleui >/dev/null 2>&1 || true
  simpleui_save_firewall
}

cleanup_hysteria2() {
  simpleui_log "Cleaning Hysteria2 files managed by SimpleUI"
  domain=""
  tls_mode=""
  installed_core="0"
  cert_dir="/etc/ssl/private"
  cert_name=""
  node_port="${SIMPLEUI_PORT:-}"
  if [ -f /etc/simpleui/hysteria2/managed.env ]; then
    # shellcheck disable=SC1091
    . /etc/simpleui/hysteria2/managed.env || true
    domain="${SIMPLEUI_DOMAIN:-}"
    tls_mode="${SIMPLEUI_TLS_MODE:-}"
    installed_core="${SIMPLEUI_INSTALLED_CORE:-0}"
    cert_dir="${SIMPLEUI_CERT_DIR:-$cert_dir}"
    cert_name="${SIMPLEUI_CERT_NAME:-$domain}"
    node_port="${SIMPLEUI_PORT:-$node_port}"
  elif [ -f /etc/hy2config/simpleui.env ]; then
    # shellcheck disable=SC1091
    . /etc/hy2config/simpleui.env || true
    domain="${SIMPLEUI_DOMAIN:-}"
    tls_mode="${SIMPLEUI_TLS_MODE:-}"
    cert_name="${SIMPLEUI_SNI:-$domain}"
    node_port="${SIMPLEUI_PORT:-$node_port}"
  fi

  systemctl disable --now hysteria-server.service >/dev/null 2>&1 || true
  systemctl disable --now hysteria.service >/dev/null 2>&1 || true
  systemctl disable --now hysteria-iptables.service >/dev/null 2>&1 || true
  cleanup_traffic_accounting "hysteria2" "$node_port"

  if [ -x /etc/hy2config/jump_port_back.sh ]; then
    /etc/hy2config/jump_port_back.sh >/dev/null 2>&1 || true
  fi
  rm -f /etc/systemd/system/hysteria-iptables.service
  rm -f /etc/hy2config/iptables-rules.v4 /etc/hy2config/iptables-rules.v6 /etc/hy2config/restore-iptables.sh /etc/hy2config/jump_port_back.sh

  if [ -f /etc/simpleui/hysteria2/original-config.yaml ]; then
    mkdir -p /etc/hysteria
    cp -a /etc/simpleui/hysteria2/original-config.yaml /etc/hysteria/config.yaml
    systemctl restart hysteria-server.service >/dev/null 2>&1 || true
  else
    rm -f /etc/hysteria/config.yaml
    rm -f /etc/systemd/system/hysteria-server.service
    rm -f /etc/systemd/system/hysteria.service
  fi

  if [ "$installed_core" = "1" ]; then
    rm -f /usr/local/bin/hysteria /usr/bin/hysteria
    rm -rf /etc/hysteria
  fi

  if [ "$tls_mode" = "self-signed" ] && [ -n "${cert_name:-$domain}" ]; then
    rm -f "/etc/ssl/private/${cert_name:-$domain}.key" "/etc/ssl/private/${cert_name:-$domain}.crt"
    rm -f "${cert_dir}/${cert_name:-$domain}.key" "${cert_dir}/${cert_name:-$domain}.crt"
    rm -f "${cert_dir}/ec_param.pem"
    rm -f "/etc/hysteria/certs/${cert_name:-$domain}.key" "/etc/hysteria/certs/${cert_name:-$domain}.crt"
    rmdir /etc/hysteria/certs >/dev/null 2>&1 || true
    rmdir "$cert_dir" >/dev/null 2>&1 || true
  fi

  rm -f /usr/local/bin/simpleui-hy2-auth
  rm -f /etc/hy2config/simpleui.env
  rm -f /etc/hy2config/hy2_url_scheme.txt /etc/hy2config/share-links.json
  rm -f /etc/hy2config/clash.yaml /etc/hy2config/sing-box.yaml /etc/hy2config/surge.yaml
  rm -f /etc/hy2config/agree.txt
  rmdir /etc/hy2config >/dev/null 2>&1 || true
  rm -rf /etc/simpleui/hysteria2
  rm -rf /opt/simpleui/upstream/hysteria2
}

cleanup_trojan() {
  simpleui_log "Cleaning Trojan files managed by SimpleUI"
  installed_service="0"
  had_nginx="1"
  had_acme="1"
  config="/usr/src/trojan/server.conf"
  node_port="${SIMPLEUI_PORT:-443}"
  if [ -f /etc/simpleui/trojan/managed.env ]; then
    # shellcheck disable=SC1091
    . /etc/simpleui/trojan/managed.env || true
    installed_service="${SIMPLEUI_INSTALLED_SERVICE:-0}"
    had_nginx="${SIMPLEUI_HAD_NGINX:-1}"
    had_acme="${SIMPLEUI_HAD_ACME:-1}"
    config="${SIMPLEUI_CONFIG:-$config}"
    node_port="${SIMPLEUI_PORT:-$node_port}"
  fi
  cleanup_traffic_accounting "trojan" "$node_port"

  if [ "$installed_service" = "1" ]; then
    systemctl disable --now trojan.service >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/trojan.service
    systemctl reset-failed trojan.service >/dev/null 2>&1 || true
    rm -f /usr/local/bin/trojan /usr/bin/trojan
    rm -rf /usr/src/trojan* /usr/local/etc/trojan /etc/trojan
  elif [ -f /etc/simpleui/trojan/original-config.json ]; then
    mkdir -p "$(dirname "$config")"
    cp -a /etc/simpleui/trojan/original-config.json "$config"
    systemctl restart trojan.service >/dev/null 2>&1 || true
  else
    systemctl restart trojan.service >/dev/null 2>&1 || true
  fi

  if [ ! -f /etc/simpleui/trojan/managed.env ]; then
    rm -rf /usr/src/trojan* /usr/local/etc/trojan /etc/trojan
  fi

  if [ -f /etc/simpleui/trojan/original-nginx.conf ]; then
    mkdir -p /etc/nginx
    cp -a /etc/simpleui/trojan/original-nginx.conf /etc/nginx/nginx.conf
    systemctl restart nginx >/dev/null 2>&1 || true
  elif [ "$had_nginx" = "0" ]; then
    systemctl disable --now nginx >/dev/null 2>&1 || true
    if command -v apt-get >/dev/null 2>&1; then
      DEBIAN_FRONTEND=noninteractive apt-get purge -y nginx nginx-common >/dev/null 2>&1 || true
      DEBIAN_FRONTEND=noninteractive apt-get autoremove -y >/dev/null 2>&1 || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf remove -y nginx >/dev/null 2>&1 || true
    elif command -v yum >/dev/null 2>&1; then
      yum remove -y nginx >/dev/null 2>&1 || true
    fi
    rm -rf /usr/share/nginx/html/*
    rm -f /etc/systemd/system/multi-user.target.wants/nginx.service
  fi

  if [ "$had_acme" = "0" ]; then
    /root/.acme.sh/acme.sh --uninstall >/dev/null 2>&1 || true
    rm -rf /root/.acme.sh
  fi

  rm -rf /etc/simpleui/trojan
  rm -rf /opt/simpleui/upstream/trojan
}

printf '%s\n' "$protocols" | while IFS= read -r protocol; do
  case "$protocol" in
    hysteria2) cleanup_hysteria2 ;;
    trojan) cleanup_trojan ;;
    "") ;;
    *) simpleui_log "Ignoring unknown managed protocol: $protocol" ;;
  esac
done

if [ "$uninstall_scope" = "node" ]; then
  if [ -f "$managed_file" ]; then
    tmp_file="${managed_file}.tmp"
    grep -vxF "$target_protocol" "$managed_file" > "$tmp_file" || true
    if [ -s "$tmp_file" ]; then
      mv "$tmp_file" "$managed_file"
      chmod 600 "$managed_file"
    else
      rm -f "$tmp_file" "$managed_file"
    fi
  fi
  systemctl daemon-reload || true
  printf '__SIMPLEUI_RESULT__{"ok":true,"action":"node-delete","protocol":"%s"}\n' "$target_protocol"
  exit 0
fi

cleanup_bans
nft delete table inet simpleui_traffic >/dev/null 2>&1 || true

rm -f "$managed_file"
rm -rf /etc/simpleui
rm -rf /opt/simpleui
systemctl daemon-reload || true

cat >/tmp/simpleui-hook-self-remove.sh <<'EOF'
#!/usr/bin/env bash
sleep 2
systemctl disable --now simpleui-hook.service >/dev/null 2>&1 || true
rm -f /etc/systemd/system/simpleui-hook.service /etc/simpleui-hook.env
rm -rf /opt/simpleui-hook
systemctl daemon-reload >/dev/null 2>&1 || true
rm -f /tmp/simpleui-hook-self-remove.sh
EOF
chmod 700 /tmp/simpleui-hook-self-remove.sh
if command -v systemd-run >/dev/null 2>&1; then
  if ! systemd-run --unit=simpleui-hook-self-remove --on-active=2s /bin/bash /tmp/simpleui-hook-self-remove.sh >/dev/null 2>&1; then
    nohup /tmp/simpleui-hook-self-remove.sh >/dev/null 2>&1 &
  fi
else
  nohup /tmp/simpleui-hook-self-remove.sh >/dev/null 2>&1 &
fi

printf '__SIMPLEUI_RESULT__{"ok":true,"action":"uninstall"}\n'
