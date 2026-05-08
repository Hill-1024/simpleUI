simpleui_log "Preparing Hysteria2 Python installer flow"

workdir="/opt/simpleui/upstream/hysteria2"
mkdir -p "$workdir" /etc/simpleui/hysteria2 /etc/hysteria /etc/hy2config
cd "$workdir"
simpleui_mark_protocol "hysteria2"

curl -fsSL https://raw.githubusercontent.com/seagullz4/hysteria2/main/phy2.sh -o phy2.sh
curl -fsSL https://raw.githubusercontent.com/seagullz4/hysteria2/main/hysteria2.py -o hysteria2.py
chmod +x phy2.sh hysteria2.py

simpleui_log "Installing Python-flow dependencies from phy2.sh"
bash ./phy2.sh

installed_core="0"
if ! command -v hysteria >/dev/null 2>&1 && [ ! -x /usr/local/bin/hysteria ]; then
  simpleui_log "Installing Hysteria2 core using the same official installer invoked by hysteria2.py"
  installed_core="1"
  bash <(curl -fsSL https://get.hy2.sh/)
else
  simpleui_log "Hysteria2 core already present"
fi

simpleui_write_kv_users /etc/simpleui/hysteria2/users.kv
hy2_password="$(python3 - /etc/simpleui/hysteria2/users.kv <<'PY'
import pathlib
import sys

users_path = pathlib.Path(sys.argv[1])
for raw in users_path.read_text().splitlines() if users_path.exists() else []:
    if ":" not in raw:
        continue
    _, password = raw.split(":", 1)
    password = password.strip()
    if password:
        print(password)
        raise SystemExit(0)
raise SystemExit(1)
PY
)" || {
  simpleui_log "Hysteria2 password auth requires at least one password"
  exit 30
}

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y) return 0 ;;
    *) return 1 ;;
  esac
}

yaml_sq() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

yaml_val() {
  case "$1" in
    ""|*[!A-Za-z0-9._~:/@%+=,-]*) yaml_sq "$1" ;;
    *) printf '%s' "$1" ;;
  esac
}

need_port() {
  local label="$1"
  local value="$2"
  case "$value" in
    ""|*[!0-9]*) simpleui_log "$label must be a number"; exit 31 ;;
  esac
  if [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
    simpleui_log "$label must be between 1 and 65535"
    exit 31
  fi
}

save_hy2_iptables_rules() {
  if command -v iptables-save >/dev/null 2>&1; then
    iptables-save > /etc/hy2config/iptables-rules.v4 || true
  fi
  if command -v ip6tables-save >/dev/null 2>&1; then
    ip6tables-save > /etc/hy2config/iptables-rules.v6 || true
  fi
  cat > /etc/hy2config/restore-iptables.sh <<'EOF'
#!/usr/bin/env bash
set -e
if [ -f /etc/hy2config/iptables-rules.v4 ] && command -v iptables-restore >/dev/null 2>&1; then
  iptables-restore < /etc/hy2config/iptables-rules.v4
fi
if [ -f /etc/hy2config/iptables-rules.v6 ] && command -v ip6tables-restore >/dev/null 2>&1; then
  ip6tables-restore < /etc/hy2config/iptables-rules.v6
fi
EOF
  chmod +x /etc/hy2config/restore-iptables.sh
  cat > /etc/systemd/system/hysteria-iptables.service <<'EOF'
[Unit]
Description=Restore Hysteria2 port hopping iptables rules
After=network.target

[Service]
Type=oneshot
ExecStart=/etc/hy2config/restore-iptables.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now hysteria-iptables.service >/dev/null 2>&1 || true
}

