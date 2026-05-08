simpleui_log "Preparing Trojan upstream installer flow"

domain="${SIMPLEUI_DOMAIN:-}"
domain="$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]')"
if [ -z "$domain" ]; then
  simpleui_log "Trojan deployment requires SIMPLEUI_DOMAIN."
  exit 30
fi
domain_resolve_family="unknown"
trojan_local_addr="0.0.0.0"

workdir="/opt/simpleui/upstream/trojan"
mkdir -p "$workdir" /etc/simpleui/trojan /usr/src/trojan-cert
cd "$workdir"
simpleui_mark_protocol "trojan"

curl -fsSL https://raw.githubusercontent.com/xyz690/Trojan/master/trojan_install.sh -o trojan_install.sh
chmod +x trojan_install.sh

had_nginx="0"
if command -v nginx >/dev/null 2>&1; then
  had_nginx="1"
fi
had_acme="0"
if [ -x /root/.acme.sh/acme.sh ]; then
  had_acme="1"
fi

installed_service="0"
if ! systemctl list-unit-files | grep -q '^trojan\.service'; then
  installed_service="1"
fi

cat > /etc/simpleui/trojan/managed.env <<EOF
SIMPLEUI_PROTOCOL=trojan
SIMPLEUI_SERVICE=trojan.service
SIMPLEUI_CONFIG=/usr/src/trojan/server.conf
SIMPLEUI_DOMAIN=${domain}
SIMPLEUI_PORT=443
SIMPLEUI_INSTALLED_SERVICE=${installed_service}
SIMPLEUI_HAD_NGINX=${had_nginx}
SIMPLEUI_HAD_ACME=${had_acme}
SIMPLEUI_CERT_DIR=/usr/src/trojan-cert
SIMPLEUI_PARTIAL=1
EOF
chmod 600 /etc/simpleui/trojan/managed.env

disable_selinux_for_acme() {
  if [ -f /etc/selinux/config ] && grep -Eq '^SELINUX=(enforcing|permissive)' /etc/selinux/config; then
    simpleui_log "Disabling SELinux mode for ACME standalone parity with upstream script"
    sed -i 's/^SELINUX=.*/SELINUX=disabled/g' /etc/selinux/config || true
    setenforce 0 >/dev/null 2>&1 || true
  fi
}

install_trojan_packages() {
  simpleui_log "Installing Trojan upstream dependencies"
  if command -v apt-get >/dev/null 2>&1; then
    simpleui_pkg_install net-tools socat nginx wget unzip zip curl tar xz-utils ca-certificates
  else
    simpleui_pkg_install net-tools socat nginx wget unzip zip curl tar xz ca-certificates
  fi
}

port_listener() {
  local port="$1"
  ss -Htlpn 2>/dev/null | awk -v suffix=":${port}" '$4 ~ suffix "$" {print; exit}'
}

ensure_port_free() {
  local port="$1"
  local owner
  owner="$(port_listener "$port" || true)"
  if [ -n "$owner" ]; then
    simpleui_log "Port ${port} is occupied: ${owner}"
    exit 31
  fi
}

public_ipv4() {
  curl -4 -fsSL https://ipv4.icanhazip.com 2>/dev/null | tr -d '[:space:]' || true
}

public_ipv6() {
  curl -6 -fsSL https://ifconfig.me 2>/dev/null | tr -d '[:space:]' || true
}

domain_ipv4s() {
  getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1}' | sort -u || true
}

domain_ipv6s() {
  getent ahostsv6 "$domain" 2>/dev/null | awk '{print $1}' | sort -u || true
}

verify_domain_points_here() {
  local local_v4
  local local_v6
  local ips_v4
  local ips_v6
  local_v4="$(public_ipv4)"
  local_v6="$(public_ipv6)"
  ips_v4="$(domain_ipv4s)"
  ips_v6="$(domain_ipv6s)"
  if [ -n "$local_v6" ] && printf '%s\n' "$ips_v6" | grep -qxF "$local_v6"; then
    simpleui_log "Domain ${domain} AAAA record resolves to this VPS (${local_v6})"
    domain_resolve_family="ipv6"
    trojan_local_addr="::"
    return
  fi
  if [ -n "$local_v4" ] && printf '%s\n' "$ips_v4" | grep -qxF "$local_v4"; then
    simpleui_log "Domain ${domain} A record resolves to this VPS (${local_v4})"
    domain_resolve_family="ipv4"
    trojan_local_addr="0.0.0.0"
    return
  fi
  simpleui_log "Domain ${domain} does not resolve to this VPS. A=[$(printf '%s' "$ips_v4" | tr '\n' ' ')] AAAA=[$(printf '%s' "$ips_v6" | tr '\n' ' ')] localIPv4=${local_v4:-none} localIPv6=${local_v6:-none}"
  exit 32
}

