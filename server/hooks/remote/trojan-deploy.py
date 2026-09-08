#!/usr/bin/env python3
import json
import os
import pathlib
from urllib.parse import quote

import common
import certificates


WORKDIR = pathlib.Path("/opt/simpleui/upstream/trojan")
CERT_DIR = certificates.ROOT / "current"
CONFIG_PATH = pathlib.Path("/usr/src/trojan/server.conf")


def service_exists(name):
    output = common.capture(["systemctl", "list-unit-files"])
    return any(line.split(None, 1)[0] == name for line in output.splitlines() if line.strip())


def latest_trojan_version():
    raw = common.curl_text("https://api.github.com/repos/trojan-gfw/trojan/releases/latest")
    try:
        return json.loads(raw)["tag_name"].lstrip("v")
    except (KeyError, json.JSONDecodeError):
        common.log("Unable to read latest Trojan release version from GitHub")
        raise SystemExit(34)


def install_trojan_core():
    if os.access("/usr/src/trojan/trojan", os.X_OK):
        common.log("Trojan core already present")
        return

    common.log("Installing latest trojan-gfw release")
    common.ensure_tool("xz", "xz-utils" if common.command_exists("apt-get") else "xz")
    common.mkdir("/usr/src")
    version = latest_trojan_version()
    archive = pathlib.Path("/usr/src") / f"trojan-{version}-linux-amd64.tar.xz"
    common.download(
        f"https://github.com/trojan-gfw/trojan/releases/download/v{version}/trojan-{version}-linux-amd64.tar.xz",
        str(archive),
        retry=2,
    )
    common.run(["tar", "xf", str(archive)], cwd="/usr/src")
    archive.unlink(missing_ok=True)
    common.chmod("/usr/src/trojan/trojan", 0o755)


def write_trojan_config(domain, local_addr, certificate):
    if not common.read_env_file("/etc/simpleui/trojan/managed.env"):
        common.copy_if_missing(CONFIG_PATH, "/etc/simpleui/trojan/original-config.json")
    users_path = pathlib.Path("/etc/simpleui/trojan/users.kv")
    common.write_kv_users(users_path)

    users = {}
    selected_username = ""
    selected_password = ""
    for raw in common.read_text(users_path).splitlines():
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
            "cert": certificates.paths(certificate)[0],
            "key": certificates.paths(certificate)[1],
            "key_password": "",
            "cipher_tls13": "TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384",
            "prefer_server_cipher": True,
            "alpn": ["http/1.1"],
            "reuse_session": True,
            "session_ticket": False,
            "session_timeout": 600,
            "plain_http_response": "",
            "curves": "",
            "dhparam": "",
        },
        "tcp": {
            "no_delay": True,
            "keep_alive": True,
            "fast_open": False,
            "fast_open_qlen": 20,
        },
        "mysql": {
            "enabled": False,
            "server_addr": "127.0.0.1",
            "server_port": 3306,
            "database": "trojan",
            "username": "trojan",
            "password": "",
        },
    }
    common.atomic_write(CONFIG_PATH, json.dumps(config, indent=4) + "\n")
    common.write_text("/etc/simpleui/trojan/users.json", json.dumps(users, indent=2) + "\n", 0o600)
    query = f"security=tls&type=tcp&headerType=none&sni={quote(certificate['sni'], safe='')}"
    if certificate.get("insecure"):
        query += "&allowInsecure=1"
    endpoint = f"[{domain}]" if ":" in domain and not domain.startswith("[") else domain
    links = [{
        "username": selected_username or "default",
        "uri": f"trojan://{quote(selected_password, safe='')}@{endpoint}:443?{query}#Trojan",
    }]
    common.write_text("/etc/simpleui/trojan/share-links.json", json.dumps(links, indent=2, ensure_ascii=False) + "\n", 0o600)
    common.chmod(users_path, 0o600)