configure_port_hopping() {
  local start_port="$1"
  local end_port="$2"
  local iface="$3"
  local ipv6_enabled="$4"
  local ipv6_iface="$5"

  need_port "Port hopping start" "$start_port"
  need_port "Port hopping end" "$end_port"
  if [ "$start_port" -gt "$end_port" ]; then
    simpleui_log "Port hopping start must be less than or equal to end"
    exit 31
  fi
  if [ -z "$iface" ]; then
    simpleui_log "Port hopping interface is required"
    exit 31
  fi

  if [ -x /etc/hy2config/jump_port_back.sh ]; then
    /etc/hy2config/jump_port_back.sh || true
  fi

  simpleui_log "Configuring IPv4 port hopping ${iface}:${start_port}-${end_port} -> ${port}"
  if ! iptables -t nat -C PREROUTING -i "$iface" -p udp --dport "${start_port}:${end_port}" -j REDIRECT --to-ports "$port" >/dev/null 2>&1; then
    iptables -t nat -A PREROUTING -i "$iface" -p udp --dport "${start_port}:${end_port}" -j REDIRECT --to-ports "$port"
  fi

  cat > /etc/hy2config/jump_port_back.sh <<EOF
#!/usr/bin/env bash
while iptables -t nat -C PREROUTING -i '${iface}' -p udp --dport '${start_port}:${end_port}' -j REDIRECT --to-ports '${port}' >/dev/null 2>&1; do
  iptables -t nat -D PREROUTING -i '${iface}' -p udp --dport '${start_port}:${end_port}' -j REDIRECT --to-ports '${port}' >/dev/null 2>&1 || break
done
EOF

  if is_true "$ipv6_enabled"; then
    if [ -z "$ipv6_iface" ]; then
      simpleui_log "IPv6 port hopping interface is required when IPv6 hopping is enabled"
      exit 31
    fi
    simpleui_log "Configuring IPv6 port hopping ${ipv6_iface}:${start_port}-${end_port} -> ${port}"
    if ! ip6tables -t nat -C PREROUTING -i "$ipv6_iface" -p udp --dport "${start_port}:${end_port}" -j REDIRECT --to-ports "$port" >/dev/null 2>&1; then
      ip6tables -t nat -A PREROUTING -i "$ipv6_iface" -p udp --dport "${start_port}:${end_port}" -j REDIRECT --to-ports "$port"
    fi
    cat >> /etc/hy2config/jump_port_back.sh <<EOF
while ip6tables -t nat -C PREROUTING -i '${ipv6_iface}' -p udp --dport '${start_port}:${end_port}' -j REDIRECT --to-ports '${port}' >/dev/null 2>&1; do
  ip6tables -t nat -D PREROUTING -i '${ipv6_iface}' -p udp --dport '${start_port}:${end_port}' -j REDIRECT --to-ports '${port}' >/dev/null 2>&1 || break
done
EOF
  fi

  chmod +x /etc/hy2config/jump_port_back.sh
  save_hy2_iptables_rules
}

detect_public_host() {
  local mode="${1:-ipv4}"
  local ip=""
  if [ "$mode" = "ipv6" ]; then
    ip="$(curl -6 -fsSL https://api.ip.sb/ip 2>/dev/null || curl -6 -fsSL https://ifconfig.me 2>/dev/null || true)"
    ip="$(printf '%s' "$ip" | tr -d '[:space:]')"
    if [ -n "$ip" ]; then
      printf '[%s]' "$ip"
      return 0
    fi
  else
    ip="$(curl -4 -fsSL http://ip-api.com/json/ 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("query",""))' 2>/dev/null || true)"
    if [ -z "$ip" ]; then
      ip="$(curl -4 -fsSL https://ifconfig.me 2>/dev/null || true)"
    fi
    ip="$(printf '%s' "$ip" | tr -d '[:space:]')"
    if [ -n "$ip" ]; then
      printf '%s' "$ip"
      return 0
    fi
  fi
  return 1
}

domain="${SIMPLEUI_DOMAIN:-}"
port="${SIMPLEUI_PORT:-443}"
masq="${SIMPLEUI_MASQUERADE_URL:-https://www.bing.com/}"
tls_mode="${SIMPLEUI_TLS_MODE:-acme-http}"
if [ -z "$domain" ] && [ "$tls_mode" != "self-signed" ]; then
  domain="$(hostname -f 2>/dev/null || hostname)"
fi
email="${SIMPLEUI_ACME_EMAIL:-admin@$domain}"
connect_host="${SIMPLEUI_SELF_SIGNED_HOST:-$domain}"
brutal="false"
obfs_block=""
sniff_block=""
jump_port_start=""
jump_port_end=""
jump_port_interface=""
jump_port_ipv6_interface=""
jump_mport=""
insecure="0"
sni="$domain"
cert_dir="/etc/ssl/private"

