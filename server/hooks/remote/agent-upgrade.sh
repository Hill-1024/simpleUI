#!/usr/bin/env bash

python3 - <<'PY'
import base64
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile

ROOT = "/opt/simpleui-hook"
HOOK_DIR = os.path.join(ROOT, "hooks")
ENV_FILE = "/etc/simpleui-hook.env"
TLS_CERT = os.path.join(ROOT, "tls.crt")
TLS_KEY = os.path.join(ROOT, "tls.key")
bundle_file = os.environ.get("SIMPLEUI_UPGRADE_BUNDLE_FILE", "")
bundle_b64 = ""
if bundle_file:
    try:
        with open(bundle_file, "r", encoding="utf-8") as handle:
            bundle_b64 = handle.read().strip()
    except OSError as exc:
        print(f"[simpleui] Unable to read hook upgrade bundle file: {exc}")
        print("__SIMPLEUI_RESULT__" + json.dumps({"ok": False, "error": "Unable to read hook upgrade bundle file"}))
        raise SystemExit(0)
if not bundle_b64:
    bundle_b64 = os.environ.get("SIMPLEUI_UPGRADE_BUNDLE_B64", "")

if not bundle_b64:
    print("[simpleui] Missing hook upgrade bundle.")
    print("__SIMPLEUI_RESULT__" + json.dumps({"ok": False, "error": "Missing hook upgrade bundle"}))
    raise SystemExit(0)

try:
    bundle = json.loads(base64.b64decode(bundle_b64).decode("utf-8"))
except Exception as exc:
    print(f"[simpleui] Invalid hook upgrade bundle: {exc}")
    print("__SIMPLEUI_RESULT__" + json.dumps({"ok": False, "error": "Invalid hook upgrade bundle"}))
    raise SystemExit(0)

agent = bundle.get("agent")
hooks = bundle.get("hooks") or []
if not isinstance(agent, str) or not agent:
    print("[simpleui] Upgrade bundle does not contain agent.py.")
    print("__SIMPLEUI_RESULT__" + json.dumps({"ok": False, "error": "Missing agent"}))
    raise SystemExit(0)
if not isinstance(hooks, list) or not hooks:
    print("[simpleui] Upgrade bundle does not contain hook scripts.")
    print("__SIMPLEUI_RESULT__" + json.dumps({"ok": False, "error": "Missing hooks"}))
    raise SystemExit(0)

os.makedirs(HOOK_DIR, mode=0o700, exist_ok=True)

def atomic_write(path, content, mode):
    directory = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(prefix=".simpleui-", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            if not content.endswith("\n"):
                handle.write("\n")
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

atomic_write(os.path.join(ROOT, "agent.py"), agent, 0o700)
written = []
for item in hooks:
    name = item.get("name") if isinstance(item, dict) else None
    content = item.get("content") if isinstance(item, dict) else None
    if not isinstance(name, str) or "/" in name or not name.endswith(".sh"):
        raise ValueError(f"invalid hook script name: {name!r}")
    if not isinstance(content, str):
        raise ValueError(f"invalid hook script content: {name}")
    atomic_write(os.path.join(HOOK_DIR, name), content, 0o700)
    written.append(name)

if not os.path.exists(TLS_CERT) or not os.path.exists(TLS_KEY):
    if not shutil.which("openssl"):
        print("[simpleui] openssl is required for SimpleUI hook TLS.")
        print("__SIMPLEUI_RESULT__" + json.dumps({"ok": False, "error": "openssl is required"}))
        raise SystemExit(0)
    subprocess.run([
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-sha256",
        "-nodes",
        "-keyout",
        TLS_KEY,
        "-out",
        TLS_CERT,
        "-days",
        "3650",
        "-subj",
        "/CN=simpleui-hook",
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
os.chmod(TLS_CERT, 0o600)
os.chmod(TLS_KEY, 0o600)
fingerprint_proc = subprocess.run(
    ["openssl", "x509", "-in", TLS_CERT, "-noout", "-fingerprint", "-sha256"],
    check=True,
    text=True,
    stdout=subprocess.PIPE,
)
fingerprint = fingerprint_proc.stdout.strip().split("=", 1)[-1].replace(":", "")

env_lines = []
try:
    with open(ENV_FILE, "r", encoding="utf-8") as handle:
        env_lines = handle.read().splitlines()
except OSError:
    pass
env_values = {}
for line in env_lines:
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        env_values[key] = value
env_values["SIMPLEUI_HOOK_TLS_CERT"] = TLS_CERT
env_values["SIMPLEUI_HOOK_TLS_KEY"] = TLS_KEY
env_values["SIMPLEUI_HOOK_CERT_FINGERPRINT"] = fingerprint
if env_values.get("SIMPLEUI_HOOK_BIND", "") in ("", "0.0.0.0"):
    env_values["SIMPLEUI_HOOK_BIND"] = "::"
atomic_write(ENV_FILE, "".join(f"{key}={value}\n" for key, value in env_values.items()), 0o600)

subprocess.run(["systemctl", "daemon-reload"], check=False)
subprocess.Popen(
    ["sh", "-c", "sleep 1; systemctl restart simpleui-hook.service >/dev/null 2>&1"],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    start_new_session=True,
)

payload = {
    "ok": True,
    "service": "simpleui-hook.service",
    "hooks": written,
    "restartScheduled": True,
    "tls": True,
    "fingerprint": fingerprint,
}
print("__SIMPLEUI_RESULT__" + json.dumps(payload, ensure_ascii=False))
PY
