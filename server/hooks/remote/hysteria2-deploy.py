#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
from urllib.parse import quote

import common


WORKDIR = pathlib.Path("/opt/simpleui/upstream/hysteria2")


def install_upstream_flow():
    common.log("Preparing Hysteria2 Python installer flow")
    common.mkdir(WORKDIR)
    common.mkdir("/etc/simpleui/hysteria2")
    common.mkdir("/etc/hysteria")
    common.mkdir("/etc/hy2config")
    common.mark_protocol("hysteria2")

    common.download("https://raw.githubusercontent.com/seagullz4/hysteria2/main/phy2.sh", str(WORKDIR / "phy2.sh"))
    common.download("https://raw.githubusercontent.com/seagullz4/hysteria2/main/hysteria2.py", str(WORKDIR / "hysteria2.py"))
    common.chmod(WORKDIR / "phy2.sh", 0o700)
    common.chmod(WORKDIR / "hysteria2.py", 0o700)

    common.log("Installing Python-flow dependencies from phy2.sh")
    common.run(["bash", "./phy2.sh"], cwd=WORKDIR)

    installed_core = "0"
    if not common.command_exists("hysteria") and not os.access("/usr/local/bin/hysteria", os.X_OK):
        common.log("Installing Hysteria2 core using the same official installer invoked by hysteria2.py")
        installed_core = "1"
        installer = WORKDIR / "get-hy2.sh"
        common.download("https://get.hy2.sh/", str(installer))
        common.chmod(installer, 0o700)
        common.run(["bash", str(installer)])
    else:
        common.log("Hysteria2 core already present")
    return installed_core