if is_true "${SIMPLEUI_BRUTAL:-false}"; then
  brutal="true"
fi

if is_true "${SIMPLEUI_JUMP_PORT_ENABLED:-0}"; then
  jump_port_start="${SIMPLEUI_JUMP_PORT_START:-}"
  jump_port_end="${SIMPLEUI_JUMP_PORT_END:-}"
  jump_port_interface="${SIMPLEUI_JUMP_PORT_INTERFACE:-}"
  jump_port_ipv6_interface="${SIMPLEUI_JUMP_PORT_IPV6_INTERFACE:-}"
  configure_port_hopping "$jump_port_start" "$jump_port_end" "$jump_port_interface" "${SIMPLEUI_JUMP_PORT_IPV6_ENABLED:-0}" "$jump_port_ipv6_interface"
  jump_mport="${jump_port_start}-${jump_port_end}"
fi

if [ "$installed_core" != "1" ] && [ -f /etc/hysteria/config.yaml ] && [ ! -f /etc/simpleui/hysteria2/original-config.yaml ]; then
  cp -a /etc/hysteria/config.yaml /etc/simpleui/hysteria2/original-config.yaml
fi

tls_block=""
case "$tls_mode" in
  self-signed)
    cert_name="${SIMPLEUI_SELF_SIGNED_DOMAIN:-bing.com}"
    sni="$cert_name"
    insecure="1"
    if [ -z "$connect_host" ]; then
      connect_host="$(detect_public_host "${SIMPLEUI_SELF_SIGNED_IP_MODE:-ipv4}" || true)"
    fi
    if [ -z "$connect_host" ]; then
      simpleui_log "Self-signed mode could not detect the public connection address"
      exit 32
    fi
    if [ -z "$domain" ]; then
      domain="$connect_host"
    fi
    simpleui_log "Generating self-signed certificate for $cert_name"
    install -d -m 755 "$cert_dir"
    openssl ecparam -name prime256v1 -out "${cert_dir}/ec_param.pem"
    openssl req -x509 -nodes -newkey "ec:${cert_dir}/ec_param.pem" \
      -keyout "${cert_dir}/${cert_name}.key" \
      -out "${cert_dir}/${cert_name}.crt" \
      -subj "/CN=${cert_name}" \
      -days 36500 >/dev/null 2>&1
    if id hysteria >/dev/null 2>&1; then
      chown root:hysteria "${cert_dir}/${cert_name}.key" "${cert_dir}/${cert_name}.crt" "${cert_dir}/ec_param.pem" || true
    fi
    chmod 644 "${cert_dir}/${cert_name}.key"
    chmod 644 "${cert_dir}/${cert_name}.crt"
    tls_block="tls:
  cert: $(yaml_val "${cert_dir}/${cert_name}.crt")
  key: $(yaml_val "${cert_dir}/${cert_name}.key")"
    ;;
  manual-cert)
    cert_path="${SIMPLEUI_CERT_PATH:-}"
    key_path="${SIMPLEUI_KEY_PATH:-}"
    if [ -z "$cert_path" ] || [ -z "$key_path" ]; then
      simpleui_log "Manual certificate mode requires certificate and private key paths"
      exit 32
    fi
    sni="$domain"
    simpleui_log "Using manual Hysteria2 certificate paths"
    tls_block="tls:
  cert: $(yaml_val "$cert_path")
  key: $(yaml_val "$key_path")"
    ;;
  acme-dns|acme-dns-cloudflare)
    dns_provider="${SIMPLEUI_DNS_PROVIDER:-cloudflare}"
    if [ "$tls_mode" = "acme-dns-cloudflare" ]; then
      dns_provider="cloudflare"
    fi
    dns_token="${SIMPLEUI_DNS_TOKEN:-}"
    if [ -z "$dns_token" ]; then
      simpleui_log "ACME DNS mode requires a DNS provider token"
      exit 32
    fi
    simpleui_log "Configuring Hysteria2 ACME DNS certificate for $domain via $dns_provider"
    case "$dns_provider" in
      cloudflare)
        dns_block="  dns:
    name: cloudflare
    config:
      cloudflare_api_token: $(yaml_val "$dns_token")"
        ;;
      duckdns)
        dns_block="  dns:
    name: duckdns
    config:
      duckdns_api_token: $(yaml_val "$dns_token")"
        if [ -n "${SIMPLEUI_DNS_OVERRIDE_DOMAIN:-}" ]; then
          dns_block="${dns_block}
    duckdns_override_domain: $(yaml_val "$SIMPLEUI_DNS_OVERRIDE_DOMAIN")"
        fi
        ;;
      gandi)
        dns_block="  dns:
    name: gandi
    config:
      gandi_api_token: $(yaml_val "$dns_token")"
        ;;
      godaddy)
        dns_block="  dns:
    name: godaddy
    config:
      godaddy_api_token: $(yaml_val "$dns_token")"
        ;;
      namedotcom|name.com)
        dns_block="  dns:
    name: namedotcom
    config:
      namedotcom_token: $(yaml_val "$dns_token")
      namedotcom_user: $(yaml_val "${SIMPLEUI_DNS_USER:-}")
      namedotcom_server: $(yaml_val "${SIMPLEUI_DNS_SERVER:-api.name.com}")"
        ;;
      vultr)
        dns_block="  dns:
    name: vultr
    config:
      vultr_api_key: $(yaml_val "$dns_token")"
        ;;
      *)
        simpleui_log "Unsupported ACME DNS provider: $dns_provider"
        exit 32
        ;;
    esac
    tls_block="acme:
  domains:
    - $(yaml_val "$domain")
  email: $(yaml_val "$email")
  type: dns
