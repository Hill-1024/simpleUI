import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { Buffer } from "node:buffer";
import { readHookScript } from "./providers.js";
import { runSshScript } from "./ssh.js";

export const DEFAULT_HOOK_PORT = 37877;
const allowedLegacyActions = new Set(["upgrade-agent"]);
const activeHookControllers = new Set();
const activeHookRequests = new Set();

const hookNames = [
  "common.sh",
  "hysteria2-deploy.sh",
  "trojan-deploy.sh",
  "server-status.sh",
  "server-reboot.sh",
  "status.sh",
  "service.sh",
  "exec.sh",
  "agent-upgrade.sh",
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
import hmac
import hashlib
import json
import os
import ssl
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = "/opt/simpleui-hook"
HOOK_DIR = os.path.join(ROOT, "hooks")
TOKEN = os.environ.get("SIMPLEUI_HOOK_TOKEN", "")
PORT = int(os.environ.get("SIMPLEUI_HOOK_PORT", "37877"))
BIND = os.environ.get("SIMPLEUI_HOOK_BIND", "0.0.0.0")
TLS_CERT = os.environ.get("SIMPLEUI_HOOK_TLS_CERT", os.path.join(ROOT, "tls.crt"))
TLS_KEY = os.environ.get("SIMPLEUI_HOOK_TLS_KEY", os.path.join(ROOT, "tls.key"))
CERT_FINGERPRINT = os.environ.get("SIMPLEUI_HOOK_CERT_FINGERPRINT", "")
MAX_BODY_BYTES = 4 * 1024 * 1024
CACHEABLE_ACTION_TTL = {
    "server-status": 8,
    "status": 8,
}
RUN_CACHE = {}
RUNNING = {}
RUN_LOCK = threading.Lock()
ALLOWED = {
    "deploy": {"hysteria2": "hysteria2-deploy.sh", "trojan": "trojan-deploy.sh"},
    "server-status": "server-status.sh",
    "server-reboot": "server-reboot.sh",
    "status": "status.sh",
    "service": "service.sh",
    "exec": "exec.sh",
    "upgrade-agent": "agent-upgrade.sh",
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
    return bool(TOKEN) and hmac.compare_digest(token, TOKEN)


def parse_body(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if not length:
        return {}
    if length > MAX_BODY_BYTES:
        raise ValueError("request body too large")
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


def run_hook(action, env, payload=None):
    if not isinstance(env, dict):
        raise ValueError("env must be an object")
    if payload is not None and not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    safe_env = os.environ.copy()
    for key, value in (env or {}).items():
        if isinstance(key, str) and key.startswith("SIMPLEUI_") and value is not None:
            safe_env[key] = str(value)

    temp_paths = []
    try:
        if action == "upgrade-agent" and payload:
            bundle_b64 = payload.get("bundleB64")
            if bundle_b64:
                fd, path = tempfile.mkstemp(prefix="simpleui-upgrade-", suffix=".b64")
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    handle.write(str(bundle_b64))
                os.chmod(path, 0o600)
                safe_env["SIMPLEUI_UPGRADE_BUNDLE_FILE"] = path
                temp_paths.append(path)

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
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass


def cache_key(action, env):
    raw = json.dumps({"action": action, "env": env or {}}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def run_hook_coalesced(action, env, payload=None):
    ttl = CACHEABLE_ACTION_TTL.get(action)
    if not ttl or payload:
        return run_hook(action, env, payload)

    key = cache_key(action, env)
    now = time.monotonic()
    with RUN_LOCK:
        cached = RUN_CACHE.get(key)
        if cached and cached["expiresAt"] > now:
            return dict(cached["result"])
        event = RUNNING.get(key)
        if not event:
            event = threading.Event()
            RUNNING[key] = event
            owner = True
        else:
            owner = False

    if not owner:
        event.wait(timeout=ttl + 180)
        with RUN_LOCK:
            cached = RUN_CACHE.get(key)
            if cached and cached["expiresAt"] > time.monotonic():
                return dict(cached["result"])
        return run_hook(action, env, payload)

    try:
        result = run_hook(action, env, payload)
        if result.get("code") == 0:
            with RUN_LOCK:
                RUN_CACHE[key] = {"expiresAt": time.monotonic() + ttl, "result": dict(result)}
        return result
    finally:
        with RUN_LOCK:
            RUNNING.pop(key, None)
            event.set()


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
        response(self, 200, {"ok": True, "tls": True, "fingerprint": CERT_FINGERPRINT})

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
            extra_payload = payload.get("payload", {})
            result = run_hook_coalesced(action, env, extra_payload)
            ok = result["code"] == 0
            response(self, 200 if ok else 500, {"ok": ok, **result})
        except Exception as exc:
            response(self, 500, {"ok": False, "error": str(exc)})


class SimpleUIHTTPServer(ThreadingHTTPServer):
    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            try:
                self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            except OSError:
                pass
        super().server_bind()


def make_server(bind):
    family = socket.AF_INET6 if ":" in bind else socket.AF_INET
    server_cls = type("SimpleUIBoundHTTPServer", (SimpleUIHTTPServer,), {"address_family": family})
    return server_cls((bind, PORT), Handler)


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("SIMPLEUI_HOOK_TOKEN is required")
    if not os.path.exists(TLS_CERT) or not os.path.exists(TLS_KEY):
        raise SystemExit("SimpleUI hook TLS certificate is missing")
    try:
        httpd = make_server(BIND)
    except OSError:
        if BIND == "::":
            httpd = make_server("0.0.0.0")
        else:
            raise
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(TLS_CERT, TLS_KEY)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    httpd.serve_forever()
`;
}

export function createHookToken() {
  return randomBytes(32).toString("hex");
}

export async function buildHookUpgradeBundleB64() {
  const hooks = [];
  for (const name of hookNames) {
    hooks.push({ name, content: await readHookScript(name) });
  }
  return Buffer.from(JSON.stringify({
    agent: agentPython(),
    hooks
  }), "utf8").toString("base64");
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
TLS_CERT="$HOOK_ROOT/tls.crt"
TLS_KEY="$HOOK_ROOT/tls.key"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for SimpleUI hook agent" >&2
  exit 12
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required for SimpleUI hook TLS" >&2
  exit 13
fi

install -d -m 700 "$HOOK_ROOT" "$HOOK_DIR"
${heredoc("$HOOK_ROOT/agent.py", agent)}
${hookScripts.map((item) => heredoc(`$HOOK_DIR/${item.name}`, item.content)).join("")}
chmod 700 "$HOOK_ROOT/agent.py"
chmod 700 "$HOOK_DIR"/*.sh

if [ ! -s "$TLS_CERT" ] || [ ! -s "$TLS_KEY" ]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
    -keyout "$TLS_KEY" \
    -out "$TLS_CERT" \
    -days 3650 \
    -subj "/CN=simpleui-hook" >/dev/null 2>&1
fi
chmod 600 "$TLS_CERT" "$TLS_KEY"
cert_fingerprint="$(openssl x509 -in "$TLS_CERT" -noout -fingerprint -sha256 | awk -F= '{print $2}' | tr -d ':')"

existing_hook_token=""
if [ -f "$ENV_FILE" ]; then
  existing_hook_token="$(
    awk '
      /^SIMPLEUI_HOOK_TOKEN=/ {
        value = substr($0, index($0, "=") + 1)
        if (value != "") print value
      }
    ' "$ENV_FILE" | awk 'NF { print; exit }'
  )"
fi
hook_token="\${existing_hook_token:-$SIMPLEUI_HOOK_TOKEN}"

cat > "$ENV_FILE" <<EOF
SIMPLEUI_HOOK_TOKEN=$hook_token
SIMPLEUI_HOOK_PORT=$SIMPLEUI_HOOK_PORT
SIMPLEUI_HOOK_BIND=\${SIMPLEUI_HOOK_BIND:-::}
SIMPLEUI_HOOK_TLS_CERT=$TLS_CERT
SIMPLEUI_HOOK_TLS_KEY=$TLS_KEY
SIMPLEUI_HOOK_CERT_FINGERPRINT=$cert_fingerprint
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
printf '__SIMPLEUI_SECRET_RESULT__{"hookToken":"%s"}\\n' "$hook_token"
printf '__SIMPLEUI_RESULT__{"ok":true,"service":"simpleui-hook.service","port":%s,"tls":true,"fingerprint":"%s","tokenReused":%s}\\n' "$SIMPLEUI_HOOK_PORT" "$cert_fingerprint" "$([ -n "$existing_hook_token" ] && printf true || printf false)"
`;
}

export async function installHookAgent({ server, credential, token, hookPort, onLog }) {
  const script = await buildInstallAgentScript();
  return runSshScript({
    credential: { ...credential, host: server.host, port: server.port || 22 },
    env: {
      SIMPLEUI_HOOK_TOKEN: token,
      SIMPLEUI_HOOK_PORT: hookPort || DEFAULT_HOOK_PORT,
      SIMPLEUI_HOOK_BIND: "::"
    },
    script,
    onLog,
    timeoutMs: 120_000
  });
}

export function normalizeHookFingerprint(value = "") {
  return String(value || "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

export function hookFingerprintMatches(expected, actual) {
  const cleanExpected = normalizeHookFingerprint(expected);
  const cleanActual = normalizeHookFingerprint(actual);
  return Boolean(cleanExpected && cleanActual && cleanExpected === cleanActual);
}

export function isHookFingerprintMismatch(error) {
  return error?.code === "HOOK_TLS_FINGERPRINT_MISMATCH";
}

export function isLegacyHookTransport(server = {}) {
  if (!server.hookUrl) return false;
  try {
    const parsed = new URL(server.hookUrl);
    return parsed.protocol !== "https:" || !server.hookCertFingerprint;
  } catch {
    return true;
  }
}

export function isLegacyHookActionAllowed(action) {
  return allowedLegacyActions.has(action);
}

function ensureSecureHookAction(server, action) {
  if (!isLegacyHookTransport(server)) return;
  if (isLegacyHookActionAllowed(action)) return;
  throw new Error("Hook agent uses legacy HTTP transport. Upgrade or reinstall the hook before running remote actions.");
}

function fingerprintFromCertificate(cert) {
  if (!cert?.raw) return "";
  return createHash("sha256").update(cert.raw).digest("hex");
}

function hookFingerprintMismatchError(expected, actual) {
  const error = new Error("Hook TLS certificate fingerprint mismatch");
  error.code = "HOOK_TLS_FINGERPRINT_MISMATCH";
  error.expectedFingerprint = normalizeHookFingerprint(expected);
  error.actualFingerprint = normalizeHookFingerprint(actual);
  return error;
}

export function probeHookCertificate(hookUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const parsed = new URL(`${String(hookUrl || "").replace(/\/$/, "")}/health`);
    if (parsed.protocol !== "https:") {
      reject(new Error("Hook certificate probing requires HTTPS"));
      return;
    }
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: "GET",
      autoSelectFamily: true,
      rejectUnauthorized: false
    });
    const finish = (error, fingerprint) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeHookRequests.delete(req);
      if (error) reject(error);
      else resolve(fingerprint);
    };
    const timer = setTimeout(() => {
      req.destroy(new Error(`Hook certificate probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    activeHookRequests.add(req);
    req.on("socket", (socket) => {
      socket.once("secureConnect", () => {
        const fingerprint = fingerprintFromCertificate(socket.getPeerCertificate(true));
        finish(null, fingerprint);
        req.destroy();
      });
    });
    req.on("error", (error) => {
      if (!settled) finish(error);
    });
    req.end();
  });
}

function requestJsonWithPinnedTls({ url, token, method = "GET", body, fingerprint, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const transport = isHttps ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = {
      Authorization: `Bearer ${token}`
    };
    if (payload !== null) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = transport.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      autoSelectFamily: true,
      rejectUnauthorized: false
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        raw += chunk;
      });
      response.on("end", () => {
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, data });
      });
    });

    const timer = setTimeout(() => {
      req.destroy(new Error(`Hook request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    activeHookRequests.add(req);

    req.on("socket", (socket) => {
      if (!isHttps) return;
      socket.once("secureConnect", () => {
        const actual = fingerprintFromCertificate(socket.getPeerCertificate(true));
        if (!hookFingerprintMatches(fingerprint, actual)) {
          req.destroy(hookFingerprintMismatchError(fingerprint, actual));
          return;
        }
        req.end(payload ?? undefined);
      });
    });
    req.on("error", reject);
    req.on("close", () => {
      clearTimeout(timer);
      activeHookRequests.delete(req);
    });
    if (!isHttps) req.end(payload ?? undefined);
  });
}

export async function callHookAgent({ server, action, env, payload, timeoutMs = 180_000 }) {
  if (!server.hookUrl || !server.hookToken) {
    throw new Error("Server hook is not installed");
  }
  ensureSecureHookAction(server, action);
  const controller = new AbortController();
  activeHookControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { action, env };
    if (payload !== undefined) body.payload = payload;
    const runUrl = `${server.hookUrl.replace(/\/$/, "")}/run`;
    const parsed = new URL(runUrl);
    let response;
    if (parsed.protocol === "https:") {
      response = await requestJsonWithPinnedTls({
        url: runUrl,
        token: server.hookToken,
        method: "POST",
        body,
        fingerprint: server.hookCertFingerprint,
        timeoutMs
      });
    } else {
      const legacyResponse = await fetch(runUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${server.hookToken}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      response = {
        ok: legacyResponse.ok,
        status: legacyResponse.status,
        data: await legacyResponse.json().catch(() => ({}))
      };
    }
    if (!response.ok || response.data.ok === false) {
      throw new Error(response.data.error || response.data.output || `Hook agent returned ${response.status}`);
    }
    return response.data;
  } finally {
    clearTimeout(timer);
    activeHookControllers.delete(controller);
  }
}

export async function checkHookHealth(server, timeoutMs = 8000) {
  if (!server.hookUrl || !server.hookToken) return false;
  const controller = new AbortController();
  activeHookControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const healthUrl = `${server.hookUrl.replace(/\/$/, "")}/health`;
    const parsed = new URL(healthUrl);
    if (parsed.protocol === "https:") {
      const response = await requestJsonWithPinnedTls({
        url: healthUrl,
        token: server.hookToken,
        fingerprint: server.hookCertFingerprint,
        timeoutMs
      });
      return response.ok;
    }
    const response = await fetch(healthUrl, {
      headers: { Authorization: `Bearer ${server.hookToken}` },
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    activeHookControllers.delete(controller);
  }
}

export function abortHookRequests() {
  for (const controller of activeHookControllers) {
    controller.abort();
  }
  activeHookControllers.clear();
  for (const request of activeHookRequests) {
    request.destroy(new Error("Server is shutting down"));
  }
  activeHookRequests.clear();
}
