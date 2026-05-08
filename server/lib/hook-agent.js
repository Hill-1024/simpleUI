import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { readHookScript } from "./providers.js";
import { runSshScript } from "./ssh.js";

export const DEFAULT_HOOK_PORT = 37877;

const hookNames = [
  "common.sh",
  "hysteria2-deploy.sh",
  "trojan-deploy.sh",
  "server-status.sh",
  "server-reboot.sh",
  "status.sh",
  "service.sh",
  "ban.sh",
  "optimize.sh",
  "ipquality.sh",
  "uninstall.sh"
];

function heredoc(path, content) {
  return `cat > "${path}" <<'__SIMPLEUI_FILE__'\n${content}\n__SIMPLEUI_FILE__\n`;
}

function agentPython() {
  return String.raw`#!/usr/bin/env python3
import json
import os
import socket
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = "/opt/simpleui-hook"
HOOK_DIR = os.path.join(ROOT, "hooks")
TOKEN = os.environ.get("SIMPLEUI_HOOK_TOKEN", "")
PORT = int(os.environ.get("SIMPLEUI_HOOK_PORT", "37877"))
BIND = os.environ.get("SIMPLEUI_HOOK_BIND", "0.0.0.0")
ALLOWED = {
    "deploy": {"hysteria2": "hysteria2-deploy.sh", "trojan": "trojan-deploy.sh"},
    "server-status": "server-status.sh",
    "server-reboot": "server-reboot.sh",
    "status": "status.sh",
    "service": "service.sh",
    "ban": "ban.sh",
    "optimize": "optimize.sh",
    "ipquality": "ipquality.sh",
    "node-delete": "uninstall.sh",
    "uninstall": "uninstall.sh",
}


def response(handler, code, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def authorized(handler):
    header = handler.headers.get("Authorization", "")
    token = handler.headers.get("X-SimpleUI-Token", "")
    if header.startswith("Bearer "):
        token = header[7:]
    return bool(TOKEN) and token == TOKEN


def parse_body(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if not length:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


def selected_hook(action, env):
    item = ALLOWED.get(action)
    if not item:
        raise ValueError("unsupported action")
    if isinstance(item, dict):
        protocol = env.get("SIMPLEUI_PROTOCOL", "")
        name = item.get(protocol)
        if not name:
            raise ValueError("unsupported protocol")
        return name
    return item


def run_hook(action, env):
    safe_env = os.environ.copy()
    for key, value in (env or {}).items():
        if key.startswith("SIMPLEUI_") and value is not None:
            safe_env[key] = str(value)

    hook_name = selected_hook(action, safe_env)
    with open(os.path.join(HOOK_DIR, "common.sh"), "r", encoding="utf-8") as handle:
        common = handle.read()
    with open(os.path.join(HOOK_DIR, hook_name), "r", encoding="utf-8") as handle:
        script = handle.read()

    proc = subprocess.run(
        ["bash", "-se"],
        input=common + "\n\n" + script + "\n",
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=safe_env,
        timeout=3600 if action == "optimize" else (1800 if action in ("deploy", "ipquality") else 180),
    )
    return {"code": proc.returncode, "output": proc.stdout}


class Handler(BaseHTTPRequestHandler):
    server_version = "SimpleUIHook/0.1"

    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        if self.path != "/health":
            response(self, 404, {"ok": False, "error": "not found"})
            return
        if not authorized(self):
            response(self, 401, {"ok": False, "error": "unauthorized"})
            return
        response(self, 200, {"ok": True})

    def do_POST(self):
        if self.path != "/run":
            response(self, 404, {"ok": False, "error": "not found"})
            return
        if not authorized(self):
            response(self, 401, {"ok": False, "error": "unauthorized"})
            return
        try:
            payload = parse_body(self)
            action = payload.get("action", "")
            env = payload.get("env", {})
            result = run_hook(action, env)
            ok = result["code"] == 0
            response(self, 200 if ok else 500, {"ok": ok, **result})
        except Exception as exc:
            response(self, 500, {"ok": False, "error": str(exc)})


class SimpleUIHTTPServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6 if ":" in BIND else socket.AF_INET

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except OSError:
                pass
        super().server_bind()


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("SIMPLEUI_HOOK_TOKEN is required")
    SimpleUIHTTPServer((BIND, PORT), Handler).serve_forever()
`;
}

export function createHookToken() {
  return randomBytes(32).toString("hex");
}

export async function buildInstallAgentScript() {
  const agent = agentPython();
  const hookScripts = [];
  for (const name of hookNames) {
    hookScripts.push({ name, content: await readHookScript(name) });
  }

  return `set -eu
HOOK_ROOT="/opt/simpleui-hook"
HOOK_DIR="$HOOK_ROOT/hooks"
ENV_FILE="/etc/simpleui-hook.env"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for SimpleUI hook agent" >&2
  exit 12
fi

install -d -m 700 "$HOOK_ROOT" "$HOOK_DIR"
${heredoc("$HOOK_ROOT/agent.py", agent)}
${hookScripts.map((item) => heredoc(`$HOOK_DIR/${item.name}`, item.content)).join("")}
chmod 700 "$HOOK_ROOT/agent.py"
chmod 700 "$HOOK_DIR"/*.sh

cat > "$ENV_FILE" <<EOF
SIMPLEUI_HOOK_TOKEN=$SIMPLEUI_HOOK_TOKEN
SIMPLEUI_HOOK_PORT=$SIMPLEUI_HOOK_PORT
SIMPLEUI_HOOK_BIND=\${SIMPLEUI_HOOK_BIND:-0.0.0.0}
EOF
chmod 600 "$ENV_FILE"

cat > /etc/systemd/system/simpleui-hook.service <<'EOF'
[Unit]
Description=SimpleUI persistent hook agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/simpleui-hook.env
ExecStart=/usr/bin/env python3 /opt/simpleui-hook/agent.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable simpleui-hook.service
systemctl restart simpleui-hook.service
systemctl is-active --quiet simpleui-hook.service
printf '__SIMPLEUI_RESULT__{"ok":true,"service":"simpleui-hook.service","port":%s}\\n' "$SIMPLEUI_HOOK_PORT"
`;
}

export async function installHookAgent({ server, credential, token, hookPort, onLog }) {
  const script = await buildInstallAgentScript();
  const cleanHost = String(server.host || "").replace(/^\[|\]$/g, "");
  const hookBind = isIP(cleanHost) === 6 ? "::" : "0.0.0.0";
  return runSshScript({
    credential: { ...credential, host: server.host, port: server.port || 22 },
    env: {
      SIMPLEUI_HOOK_TOKEN: token,
      SIMPLEUI_HOOK_PORT: hookPort || DEFAULT_HOOK_PORT,
      SIMPLEUI_HOOK_BIND: hookBind
    },
    script,
    onLog,
    timeoutMs: 120_000
  });
}

export async function callHookAgent({ server, action, env, timeoutMs = 180_000 }) {
  if (!server.hookUrl || !server.hookToken) {
    throw new Error("Server hook is not installed");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${server.hookUrl.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${server.hookToken}`
      },
      body: JSON.stringify({ action, env }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || payload.output || `Hook agent returned ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHookHealth(server, timeoutMs = 8000) {
  if (!server.hookUrl || !server.hookToken) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${server.hookUrl.replace(/\/$/, "")}/health`, {
      headers: { Authorization: `Bearer ${server.hookToken}` },
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