${dns_block}"
    ;;
  *)
    simpleui_log "Configuring Hysteria2 ACME HTTP certificate for $domain"
    tls_block="acme:
  domains:
    - $(yaml_val "$domain")
  email: $(yaml_val "$email")"
    ;;
esac

if is_true "${SIMPLEUI_OBFS_ENABLED:-0}"; then
  obfs_password="${SIMPLEUI_OBFS_PASSWORD:-}"
  if [ -z "$obfs_password" ]; then
    simpleui_log "Salamander obfs requires a password"
    exit 33
  fi
  obfs_block="obfs:
  type: salamander
  
  salamander:
    password: $(yaml_val "$obfs_password")"
fi

if is_true "${SIMPLEUI_SNIFF_ENABLED:-0}"; then
  sniff_block="sniff:
  enable: true
  timeout: 2s
  rewriteDomain: false
  tcpPorts: 80,443,8000-9000
  udpPorts: all"
fi

cat > /etc/hysteria/config.yaml <<EOF
listen: :${port}

${tls_block}

auth:
  type: password
  password: $(yaml_val "$hy2_password")

masquerade:
  type: proxy
  proxy:
    url: $(yaml_val "$masq")
    rewriteHost: true

ignoreClientBandwidth: ${brutal}

${obfs_block}
${sniff_block}
EOF

cat > /etc/hy2config/simpleui.env <<EOF
SIMPLEUI_DOMAIN=${domain}
SIMPLEUI_CONNECT_HOST=${connect_host}
SIMPLEUI_PORT=${port}
SIMPLEUI_TLS_MODE=${tls_mode}
SIMPLEUI_SNI=${sni}
SIMPLEUI_INSECURE=${insecure}
SIMPLEUI_JUMP_PORT_START=${jump_port_start}
SIMPLEUI_JUMP_PORT_END=${jump_port_end}
SIMPLEUI_JUMP_PORT_INTERFACE=${jump_port_interface}
SIMPLEUI_JUMP_PORT_IPV6_INTERFACE=${jump_port_ipv6_interface}
EOF
chmod 600 /etc/hy2config/simpleui.env

python3 - "$connect_host" "$port" "$sni" "$insecure" "${SIMPLEUI_OBFS_ENABLED:-0}" "${SIMPLEUI_OBFS_PASSWORD:-}" "$jump_mport" <<'PY'
import json
import pathlib
import sys
from urllib.parse import quote

host, port, sni, insecure, obfs_enabled, obfs_password, mport = sys.argv[1:8]
users_path = pathlib.Path("/etc/simpleui/hysteria2/users.kv")
links = []

