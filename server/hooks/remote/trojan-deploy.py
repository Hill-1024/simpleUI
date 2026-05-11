#!/usr/bin/env python3
import json
import os
import pathlib
import shutil
import subprocess
from urllib.parse import quote

import common


WORKDIR = pathlib.Path("/opt/simpleui/upstream/trojan")
CERT_DIR = pathlib.Path("/usr/src/trojan-cert")
CONFIG_PATH = pathlib.Path("/usr/src/trojan/server.conf")


def service_exists(name):
    output = common.capture(["systemctl", "list-unit-files"])
    return any(line.split(None, 1)[0] == name for line in output.splitlines() if line.strip())


def initial_managed_env(domain, installed_service, had_nginx, had_acme):
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
SIMPLEUI_CERT_DIR=/usr/src/trojan-cert
SIMPLEUI_PARTIAL=1
""",
        0o600,
    )


def disable_selinux_for_acme():
    config = pathlib.Path("/etc/selinux/config")
    if not config.exists():
        return
    text = common.read_text(config)
    lines = text.splitlines()
    changed = False
    next_lines = []
    for line in lines:
        if line.startswith("SELINUX=") and line.strip() in {"SELINUX=enforcing", "SELINUX=permissive"}:
            next_lines.append("SELINUX=disabled")
            changed = True
        else:
            next_lines.append(line)
    if changed:
        common.log("Disabling SELinux mode for ACME standalone parity with upstream script")
        common.write_text(config, "\n".join(next_lines) + "\n")
        common.run(["setenforce", "0"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def install_trojan_packages():
    common.log("Installing Trojan upstream dependencies")
    if common.command_exists("apt-get"):
        common.pkg_install("net-tools", "socat", "nginx", "wget", "unzip", "zip", "curl", "tar", "xz-utils", "ca-certificates")
    else:
        common.pkg_install("net-tools", "socat", "nginx", "wget", "unzip", "zip", "curl", "tar", "xz", "ca-certificates")


def port_listener(port):
    output = common.capture(["ss", "-Htlpn"])
    suffix = f":{port}"
    for line in output.splitlines():
        fields = line.split()
        if len(fields) >= 4 and fields[3].endswith(suffix):
            return line
    return ""


def ensure_port_free(port):
    owner = port_listener(port)
    if owner:
        common.log(f"Port {port} is occupied: {owner}")
        raise SystemExit(31)


def public_ipv4():
    return common.curl_text("https://ipv4.icanhazip.com", family=4).strip()


def public_ipv6():
    return common.curl_text("https://ifconfig.me", family=6).strip()


def domain_ips(domain, family):
    tool = "ahostsv4" if family == 4 else "ahostsv6"
    output = common.capture(["getent", tool, domain])
    ips = sorted({line.split()[0] for line in output.splitlines() if line.split()})
    return ips


def verify_domain_points_here(domain):
    local_v4 = public_ipv4()
    local_v6 = public_ipv6()
    ips_v4 = domain_ips(domain, 4)
    ips_v6 = domain_ips(domain, 6)
    if local_v6 and local_v6 in ips_v6:
        common.log(f"Domain {domain} AAAA record resolves to this VPS ({local_v6})")
        return "ipv6", "::"
    if local_v4 and local_v4 in ips_v4:
        common.log(f"Domain {domain} A record resolves to this VPS ({local_v4})")
        return "ipv4", "0.0.0.0"
    common.log(
        f"Domain {domain} does not resolve to this VPS. "
        f"A=[{' '.join(ips_v4)}] AAAA=[{' '.join(ips_v6)}] "
        f"localIPv4={local_v4 or 'none'} localIPv6={local_v6 or 'none'}"
    )
    raise SystemExit(32)


def clear_directory(path):
    target = pathlib.Path(path)
    target.mkdir(parents=True, exist_ok=True)
    for item in target.iterdir():
        if item.is_dir() and not item.is_symlink():
            shutil.rmtree(item)
        else:
            item.unlink(missing_ok=True)


def prepare_nginx_site(domain, had_nginx):
    common.log("Preparing nginx masquerade site used by upstream Trojan flow")
    if had_nginx == "1":
        common.copy_if_missing("/etc/nginx/nginx.conf", "/etc/simpleui/trojan/original-nginx.conf")

    common.write_text(
        "/etc/nginx/nginx.conf",
        f"""user  root;
