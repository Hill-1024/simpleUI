#!/usr/bin/env python3
import json
import os
import pathlib
import shutil
import subprocess
import tempfile


def log(message):
    print(f"[simpleui] {message}", flush=True)


def command_exists(name):
    return shutil.which(name) is not None


def run(args, check=True, cwd=None, env=None, input_text=None, stdout=None, stderr=None):
    if stderr is None:
        stderr = subprocess.STDOUT
    return subprocess.run(
        [str(item) for item in args],
        check=check,
        cwd=cwd,
        env=env,
        input=input_text,
        text=True,
        stdout=stdout,
        stderr=stderr,
    )


def capture(args, check=False, cwd=None, env=None):
    try:
        result = subprocess.run(
            [str(item) for item in args],
            check=check,
            cwd=cwd,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        return result.stdout
    except OSError:
        return ""


def need_root():
    if os.geteuid() != 0:
        log("This hook must run as root or a sudo-capable root SSH account.")
        raise SystemExit(20)


def pkg_install(*packages):
    packages = [item for item in packages if item]
    if not packages:
        return
    if command_exists("apt-get"):
        env = os.environ.copy()
        env["DEBIAN_FRONTEND"] = "noninteractive"
        run(["apt-get", "update", "-y"], env=env)
        run(["apt-get", "install", "-y", *packages], env=env)
    elif command_exists("dnf"):
        run(["dnf", "install", "-y", *packages])
    elif command_exists("yum"):
        run(["yum", "install", "-y", *packages])
    else:
        log("No supported package manager found.")
        raise SystemExit(21)


def ensure_base_tools():
    missing = [name for name in ["curl", "bash", "systemctl", "ss", "python3"] if not command_exists(name)]
    if missing:
        log(f"Installing base tools: {' '.join(missing)}")
        try:
            pkg_install("curl", "bash", "procps", "iproute2", "ca-certificates", "python3")
        except SystemExit:
            raise
        except Exception as exc:
            log(f"Base tool installation failed: {exc}")


def bootstrap():
    need_root()
    ensure_base_tools()


def ensure_tool(binary, package=None):
    if command_exists(binary):
        return
    pkg = package or binary
    log(f"Installing dependency: {pkg}")
    pkg_install(pkg)


def mkdir(path, mode=None):
    pathlib.Path(path).mkdir(parents=True, exist_ok=True)
    if mode is not None:
        os.chmod(path, mode)


def write_text(path, text, mode=None):
    target = pathlib.Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    if mode is not None:
        os.chmod(target, mode)


def read_text(path, default=""):
    try:
        return pathlib.Path(path).read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return default


def read_json(path, default=None):
    try:
        return json.loads(read_text(path))
    except Exception:
        return default


def atomic_write(path, text, mode=0o600):
    target = pathlib.Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{target.name}.", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            if not text.endswith("\n"):
                handle.write("\n")
        os.chmod(tmp, mode)
        os.replace(tmp, target)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def mark_protocol(protocol):
    target = pathlib.Path("/etc/simpleui/managed-protocols")
    target.parent.mkdir(parents=True, exist_ok=True)
    existing = set()
    if target.exists():
        existing = {line.strip() for line in target.read_text(encoding="utf-8", errors="ignore").splitlines() if line.strip()}
    if protocol not in existing:
        with target.open("a", encoding="utf-8") as handle:
            handle.write(f"{protocol}\n")
    os.chmod(target, 0o600)


def write_kv_users(target):
    lines = [item for item in os.environ.get("SIMPLEUI_USERS", "").split("|") if item]
    write_text(target, "".join(f"{line}\n" for line in lines), 0o600)
    return lines


def first_password_from_users(target):
    for raw in read_text(target).splitlines():
        if ":" not in raw:
            continue
        _, password = raw.split(":", 1)
        password = password.strip()
        if password:
            return password
    return ""


def is_true(value):
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def env(name, default=""):
    value = os.environ.get(name)
    return default if value is None or value == "" else value


def need_port(label, value):
    try:
        port = int(str(value))
    except (TypeError, ValueError):
        log(f"{label} must be a number")
        raise SystemExit(31)
    if port < 1 or port > 65535:
        log(f"{label} must be between 1 and 65535")
        raise SystemExit(31)
    return port


def yaml_value(value):
    text = str(value)
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~:/@%+=,-")
    if text and all(char in allowed for char in text):
        return text
    return "'" + text.replace("'", "''") + "'"


def chmod(path, mode):
    try:
        os.chmod(path, mode)
    except OSError:
        pass


def copy_if_missing(src, dst):
    source = pathlib.Path(src)
    target = pathlib.Path(dst)
    if source.exists() and not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def download(url, target, retry=0):
    args = ["curl", "-fsSL"]
    if retry:
        args.extend(["--retry", str(retry)])
    args.extend(["-o", target, url])
    run(args)


def curl_text(url, family=None):
    args = ["curl"]
    if family:
        args.append(f"-{family}")
    args.extend(["-fsSL", url])
    return capture(args).strip()


def emit(marker, payload):
    print(marker + json.dumps(payload, ensure_ascii=False), flush=True)


def default_proto_for_protocol(protocol):
    if protocol in {"hysteria2", "hysteria", "tuic", "wireguard"}:
        return "udp"
    if protocol in {"shadowsocks", "naive"}:
        return "tcp,udp"
    return "tcp"


def normalize_service_protocols(raw, protocol=""):
    value = raw or default_proto_for_protocol(protocol)
    output = []
    for part in str(value).replace("/", ",").replace(" ", ",").split(","):
        if part in {"tcp", "udp"} and part not in output:
            output.append(part)
    return ",".join(output) if output else "tcp"


def read_env_file(path):
    values = {}
    for line in read_text(path).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if key.startswith("SIMPLEUI_"):
            values[key] = value
    return values


def systemctl(*args, check=False):
    return run(["systemctl", *args], check=check, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def service_state(name):
    if not name:
        return "unknown"
    try:
        return capture(["systemctl", "is-active", name]).strip() or "unknown"
    except Exception:
        return "unknown"


def save_firewall():
    if command_exists("netfilter-persistent"):
        run(["netfilter-persistent", "save"], check=False)
    elif command_exists("service") and run(["service", "iptables", "status"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        run(["service", "iptables", "save"], check=False)


def rm_rf(path):
    target = pathlib.Path(path)
    try:
        if target.is_dir() and not target.is_symlink():
            shutil.rmtree(target)
        else:
            target.unlink(missing_ok=True)
    except OSError:
        pass


def rm_f(*paths):
    for path in paths:
        try:
            pathlib.Path(path).unlink(missing_ok=True)
        except OSError:
            pass


def rmdir(path):
    try:
        pathlib.Path(path).rmdir()
    except OSError:
        pass


def int_or_none(value, minimum=1, maximum=65535):
    try:
        number = int(str(value or "").strip())
    except Exception:
        return None
    return number if minimum <= number <= maximum else None


def safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
