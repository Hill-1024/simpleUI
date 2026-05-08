set -euo pipefail

simpleui_log() {
  printf '[simpleui] %s\n' "$*"
}

simpleui_need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    simpleui_log "This hook must run as root or a sudo-capable root SSH account."
    exit 20
  fi
}

simpleui_pkg_install() {
  if command -v apt-get >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    yum install -y "$@"
  else
    simpleui_log "No supported package manager found."
    exit 21
  fi
}

simpleui_ensure_base_tools() {
  local missing=""
  for bin in curl bash systemctl ss python3; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      missing="$missing $bin"
    fi
  done
  if [ -n "$missing" ]; then
    simpleui_log "Installing base tools:$missing"
    simpleui_pkg_install curl bash procps iproute2 ca-certificates python3 || true
  fi
}

simpleui_json_escape() {
  python3 - "$1" <<'PY'
import json, sys
print(json.dumps(sys.argv[1]))
PY
}

simpleui_write_kv_users() {
  local target="$1"
  local users="${SIMPLEUI_USERS:-}"
  mkdir -p "$(dirname "$target")"
  : > "$target"
  IFS='|' read -r -a pairs <<< "$users"
  for pair in "${pairs[@]}"; do
    [ -z "$pair" ] && continue
    printf '%s\n' "$pair" >> "$target"
  done
  chmod 600 "$target"
}

simpleui_mark_protocol() {
  local protocol="$1"
  mkdir -p /etc/simpleui
  touch /etc/simpleui/managed-protocols
  if ! grep -qxF "$protocol" /etc/simpleui/managed-protocols; then
    printf '%s\n' "$protocol" >> /etc/simpleui/managed-protocols
  fi
  chmod 600 /etc/simpleui/managed-protocols
}

simpleui_save_firewall() {
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save || true
  elif command -v service >/dev/null 2>&1 && service iptables status >/dev/null 2>&1; then
    service iptables save || true
  fi
}

simpleui_need_root
simpleui_ensure_base_tools