worker_processes  1;
error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;
events {{
    worker_connections  1024;
}}
http {{
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';
    access_log  /var/log/nginx/access.log  main;
    sendfile        on;
    keepalive_timeout  120;
    client_max_body_size 20m;
    server {{
        listen       80;
        listen       [::]:80;
        server_name  {domain};
        root /usr/share/nginx/html;
        index index.php index.html index.htm;
    }}
}}
""",
    )

    clear_directory("/usr/share/nginx/html")
    try:
        common.download("https://github.com/xyz690/Trojan/raw/master/web.zip", "/tmp/simpleui-trojan-web.zip", retry=2)
        common.run(["unzip", "-oq", "/tmp/simpleui-trojan-web.zip", "-d", "/usr/share/nginx/html"], check=False)
    except subprocess.CalledProcessError:
        pass
    pathlib.Path("/tmp/simpleui-trojan-web.zip").unlink(missing_ok=True)
    index = pathlib.Path("/usr/share/nginx/html/index.html")
    if not index.exists():
        common.write_text(index, f'<!doctype html><html><head><meta charset="utf-8"><title>{domain}</title></head><body></body></html>\n')


def issue_trojan_certificate(domain, resolve_family):
    home_dir = os.environ.get("HOME", "/root")
    acme = pathlib.Path(home_dir) / ".acme.sh" / "acme.sh"
    email = common.env("SIMPLEUI_ACME_EMAIL")

    common.log("Applying Trojan certificate with acme.sh standalone HTTP challenge")
    common.run(["systemctl", "stop", "trojan.service"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    common.run(["systemctl", "stop", "trojan"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    common.run(["systemctl", "stop", "nginx"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ensure_port_free(80)

    if not os.access(acme, os.X_OK):
        installer = WORKDIR / "acme-install.sh"
        common.download("https://get.acme.sh", str(installer))
        env = os.environ.copy()
        env["HOME"] = home_dir
        common.run(["sh", str(installer)], env=env)
    if not os.access(acme, os.X_OK):
        common.log("acme.sh installation failed")
        raise SystemExit(33)

    env = os.environ.copy()
    env["HOME"] = home_dir
    common.run([str(acme), "--set-default-ca", "--server", "letsencrypt"], env=env)
    if email:
        common.run([str(acme), "--register-account", "-m", email, "--server", "letsencrypt"], env=env, check=False)

    listen_args = []
    if resolve_family == "ipv6":
        listen_args = ["--listen-v6"]
    elif resolve_family == "ipv4":
        listen_args = ["--listen-v4"]
    issue = common.run([str(acme), "--issue", "-d", domain, "--standalone", *listen_args], env=env, check=False)
    if issue.returncode != 0:
        common.log(f"acme.sh issue exited with {issue.returncode}; trying to install any existing certificate for {domain}")

    common.run([
        str(acme),
        "--installcert",
        "-d",
        domain,
        "--key-file",
        "/usr/src/trojan-cert/private.key",
        "--fullchain-file",
        "/usr/src/trojan-cert/fullchain.cer",
    ], env=env)

    cert_path = pathlib.Path("/usr/src/trojan-cert/fullchain.cer")
    key_path = pathlib.Path("/usr/src/trojan-cert/private.key")
    if not cert_path.exists() or not key_path.exists() or not cert_path.stat().st_size or not key_path.stat().st_size:
        common.log("Trojan certificate files were not created")
        raise SystemExit(33)
    common.chmod("/usr/src/trojan-cert/private.key", 0o600)
    common.chmod("/usr/src/trojan-cert/fullchain.cer", 0o644)


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


def write_trojan_config(domain, local_addr):
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
    common.write_text(CONFIG_PATH, json.dumps(config, indent=4) + "\n")
    common.write_text("/etc/simpleui/trojan/users.json", json.dumps(users, indent=2) + "\n", 0o600)
    links = [{
        "username": selected_username or "default",
        "uri": f"trojan://{quote(selected_password, safe='')}@{domain}:443?security=tls&type=tcp&headerType=none#Trojan",
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
PIDFile=/usr/src/trojan/trojan/trojan.pid
ExecStart=/usr/src/trojan/trojan -c /usr/src/trojan/server.conf
ExecReload=
ExecStop=/usr/src/trojan/trojan
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
SIMPLEUI_CERT_DIR=/usr/src/trojan-cert
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
    common.mkdir(CERT_DIR)
    common.mark_protocol("trojan")

    common.download("https://raw.githubusercontent.com/xyz690/Trojan/master/trojan_install.sh", str(WORKDIR / "trojan_install.sh"))
    common.chmod(WORKDIR / "trojan_install.sh", 0o700)

    had_nginx = "1" if common.command_exists("nginx") else "0"
    had_acme = "1" if os.access("/root/.acme.sh/acme.sh", os.X_OK) else "0"
    installed_service = "0" if service_exists("trojan.service") else "1"
    initial_managed_env(domain, installed_service, had_nginx, had_acme)

    disable_selinux_for_acme()
    install_trojan_packages()
    resolve_family, local_addr = verify_domain_points_here(domain)
    for service in ["trojan.service", "trojan", "nginx"]:
        common.run(["systemctl", "stop", service], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ensure_port_free(80)
    ensure_port_free(443)
    prepare_nginx_site(domain, had_nginx)
    issue_trojan_certificate(domain, resolve_family)
    install_trojan_core()
    write_trojan_config(domain, local_addr)
    write_trojan_service()
    final_managed_env(domain, installed_service, had_nginx, had_acme)

    common.run(["systemctl", "daemon-reload"])
    common.run(["systemctl", "enable", "--now", "nginx"])
    common.run(["systemctl", "restart", "nginx"])
    common.run(["systemctl", "enable", "--now", "trojan.service"])
    common.run(["systemctl", "restart", "trojan.service"])

    common.log("Trojan deployed with upstream acme.sh certificate automation and SimpleUI user list")
    common.emit("__SIMPLEUI_RESULT__", {
        "protocol": "trojan",
        "service": "trojan.service",
        "domain": domain,
        "port": 443,
        "cert": "/usr/src/trojan-cert/fullchain.cer",
    })


if __name__ == "__main__":
    main()
