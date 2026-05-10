#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${SIMPLEUI_APP_DIR:-/opt/simpleui}"
APP_USER="${SIMPLEUI_USER:-simpleui}"
REPO_URL="${SIMPLEUI_REPO_URL:-https://github.com/Hill-1024/simpleUI.git}"
BRANCH="${SIMPLEUI_BRANCH:-main}"
HOST="${SIMPLEUI_HOST:-127.0.0.1}"
PORT="${SIMPLEUI_PORT:-8787}"
TRUST_PROXY="${SIMPLEUI_TRUST_PROXY:-}"
ALLOWED_ORIGINS="${SIMPLEUI_ALLOWED_ORIGINS:-}"
PNPM_VERSION="${SIMPLEUI_PNPM_VERSION:-10.33.2}"
NODE_MAJOR="${SIMPLEUI_NODE_MAJOR:-22}"
ACTION="${1:-${SIMPLEUI_ACTION:-install}}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run this script as root." >&2
  exit 1
fi

uninstall_webui() {
  systemctl disable --now simpleui-web.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/simpleui-web.service
  systemctl daemon-reload
  systemctl reset-failed simpleui-web.service >/dev/null 2>&1 || true

  if [[ "${SIMPLEUI_KEEP_DATA:-0}" == "1" ]]; then
    echo "SimpleUI WebUI service removed. Data kept at ${APP_DIR}."
    return
  fi

  if [[ -n "${APP_DIR}" && "${APP_DIR}" != "/" ]]; then
    rm -rf -- "${APP_DIR}"
  fi
  if id "${APP_USER}" >/dev/null 2>&1; then
    userdel "${APP_USER}" >/dev/null 2>&1 || true
  fi

  echo "SimpleUI WebUI uninstalled."
}

case "${ACTION}" in
  install|upgrade|update)
    ;;
  uninstall|remove|--uninstall)
    uninstall_webui
    exit 0
    ;;
  *)
    echo "Usage: $0 [install|uninstall]" >&2
    exit 64
    ;;
esac

install_base_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl git build-essential python3
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git gcc-c++ make python3
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git gcc-c++ make python3
    return
  fi
  echo "Unsupported package manager. Install ca-certificates, curl, git, Node.js ${NODE_MAJOR}+, pnpm, python3, make and a C++ compiler first." >&2
  exit 1
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p "process.versions.node.split('.')[0]")"
    if [[ "${major}" -ge 20 ]]; then
      return
    fi
  fi

  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
    return
  fi

  echo "Node.js 20+ is required. Install Node.js ${NODE_MAJOR}+ and rerun this script." >&2
  exit 1
}

run_as_app_user() {
  runuser -u "${APP_USER}" -- env HOME="${APP_DIR}" COREPACK_HOME="${APP_DIR}/.corepack" "$@"
}

install_base_packages
ensure_node
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

if [[ -d "${APP_DIR}/.git" ]]; then
  run_as_app_user git -C "${APP_DIR}" fetch --depth 1 origin "${BRANCH}"
  run_as_app_user git -C "${APP_DIR}" reset --hard "origin/${BRANCH}"
else
  find "${APP_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  run_as_app_user git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

run_as_app_user pnpm -C "${APP_DIR}" install --frozen-lockfile
run_as_app_user pnpm -C "${APP_DIR}" build
run_as_app_user pnpm -C "${APP_DIR}" prune --prod

if [[ -z "${TRUST_PROXY}" ]]; then
  case "${HOST}" in
    127.*|localhost|::1|\[::1\])
      TRUST_PROXY=1
      ;;
    *)
      TRUST_PROXY=0
      ;;
  esac
fi

PNPM_BIN="$(command -v pnpm)"
cat >/etc/systemd/system/simpleui-web.service <<SERVICE
[Unit]
Description=SimpleUI WebUI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=SIMPLEUI_HOST=${HOST}
Environment=SIMPLEUI_PORT=${PORT}
Environment=SIMPLEUI_TRUST_PROXY=${TRUST_PROXY}
Environment=SIMPLEUI_ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
ExecStart=${PNPM_BIN} start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable simpleui-web.service
systemctl restart simpleui-web.service
sleep 1

echo "SimpleUI WebUI deployed."
echo "Service: simpleui-web.service"
echo "URL: http://${HOST}:${PORT}"
INITIAL_PASSWORD="$(journalctl -u simpleui-web.service -n 80 --no-pager 2>/dev/null | awk '/SimpleUI initial WebUI password:/{getline; print; exit}')"
if [[ -n "${INITIAL_PASSWORD}" ]]; then
  echo "Initial WebUI password: ${INITIAL_PASSWORD}"
  echo "Sign in with this UUID password, then change it from the WebUI About page."
else
  echo "Initial WebUI password was already generated. If needed, inspect: sudo journalctl -u simpleui-web.service --no-pager"
fi