def save_hy2_iptables_rules():
    if common.command_exists("iptables-save"):
        with open("/etc/hy2config/iptables-rules.v4", "w", encoding="utf-8") as handle:
            subprocess.run(["iptables-save"], check=False, stdout=handle, stderr=subprocess.DEVNULL)
    if common.command_exists("ip6tables-save"):
        with open("/etc/hy2config/iptables-rules.v6", "w", encoding="utf-8") as handle:
            subprocess.run(["ip6tables-save"], check=False, stdout=handle, stderr=subprocess.DEVNULL)

    common.write_text(
        "/etc/hy2config/restore-iptables.py",
        """#!/usr/bin/env python3
import os
import shutil
import subprocess

if os.path.exists("/etc/hy2config/iptables-rules.v4") and shutil.which("iptables-restore"):
    with open("/etc/hy2config/iptables-rules.v4", "rb") as handle:
        subprocess.run(["iptables-restore"], stdin=handle, check=False)
if os.path.exists("/etc/hy2config/iptables-rules.v6") and shutil.which("ip6tables-restore"):
    with open("/etc/hy2config/iptables-rules.v6", "rb") as handle:
        subprocess.run(["ip6tables-restore"], stdin=handle, check=False)
""",
        0o700,
    )
    common.write_text(
        "/etc/systemd/system/hysteria-iptables.service",
        """[Unit]
Description=Restore Hysteria2 port hopping iptables rules
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env python3 -I -B /etc/hy2config/restore-iptables.py
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
""",
        0o644,
    )
    common.run(["systemctl", "daemon-reload"], check=False)
    common.run(["systemctl", "enable", "--now", "hysteria-iptables.service"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def iptables_rule(binary, iface, start_port, end_port, target_port):
    return [
        binary,
        "-t",
        "nat",
        "-C",
        "PREROUTING",
        "-i",
        iface,
        "-p",
        "udp",
        "--dport",
        f"{start_port}:{end_port}",
        "-j",
        "REDIRECT",
        "--to-ports",
        str(target_port),
    ]


def add_iptables_rule(binary, iface, start_port, end_port, target_port):
    check_args = iptables_rule(binary, iface, start_port, end_port, target_port)
    if common.run(check_args, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        return
    add_args = check_args[:]
    add_args[4] = "-A"
    common.run(add_args)


def remove_rule_script_block(binary, iface, start_port, end_port, target_port):
    return f"""
while run({[binary, "-t", "nat", "-C", "PREROUTING", "-i", iface, "-p", "udp", "--dport", f"{start_port}:{end_port}", "-j", "REDIRECT", "--to-ports", str(target_port)]!r}) == 0:
    if run({[binary, "-t", "nat", "-D", "PREROUTING", "-i", iface, "-p", "udp", "--dport", f"{start_port}:{end_port}", "-j", "REDIRECT", "--to-ports", str(target_port)]!r}) != 0:
        break
"""


def configure_port_hopping(start_port, end_port, iface, ipv6_enabled, ipv6_iface, target_port):
    start = common.need_port("Port hopping start", start_port)
    end = common.need_port("Port hopping end", end_port)
    target = common.need_port("Hysteria2 listen port", target_port)
    if start > end:
        common.log("Port hopping start must be less than or equal to end")
        raise SystemExit(31)
    if not iface:
        common.log("Port hopping interface is required")
        raise SystemExit(31)

    if os.access("/etc/hy2config/jump_port_back.py", os.X_OK):
        common.run(["python3", "-I", "-B", "/etc/hy2config/jump_port_back.py"], check=False)
    elif os.access("/etc/hy2config/jump_port_back.sh", os.X_OK):
        common.run(["/etc/hy2config/jump_port_back.sh"], check=False)

    common.log(f"Configuring IPv4 port hopping {iface}:{start}-{end} -> {target}")
    add_iptables_rule("iptables", iface, start, end, target)
    script = """#!/usr/bin/env python3
import subprocess

def run(args):
    return subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode
""" + remove_rule_script_block("iptables", iface, start, end, target)

    if common.is_true(ipv6_enabled):
        if not ipv6_iface:
            common.log("IPv6 port hopping interface is required when IPv6 hopping is enabled")
            raise SystemExit(31)
        common.log(f"Configuring IPv6 port hopping {ipv6_iface}:{start}-{end} -> {target}")
        add_iptables_rule("ip6tables", ipv6_iface, start, end, target)
        script += remove_rule_script_block("ip6tables", ipv6_iface, start, end, target)

    common.write_text("/etc/hy2config/jump_port_back.py", script, 0o700)
    common.rm_f("/etc/hy2config/jump_port_back.sh")
    save_hy2_iptables_rules()


def detect_public_host(mode):
    if mode == "ipv6":
        ip = common.curl_text("https://api.ip.sb/ip", family=6) or common.curl_text("https://ifconfig.me", family=6)
        ip = "".join(ip.split())
        return f"[{ip}]" if ip else ""

    raw = common.curl_text("http://ip-api.com/json/", family=4)
    ip = ""
    if raw:
        try:
            ip = json.loads(raw).get("query", "")
        except json.JSONDecodeError:
            ip = ""
    if not ip:
        ip = common.curl_text("https://ifconfig.me", family=4)
    return "".join(ip.split())


def tls_config(tls_mode, domain, email, connect_host):
    cert_dir = "/etc/ssl/private"
    sni = domain
    insecure = "0"

    if tls_mode == "self-signed":
        cert_name = common.env("SIMPLEUI_SELF_SIGNED_DOMAIN", "bing.com")
        sni = cert_name
        insecure = "1"
        if not connect_host:
            connect_host = detect_public_host(common.env("SIMPLEUI_SELF_SIGNED_IP_MODE", "ipv4"))
        if not connect_host:
            common.log("Self-signed mode could not detect the public connection address")
            raise SystemExit(32)
        if not domain:
            domain = connect_host
        common.log(f"Generating self-signed certificate for {cert_name}")
        common.mkdir(cert_dir, 0o755)
        common.run(["openssl", "ecparam", "-name", "prime256v1", "-out", f"{cert_dir}/ec_param.pem"])
        common.run(
            [
                "openssl",
                "req",
                "-x509",
                "-nodes",
                "-newkey",
                f"ec:{cert_dir}/ec_param.pem",
                "-keyout",
                f"{cert_dir}/{cert_name}.key",
                "-out",
                f"{cert_dir}/{cert_name}.crt",
                "-subj",
                f"/CN={cert_name}",
                "-days",
                "36500",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if common.run(["id", "hysteria"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            common.run(["chown", "root:hysteria", f"{cert_dir}/{cert_name}.key", f"{cert_dir}/{cert_name}.crt", f"{cert_dir}/ec_param.pem"], check=False)
        common.chmod(f"{cert_dir}/{cert_name}.key", 0o644)
        common.chmod(f"{cert_dir}/{cert_name}.crt", 0o644)
        block = (
            "tls:\n"
            f"  cert: {common.yaml_value(f'{cert_dir}/{cert_name}.crt')}\n"
            f"  key: {common.yaml_value(f'{cert_dir}/{cert_name}.key')}"
        )
        return domain, connect_host, sni, insecure, cert_dir, block

    if tls_mode == "manual-cert":
        cert_path = common.env("SIMPLEUI_CERT_PATH")
        key_path = common.env("SIMPLEUI_KEY_PATH")
        if not cert_path or not key_path:
            common.log("Manual certificate mode requires certificate and private key paths")
            raise SystemExit(32)
        common.log("Using manual Hysteria2 certificate paths")
        block = (
            "tls:\n"
            f"  cert: {common.yaml_value(cert_path)}\n"
            f"  key: {common.yaml_value(key_path)}"
        )
        return domain, connect_host, sni, insecure, cert_dir, block

    if tls_mode in {"acme-dns", "acme-dns-cloudflare"}:
        dns_provider = common.env("SIMPLEUI_DNS_PROVIDER", "cloudflare")
        if tls_mode == "acme-dns-cloudflare":
            dns_provider = "cloudflare"
        dns_token = common.env("SIMPLEUI_DNS_TOKEN")
        if not dns_token:
            common.log("ACME DNS mode requires a DNS provider token")
            raise SystemExit(32)
        common.log(f"Configuring Hysteria2 ACME DNS certificate for {domain} via {dns_provider}")
        dns_config = {
            "cloudflare": ("cloudflare", [("cloudflare_api_token", dns_token)]),
            "duckdns": ("duckdns", [("duckdns_api_token", dns_token)]),
            "gandi": ("gandi", [("gandi_api_token", dns_token)]),
            "godaddy": ("godaddy", [("godaddy_api_token", dns_token)]),
            "namedotcom": ("namedotcom", [
                ("namedotcom_token", dns_token),
                ("namedotcom_user", common.env("SIMPLEUI_DNS_USER")),
                ("namedotcom_server", common.env("SIMPLEUI_DNS_SERVER", "api.name.com")),
            ]),
            "name.com": ("namedotcom", [
                ("namedotcom_token", dns_token),
                ("namedotcom_user", common.env("SIMPLEUI_DNS_USER")),
                ("namedotcom_server", common.env("SIMPLEUI_DNS_SERVER", "api.name.com")),
            ]),
            "vultr": ("vultr", [("vultr_api_key", dns_token)]),
        }
        if dns_provider not in dns_config:
            common.log(f"Unsupported ACME DNS provider: {dns_provider}")
            raise SystemExit(32)
        name, entries = dns_config[dns_provider]
        if name == "duckdns" and common.env("SIMPLEUI_DNS_OVERRIDE_DOMAIN"):
            entries.append(("duckdns_override_domain", common.env("SIMPLEUI_DNS_OVERRIDE_DOMAIN")))
        config_lines = [f"    name: {name}", "    config:"]
        config_lines.extend(f"      {key}: {common.yaml_value(value)}" for key, value in entries)
        block = (
            "acme:\n"
            "  domains:\n"
            f"    - {common.yaml_value(domain)}\n"
            f"  email: {common.yaml_value(email)}\n"
            "  type: dns\n"
            "  dns:\n"
            + "\n".join(config_lines)
        )
        return domain, connect_host, sni, insecure, cert_dir, block

    common.log(f"Configuring Hysteria2 ACME HTTP certificate for {domain}")
    block = (
        "acme:\n"
        "  domains:\n"
        f"    - {common.yaml_value(domain)}\n"
        f"  email: {common.yaml_value(email)}"
    )
    return domain, connect_host, sni, insecure, cert_dir, block


def uri_host(value):
    text = str(value or "").strip()
    if text.startswith("[") and "]" in text:
        return text
    if ":" in text:
        return f"[{text}]"
    return text


def write_share_links(connect_host, port, sni, insecure, obfs_enabled, obfs_password, mport):
    users_path = pathlib.Path("/etc/simpleui/hysteria2/users.kv")
    endpoint_host = uri_host(connect_host)
    links = []
    for raw in common.read_text(users_path).splitlines():
        if ":" not in raw:
            continue
        username, password = raw.split(":", 1)
        params = [f"sni={quote(sni)}"]
        if common.is_true(obfs_enabled):
            params.extend(["obfs=salamander", f"obfs-password={quote(obfs_password)}"])
        params.append(f"insecure={insecure}")
        if mport:
            params.append(f"mport={quote(mport)}")
        links.append({
            "username": username,
            "uri": f"hysteria2://{quote(password, safe='')}@{endpoint_host}:{port}?{'&'.join(params)}#{quote(username)}",
        })

    out_dir = pathlib.Path("/etc/hy2config")
    out_dir.mkdir(parents=True, exist_ok=True)
    scheme_text = f"您的 v2ray hy2配置链接为：{links[0]['uri']}\n" if links else ""
    common.write_text(out_dir / "hy2_url_scheme.txt", scheme_text, 0o600)
    common.write_text(out_dir / "share-links.json", json.dumps(links, ensure_ascii=False, indent=2), 0o600)
    return links


def download_subscription_templates(first_link):
    common.log("Downloading subscription templates for the first generated Hysteria2 link")
    if not first_link:
        return
    encoded = quote(first_link, safe="")
    url_rule = "&ua=&selectedRules=%22balanced%22&customRules=%5B%5D"
    targets = {
        "clash": "/etc/hy2config/clash.yaml",
        "singbox": "/etc/hy2config/sing-box.yaml",
        "surge": "/etc/hy2config/surge.yaml",
    }
    for name, target in targets.items():
        try:
            common.download(f"https://sub.baibaicat.site/{name}?config={encoded}{url_rule}", target)
        except subprocess.CalledProcessError:
            pass


def main():
    common.bootstrap()
    installed_core = install_upstream_flow()

    users_path = "/etc/simpleui/hysteria2/users.kv"
    common.write_kv_users(users_path)
    hy2_password = common.first_password_from_users(users_path)
    if not hy2_password:
        common.log("Hysteria2 password auth requires at least one password")
        raise SystemExit(30)

    domain = common.env("SIMPLEUI_DOMAIN")
    port = str(common.need_port("Hysteria2 listen port", common.env("SIMPLEUI_PORT", "443")))
    masq = common.env("SIMPLEUI_MASQUERADE_URL", "https://www.bing.com/")
    tls_mode = common.env("SIMPLEUI_TLS_MODE", "acme-http")
    if not domain and tls_mode != "self-signed":
        domain = common.capture(["hostname", "-f"]).strip() or common.capture(["hostname"]).strip()
    email = common.env("SIMPLEUI_ACME_EMAIL", f"admin@{domain}")
    connect_host = common.env("SIMPLEUI_SELF_SIGNED_HOST", domain)
    brutal = "true" if common.is_true(common.env("SIMPLEUI_BRUTAL", "false")) else "false"

    jump_port_start = ""
    jump_port_end = ""
    jump_port_interface = ""
    jump_port_ipv6_interface = ""
    jump_mport = ""
    if common.is_true(common.env("SIMPLEUI_JUMP_PORT_ENABLED", "0")):
        jump_port_start = common.env("SIMPLEUI_JUMP_PORT_START")
        jump_port_end = common.env("SIMPLEUI_JUMP_PORT_END")
        jump_port_interface = common.env("SIMPLEUI_JUMP_PORT_INTERFACE")
        jump_port_ipv6_interface = common.env("SIMPLEUI_JUMP_PORT_IPV6_INTERFACE")
        configure_port_hopping(
            jump_port_start,
            jump_port_end,
            jump_port_interface,
            common.env("SIMPLEUI_JUMP_PORT_IPV6_ENABLED", "0"),
            jump_port_ipv6_interface,
            port,
        )
        jump_mport = f"{jump_port_start}-{jump_port_end}"

    if installed_core != "1":
        common.copy_if_missing("/etc/hysteria/config.yaml", "/etc/simpleui/hysteria2/original-config.yaml")

    domain, connect_host, sni, insecure, cert_dir, tls_block = tls_config(tls_mode, domain, email, connect_host)

    obfs_block = ""
    if common.is_true(common.env("SIMPLEUI_OBFS_ENABLED", "0")):
        obfs_password = common.env("SIMPLEUI_OBFS_PASSWORD")
        if not obfs_password:
            common.log("Salamander obfs requires a password")
            raise SystemExit(33)
        obfs_block = (
            "obfs:\n"
            "  type: salamander\n"
            "  \n"
            "  salamander:\n"
            f"    password: {common.yaml_value(obfs_password)}"
        )

    sniff_block = ""
    if common.is_true(common.env("SIMPLEUI_SNIFF_ENABLED", "0")):
        sniff_block = (
            "sniff:\n"
            "  enable: true\n"
            "  timeout: 2s\n"
            "  rewriteDomain: false\n"
            "  tcpPorts: 80,443,8000-9000\n"
            "  udpPorts: all"
        )

    config = f"""listen: :{port}

{tls_block}

auth:
  type: password
  password: {common.yaml_value(hy2_password)}

masquerade:
  type: proxy
  proxy:
    url: {common.yaml_value(masq)}
    rewriteHost: true

ignoreClientBandwidth: {brutal}

{obfs_block}
{sniff_block}
"""
    common.write_text("/etc/hysteria/config.yaml", config)

    common.write_text(
        "/etc/hy2config/simpleui.env",
        f"""SIMPLEUI_DOMAIN={domain}
SIMPLEUI_CONNECT_HOST={connect_host}
SIMPLEUI_PORT={port}
SIMPLEUI_TLS_MODE={tls_mode}
SIMPLEUI_SNI={sni}
SIMPLEUI_INSECURE={insecure}
SIMPLEUI_JUMP_PORT_START={jump_port_start}
SIMPLEUI_JUMP_PORT_END={jump_port_end}
SIMPLEUI_JUMP_PORT_INTERFACE={jump_port_interface}
SIMPLEUI_JUMP_PORT_IPV6_INTERFACE={jump_port_ipv6_interface}
""",
        0o600,
    )

    links = write_share_links(
        connect_host,
        port,
        sni,
        insecure,
        common.env("SIMPLEUI_OBFS_ENABLED", "0"),
        common.env("SIMPLEUI_OBFS_PASSWORD"),
        jump_mport,
    )
    download_subscription_templates(links[0]["uri"] if links else "")

    common.write_text(
        "/etc/simpleui/hysteria2/managed.env",
        f"""SIMPLEUI_PROTOCOL=hysteria2
SIMPLEUI_SERVICE=hysteria-server.service
SIMPLEUI_CONFIG=/etc/hysteria/config.yaml
SIMPLEUI_DOMAIN={domain}
SIMPLEUI_CONNECT_HOST={connect_host}
SIMPLEUI_PORT={port}
SIMPLEUI_TLS_MODE={tls_mode}
SIMPLEUI_INSTALLED_CORE={installed_core}
SIMPLEUI_CERT_DIR={cert_dir}
SIMPLEUI_CERT_NAME={sni}
SIMPLEUI_JUMP_PORT_START={jump_port_start}
SIMPLEUI_JUMP_PORT_END={jump_port_end}
SIMPLEUI_JUMP_PORT_INTERFACE={jump_port_interface}
SIMPLEUI_JUMP_PORT_IPV6_INTERFACE={jump_port_ipv6_interface}
""",
        0o600,
    )

    common.run(["systemctl", "daemon-reload"])
    common.run(["systemctl", "enable", "--now", "hysteria-server.service"])
    common.run(["systemctl", "restart", "hysteria-server.service"])

    common.log("Hysteria2 deployed through Python-maintained upstream flow")
    common.emit("__SIMPLEUI_RESULT__", {
        "protocol": "hysteria2",
        "service": "hysteria-server.service",
        "domain": domain,
        "connectHost": connect_host,
        "port": int(port),
        "jumpPortStart": jump_port_start,
        "jumpPortEnd": jump_port_end,
    })


if __name__ == "__main__":
    main()