def uri_host(value):
    value = value.strip()
    if value.startswith("[") and "]" in value:
        return value
    if ":" in value:
        return f"[{value}]"
    return value

endpoint_host = uri_host(host)
for raw in users_path.read_text().splitlines() if users_path.exists() else []:
    if ":" not in raw:
        continue
    username, password = raw.split(":", 1)
    params = [f"sni={quote(sni)}"]
    if obfs_enabled in {"1", "true", "TRUE", "yes", "y"}:
        params.extend(["obfs=salamander", f"obfs-password={quote(obfs_password)}"])
    params.append(f"insecure={insecure}")
    if mport:
        params.append(f"mport={quote(mport)}")
    auth = quote(password, safe="")
    links.append({
        "username": username,
        "uri": f"hysteria2://{auth}@{endpoint_host}:{port}?{'&'.join(params)}#{quote(username)}"
    })
out_dir = pathlib.Path("/etc/hy2config")
out_dir.mkdir(parents=True, exist_ok=True)
scheme_text = f"您的 v2ray hy2配置链接为：{links[0]['uri']}\n" if links else ""
(out_dir / "hy2_url_scheme.txt").write_text(scheme_text)
(out_dir / "share-links.json").write_text(json.dumps(links, ensure_ascii=False, indent=2))
PY
chmod 600 /etc/hy2config/hy2_url_scheme.txt /etc/hy2config/share-links.json

simpleui_log "Downloading subscription templates for the first generated Hysteria2 link"
first_link="$(python3 - <<'PY'
import json
import pathlib

path = pathlib.Path("/etc/hy2config/share-links.json")
links = json.loads(path.read_text()) if path.exists() else []
print(links[0]["uri"] if links else "")
PY
)"
if [ -n "$first_link" ]; then
  encoded_link="$(python3 - "$first_link" <<'PY'
from urllib.parse import quote
import sys
print(quote(sys.argv[1], safe=""))
PY
)"
  url_rule="&ua=&selectedRules=%22balanced%22&customRules=%5B%5D"
  curl -fsSL -o /etc/hy2config/clash.yaml "https://sub.baibaicat.site/clash?config=${encoded_link}${url_rule}" || true
  curl -fsSL -o /etc/hy2config/sing-box.yaml "https://sub.baibaicat.site/singbox?config=${encoded_link}${url_rule}" || true
  curl -fsSL -o /etc/hy2config/surge.yaml "https://sub.baibaicat.site/surge?config=${encoded_link}${url_rule}" || true
fi

cat > /etc/simpleui/hysteria2/managed.env <<EOF
SIMPLEUI_PROTOCOL=hysteria2
SIMPLEUI_SERVICE=hysteria-server.service
SIMPLEUI_CONFIG=/etc/hysteria/config.yaml
SIMPLEUI_DOMAIN=${domain}
SIMPLEUI_CONNECT_HOST=${connect_host}
SIMPLEUI_PORT=${port}
SIMPLEUI_TLS_MODE=${tls_mode}
SIMPLEUI_INSTALLED_CORE=${installed_core}
SIMPLEUI_CERT_DIR=${cert_dir}
SIMPLEUI_CERT_NAME=${sni}
SIMPLEUI_JUMP_PORT_START=${jump_port_start}
SIMPLEUI_JUMP_PORT_END=${jump_port_end}
SIMPLEUI_JUMP_PORT_INTERFACE=${jump_port_interface}
SIMPLEUI_JUMP_PORT_IPV6_INTERFACE=${jump_port_ipv6_interface}
EOF
chmod 600 /etc/simpleui/hysteria2/managed.env

systemctl daemon-reload
systemctl enable --now hysteria-server.service
systemctl restart hysteria-server.service

simpleui_log "Hysteria2 deployed through Python-maintained upstream flow"
printf '__SIMPLEUI_RESULT__{"protocol":"hysteria2","service":"hysteria-server.service","domain":"%s","connectHost":"%s","port":%s,"jumpPortStart":"%s","jumpPortEnd":"%s"}\n' "$domain" "$connect_host" "$port" "$jump_port_start" "$jump_port_end"