def write_trojan_service():
    common.write_text(
        "/etc/systemd/system/trojan.service",
        """[Unit]
Description=trojan
After=network.target

[Service]
Type=simple
ExecStart=/usr/src/trojan/trojan -c /usr/src/trojan/server.conf
Restart=on-failure
RestartSec=3s
PrivateTmp=true

[Install]
WantedBy=multi-user.target
""",
        0o644,
    )


def final_managed_env(domain, installed_service, had_nginx, had_acme):
    common.write_text(
        "/etc/simpleui/trojan/managed.env",
        f"""SIMPLEUI_PROTOCOL=trojan
SIMPLEUI_SERVICE=trojan.service
SIMPLEUI_CONFIG=/usr/src/trojan/server.conf
SIMPLEUI_DOMAIN={domain}
SIMPLEUI_PORT=443
SIMPLEUI_INSTALLED_SERVICE={installed_service}
SIMPLEUI_HAD_NGINX={had_nginx}
SIMPLEUI_HAD_ACME={had_acme}
SIMPLEUI_CERT_DIR={CERT_DIR}
""",
        0o600,
    )


def main():
    common.bootstrap()
    common.log("Preparing Trojan upstream installer flow")

    domain = common.env("SIMPLEUI_DOMAIN").strip().lower()
    if not domain:
        common.log("Trojan deployment requires SIMPLEUI_DOMAIN.")
        raise SystemExit(30)

    common.mkdir(WORKDIR)
    common.mkdir("/etc/simpleui/trojan")
    common.mark_protocol("trojan")

    previous = common.read_env_file("/etc/simpleui/trojan/managed.env")
    had_nginx = previous.get("SIMPLEUI_HAD_NGINX", "1" if common.command_exists("nginx") else "0")
    had_acme = previous.get("SIMPLEUI_HAD_ACME", "1" if certificates.ACME.exists() else "0")
    installed_service = previous.get("SIMPLEUI_INSTALLED_SERVICE", "0" if service_exists("trojan.service") else "1")
    if not previous:
        common.copy_if_missing(CONFIG_PATH, "/etc/simpleui/trojan/original-config.json")
    mode = common.env("SIMPLEUI_TLS_MODE", "acme-http")
    # Reuse/migrate the peer before changing Trojan's configuration or service.
    certificate = certificates.ensure_certificate("trojan", mode, domain)
    certificates.prepare_http(certificate["sni"] if ":" not in certificate["sni"] else "localhost")
    local_addr = "::" if pathlib.Path("/proc/net/if_inet6").exists() else "0.0.0.0"
    install_trojan_core()
    write_trojan_config(domain, local_addr, certificate)
    write_trojan_service()
    common.run(["systemctl", "daemon-reload"])
    common.run(["systemctl", "enable", "trojan.service"])
    common.run(["systemctl", "restart", "trojan.service"])
    common.run(["systemctl", "is-active", "--quiet", "trojan.service"])
    final_managed_env(domain, installed_service, had_nginx, had_acme)
    saved = common.read_env_file("/etc/simpleui/trojan/managed.env")
    saved.update(certificates.certificate_env(certificate))
    common.atomic_write("/etc/simpleui/trojan/managed.env", "".join(f"{key}={value}\n" for key, value in saved.items()))

    common.log("Trojan deployed with upstream acme.sh certificate automation and SimpleUI user list")
    common.emit("__SIMPLEUI_RESULT__", {
        "protocol": "trojan",
        "service": "trojan.service",
        "domain": domain,
        "port": 443,
        "tlsMode": "shared-cert",
        "sni": certificate["sni"],
        "insecure": certificate.get("insecure", False),
        "certPath": certificates.paths(certificate)[0],
        "keyPath": certificates.paths(certificate)[1],
        "cert": certificates.paths(certificate)[0],
    })


if __name__ == "__main__":
    with certificates.deployment_lock(), certificates.deployment_transaction("trojan"):
        main()