prepare_nginx_site() {
  simpleui_log "Preparing nginx masquerade site used by upstream Trojan flow"
  if [ "$had_nginx" = "1" ] && [ -f /etc/nginx/nginx.conf ] && [ ! -f /etc/simpleui/trojan/original-nginx.conf ]; then
    cp -a /etc/nginx/nginx.conf /etc/simpleui/trojan/original-nginx.conf
  fi
  cat > /etc/nginx/nginx.conf <<EOF
user  root;
worker_processes  1;
error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;
events {
    worker_connections  1024;
}
http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    log_format  main  '\$remote_addr - \$remote_user [\$time_local] "\$request" '
                      '\$status \$body_bytes_sent "\$http_referer" '
                      '"\$http_user_agent" "\$http_x_forwarded_for"';
    access_log  /var/log/nginx/access.log  main;
    sendfile        on;
    keepalive_timeout  120;
    client_max_body_size 20m;
    server {
        listen       80;
        listen       [::]:80;
        server_name  ${domain};
        root /usr/share/nginx/html;
        index index.php index.html index.htm;
    }
}
EOF

  rm -rf /usr/share/nginx/html/*
  mkdir -p /usr/share/nginx/html
  if curl -fL --retry 2 -o /tmp/simpleui-trojan-web.zip https://github.com/xyz690/Trojan/raw/master/web.zip; then
    unzip -oq /tmp/simpleui-trojan-web.zip -d /usr/share/nginx/html || true
    rm -f /tmp/simpleui-trojan-web.zip
  fi
  if [ ! -f /usr/share/nginx/html/index.html ]; then
    printf '<!doctype html><html><head><meta charset="utf-8"><title>%s</title></head><body></body></html>\n' "$domain" > /usr/share/nginx/html/index.html
  fi
}

issue_trojan_certificate() {
  local home_dir="${HOME:-/root}"
  local acme="${home_dir}/.acme.sh/acme.sh"
  local email="${SIMPLEUI_ACME_EMAIL:-}"
  local issue_status="0"
  local listen_args=()

  simpleui_log "Applying Trojan certificate with acme.sh standalone HTTP challenge"
  systemctl stop trojan.service >/dev/null 2>&1 || true
  systemctl stop trojan >/dev/null 2>&1 || true
  systemctl stop nginx >/dev/null 2>&1 || true
  ensure_port_free 80

  if [ ! -x "$acme" ]; then
    curl -fsSL https://get.acme.sh | HOME="$home_dir" sh
  fi
  if [ ! -x "$acme" ]; then
    simpleui_log "acme.sh installation failed"
    exit 33
  fi

  HOME="$home_dir" "$acme" --set-default-ca --server letsencrypt
  if [ -n "$email" ]; then
    HOME="$home_dir" "$acme" --register-account -m "$email" --server letsencrypt || true
  fi
  if [ "$domain_resolve_family" = "ipv6" ]; then
    listen_args=(--listen-v6)
  elif [ "$domain_resolve_family" = "ipv4" ]; then
    listen_args=(--listen-v4)
  fi
  HOME="$home_dir" "$acme" --issue -d "$domain" --standalone "${listen_args[@]}" || issue_status="$?"
  if [ "$issue_status" != "0" ]; then
    simpleui_log "acme.sh issue exited with ${issue_status}; trying to install any existing certificate for ${domain}"
  fi
  HOME="$home_dir" "$acme" --installcert -d "$domain" \
    --key-file /usr/src/trojan-cert/private.key \
    --fullchain-file /usr/src/trojan-cert/fullchain.cer

  if [ ! -s /usr/src/trojan-cert/fullchain.cer ] || [ ! -s /usr/src/trojan-cert/private.key ]; then
    simpleui_log "Trojan certificate files were not created"
    exit 33
  fi
  chmod 600 /usr/src/trojan-cert/private.key
  chmod 644 /usr/src/trojan-cert/fullchain.cer
}

install_trojan_core() {
  if [ -x /usr/src/trojan/trojan ]; then
    simpleui_log "Trojan core already present"
    return
  fi

  simpleui_log "Installing latest trojan-gfw release"
  mkdir -p /usr/src
  cd /usr/src
  latest_version="$(curl -fsSL https://api.github.com/repos/trojan-gfw/trojan/releases/latest | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"].lstrip("v"))')"
  curl -fL --retry 2 -o "trojan-${latest_version}-linux-amd64.tar.xz" "https://github.com/trojan-gfw/trojan/releases/download/v${latest_version}/trojan-${latest_version}-linux-amd64.tar.xz"
  tar xf "trojan-${latest_version}-linux-amd64.tar.xz"
  rm -f "trojan-${latest_version}-linux-amd64.tar.xz"
  chmod +x /usr/src/trojan/trojan
}

write_trojan_config() {
  config="/usr/src/trojan/server.conf"
  if [ -f "$config" ] && [ ! -f /etc/simpleui/trojan/original-config.json ]; then
    cp -a "$config" /etc/simpleui/trojan/original-config.json
  fi

  simpleui_write_kv_users /etc/simpleui/trojan/users.kv
  python3 - "$domain" "$trojan_local_addr" "$config" /etc/simpleui/trojan/users.kv <<'PY'
import json
import pathlib
import sys
from urllib.parse import quote

domain = sys.argv[1]
local_addr = sys.argv[2]
config_path = pathlib.Path(sys.argv[3])
users_path = pathlib.Path(sys.argv[4])
users = {}
selected_username = ""
selected_password = ""
for raw in users_path.read_text().splitlines():
    if ":" not in raw:
        continue
    username, password = raw.split(":", 1)
    username = username.strip()
    password = password.strip()
    if username and password and not selected_password:
        selected_username = username
        selected_password = password
        users[username] = password
if not selected_password:
    raise SystemExit("at least one Trojan password is required")

config = {
    "run_type": "server",
    "local_addr": local_addr,
    "local_port": 443,
    "remote_addr": "127.0.0.1",
    "remote_port": 80,
    "password": [selected_password],
    "log_level": 1,
    "ssl": {
        "cert": "/usr/src/trojan-cert/fullchain.cer",
        "key": "/usr/src/trojan-cert/private.key",
        "key_password": "",
        "cipher_tls13": "TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384",
        "prefer_server_cipher": True,
        "alpn": ["http/1.1"],
        "reuse_session": True,
        "session_ticket": False,
        "session_timeout": 600,
        "plain_http_response": "",
        "curves": "",
        "dhparam": ""
    },
    "tcp": {
        "no_delay": True,
        "keep_alive": True,
        "fast_open": False,
        "fast_open_qlen": 20
    },
    "mysql": {
        "enabled": False,
        "server_addr": "127.0.0.1",
        "server_port": 3306,
        "database": "trojan",
        "username": "trojan",
        "password": ""
    }
}
config_path.write_text(json.dumps(config, indent=4) + "\n")
pathlib.Path("/etc/simpleui/trojan/users.json").write_text(json.dumps(users, indent=2) + "\n")
links = [{
    "username": selected_username or "default",
    "uri": f"trojan://{quote(selected_password, safe='')}@{domain}:443?security=tls&type=tcp&headerType=none#Trojan"
}]
pathlib.Path("/etc/simpleui/trojan/share-links.json").write_text(json.dumps(links, indent=2, ensure_ascii=False) + "\n")
PY
  chmod 600 /etc/simpleui/trojan/users.kv /etc/simpleui/trojan/users.json /etc/simpleui/trojan/share-links.json
}

write_trojan_service() {
  cat > /etc/systemd/system/trojan.service <<'EOF'
[Unit]
Description=trojan
After=network.target

[Service]
Type=simple
PIDFile=/usr/src/trojan/trojan/trojan.pid
ExecStart=/usr/src/trojan/trojan -c /usr/src/trojan/server.conf
ExecReload=
ExecStop=/usr/src/trojan/trojan
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
  chmod 644 /etc/systemd/system/trojan.service
}

disable_selinux_for_acme
install_trojan_packages
verify_domain_points_here
systemctl stop trojan.service >/dev/null 2>&1 || true
systemctl stop trojan >/dev/null 2>&1 || true
systemctl stop nginx >/dev/null 2>&1 || true
ensure_port_free 80
ensure_port_free 443
prepare_nginx_site
issue_trojan_certificate
install_trojan_core
write_trojan_config
write_trojan_service

cat > /etc/simpleui/trojan/managed.env <<EOF
SIMPLEUI_PROTOCOL=trojan
SIMPLEUI_SERVICE=trojan.service
SIMPLEUI_CONFIG=/usr/src/trojan/server.conf
SIMPLEUI_DOMAIN=${domain}
SIMPLEUI_PORT=443
SIMPLEUI_INSTALLED_SERVICE=${installed_service}
SIMPLEUI_HAD_NGINX=${had_nginx}
SIMPLEUI_HAD_ACME=${had_acme}
SIMPLEUI_CERT_DIR=/usr/src/trojan-cert
EOF
chmod 600 /etc/simpleui/trojan/managed.env

systemctl daemon-reload
systemctl enable --now nginx
systemctl restart nginx
systemctl enable --now trojan.service
systemctl restart trojan.service

simpleui_log "Trojan deployed with upstream acme.sh certificate automation and SimpleUI user list"
printf '__SIMPLEUI_RESULT__{"protocol":"trojan","service":"trojan.service","domain":"%s","port":443,"cert":"/usr/src/trojan-cert/fullchain.cer"}\n' "$domain"
