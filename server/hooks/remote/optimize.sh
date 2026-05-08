#!/usr/bin/env bash

simpleui_ensure_tool() {
  local bin="$1"
  local pkg="${2:-$1}"
  if command -v "$bin" >/dev/null 2>&1; then
    return 0
  fi
  simpleui_log "Installing dependency: $pkg"
  simpleui_pkg_install "$pkg"
}

simpleui_tcpx_status() {
  local conf="/etc/sysctl.d/99-sysctl.conf"
  local qdisc="unknown"
  local cc="unknown"
  local available_cc="unknown"
  local ecn="unknown"
  local kernel
  kernel="$(uname -r)"
  qdisc="$(cat /proc/sys/net/core/default_qdisc 2>/dev/null || echo unknown)"
  cc="$(cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null || echo unknown)"
  available_cc="$(cat /proc/sys/net/ipv4/tcp_available_congestion_control 2>/dev/null || echo unknown)"
  ecn="$(cat /proc/sys/net/ipv4/tcp_ecn 2>/dev/null || echo unknown)"

  python3 - "$kernel" "$qdisc" "$cc" "$available_cc" "$ecn" "$conf" <<'PY'
import json
import os
import sys

kernel, qdisc, cc, available_cc, ecn, conf = sys.argv[1:]
xanmod = any("xanmod" in item.lower() for item in [kernel])
payload = {
    "ok": True,
    "kernel": kernel,
    "queueDiscipline": qdisc,
    "congestionControl": cc,
    "availableCongestionControl": available_cc.split(),
    "ecn": ecn,
    "sysctlConfig": conf if os.path.exists(conf) else None,
    "xanmodRunning": xanmod,
    "needsReboot": False,
}
print("__SIMPLEUI_OPTIMIZE__" + json.dumps(payload, ensure_ascii=False))
PY
}

simpleui_download_tcpx() {
  local dir="/opt/simpleui-hook/upstream/tcpx"
  local script="$dir/tcpx.sh"
  install -d -m 700 "$dir"
  simpleui_ensure_tool curl curl
  simpleui_log "Downloading upstream Linux-NetSpeed tcpx.sh"
  curl -fsSL "https://raw.githubusercontent.com/ylx2016/Linux-NetSpeed/master/tcpx.sh" -o "$script"
  chmod 700 "$script"
  SIMPLEUI_TCPX_SCRIPT="$script"
}

simpleui_show_kernels() {
  simpleui_log "Installed kernel packages:"
  if command -v rpm >/dev/null 2>&1; then
    rpm -qa | grep -E "^kernel-(image|core|modules|devel|headers)" | sort -V || true
  elif command -v dpkg-query >/dev/null 2>&1; then
    dpkg-query -W -f='${Package} ${Version}\n' 'linux-image*' 'linux-headers*' 'linux-modules*' 2>/dev/null | grep -E "^(linux-image|linux-headers|linux-modules)" | sort -V || true
  fi
  simpleui_log "Boot kernels:"
  ls -1v /boot/vmlinuz-* 2>/dev/null || true
  simpleui_log "Running kernel: $(uname -r)"
  simpleui_optimize_result "show-kernels" "0"
}

simpleui_action_menu_number() {
  case "${1:-status}" in
    bbr-fq) printf '20\n' ;;
    bbr-fq-pie) printf '21\n' ;;
    bbr-cake) printf '22\n' ;;
    bbrplus-fq) printf '23\n' ;;
    ecn-on) printf '30\n' ;;
    ecn-off) printf '31\n' ;;
    adaptive-system) printf '32\n' ;;
    anti-cc) printf '33\n' ;;
    ipv6-off) printf '35\n' ;;
    ipv6-on) printf '36\n' ;;
    xanmod-main) printf '9\n' ;;
    xanmod-lts) printf '10\n' ;;
    xanmod-edge) printf '11\n' ;;
    xanmod-rt) printf '12\n' ;;
    official-stable-kernel) printf '7\n' ;;
    official-latest-kernel) printf '8\n' ;;
    *)
      simpleui_log "Unsupported optimize action: ${1:-}"
      exit 64
      ;;
  esac
}

simpleui_optimize_result() {
  local action="$1"
  local code="$2"
  local kernel
  local qdisc
  local cc
  local ecn
  kernel="$(uname -r)"
  qdisc="$(cat /proc/sys/net/core/default_qdisc 2>/dev/null || echo unknown)"
  cc="$(cat /proc/sys/net/ipv4/tcp_congestion_control 2>/dev/null || echo unknown)"
  ecn="$(cat /proc/sys/net/ipv4/tcp_ecn 2>/dev/null || echo unknown)"
  python3 - "$action" "$code" "$kernel" "$qdisc" "$cc" "$ecn" <<'PY'
import json
import sys

action, code, kernel, qdisc, cc, ecn = sys.argv[1:]
reboot_actions = {
    "adaptive-system",
    "xanmod-main",
    "xanmod-lts",
    "xanmod-edge",
    "xanmod-rt",
    "official-stable-kernel",
    "official-latest-kernel",
}
payload = {
    "ok": code == "0",
    "action": action,
    "exitCode": int(code),
    "kernel": kernel,
    "queueDiscipline": qdisc,
    "congestionControl": cc,
    "ecn": ecn,
    "needsReboot": action in reboot_actions,
}
print("__SIMPLEUI_OPTIMIZE__" + json.dumps(payload, ensure_ascii=False))
PY
}

simpleui_run_tcpx_action() {
  local action="$1"
  local menu_number
  menu_number="$(simpleui_action_menu_number "$action")"
  simpleui_download_tcpx

  simpleui_log "Running upstream tcpx.sh menu option $menu_number for action $action"
  set +e
  printf '%s\n' "$menu_number" | bash "$SIMPLEUI_TCPX_SCRIPT"
  local code=$?
  set -e

  simpleui_optimize_result "$action" "$code"
  return "$code"
}

action="${SIMPLEUI_OPTIMIZE_ACTION:-status}"
case "$action" in
  status)
    simpleui_log "Reading current acceleration status"
    simpleui_tcpx_status
    ;;
  show-kernels)
    simpleui_show_kernels
    ;;
  *)
    simpleui_run_tcpx_action "$action"
    ;;
esac
