#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
from urllib.parse import quote

import common
import certificates


WORKDIR = pathlib.Path("/opt/simpleui/upstream/hysteria2")
HYSTERIA_SERVICE = "hysteria-server.service"
HYSTERIA_TEMPLATE_SERVICE = "hysteria-server@.service"


def installer_env():
    env = os.environ.copy()
    if not env.get("DEBIAN_FRONTEND"):
        env["DEBIAN_FRONTEND"] = "noninteractive"
    if not env.get("TERM"):
        env["TERM"] = "xterm"
    return env


def hysteria_binary_exists():
    return common.command_exists("hysteria") or os.access("/usr/local/bin/hysteria", os.X_OK)


def systemd_unit_exists(name):
    for directory in ["/etc/systemd/system", "/lib/systemd/system", "/usr/lib/systemd/system"]:
        if os.path.exists(os.path.join(directory, name)):
            return True
    return common.run(["systemctl", "cat", name], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def hysteria_service_units_exist():
    return systemd_unit_exists(HYSTERIA_SERVICE) and systemd_unit_exists(HYSTERIA_TEMPLATE_SERVICE)


def run_official_hysteria_installer(reason):
    common.log(reason)
    installer = WORKDIR / "get-hy2.sh"
    common.download("https://get.hy2.sh/", str(installer))
    common.chmod(installer, 0o700)
    common.run(["bash", str(installer)], env=installer_env())


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
    common.run(["bash", "./phy2.sh"], cwd=WORKDIR, env=installer_env())

    installed_core = common.read_env_file("/etc/simpleui/hysteria2/managed.env").get("SIMPLEUI_INSTALLED_CORE", "0")
    binary_present = hysteria_binary_exists()
    services_present = hysteria_service_units_exist()
    if not binary_present:
        installed_core = "1"
        run_official_hysteria_installer("Installing Hysteria2 core using the same official installer invoked by hysteria2.py")
    elif not services_present:
        run_official_hysteria_installer("Hysteria2 binary is present but systemd service files are missing; repairing official service files")
    else:
        common.log("Hysteria2 core already present")
    if not hysteria_binary_exists():
        common.log("Hysteria2 executable is missing after installation")
        raise SystemExit(34)
    if not hysteria_service_units_exist():
        common.log("Hysteria2 systemd service files are missing after installation")
        raise SystemExit(34)
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
    add_args[3] = "-A"
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
    sni = domain
    if tls_mode == "self-signed":
        sni = common.env("SIMPLEUI_SELF_SIGNED_DOMAIN", "bing.com")
        connect_host = connect_host or detect_public_host(common.env("SIMPLEUI_SELF_SIGNED_IP_MODE", "ipv4"))
        if not connect_host:
            raise SystemExit("Self-signed mode could not detect the public connection address")
        domain = domain or connect_host
    record = certificates.ensure_certificate("hysteria2", tls_mode, domain, sni)
    cert, key = certificates.paths(record)
    if record["mode"] == "manual-cert":
        for path in (cert, key):
            if common.run(["runuser", "-u", "hysteria", "--", "test", "-r", path], check=False).returncode:
                raise SystemExit("The hysteria service user needs read access to the manual certificate and private key")
    os.environ.update(certificates.certificate_env(record))
    return domain, connect_host or domain, record["sni"], "1" if record.get("insecure") else "0", str(certificates.ROOT), certificates.tls_block(record)


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

    if installed_core != "1" and not common.read_env_file("/etc/simpleui/hysteria2/managed.env"):
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
    common.atomic_write("/etc/hysteria/config.yaml", config, 0o640)
    import grp
    os.chown("/etc/hysteria/config.yaml", 0, grp.getgrnam("hysteria").gr_gid)

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
    # Share links contain passwords; never send them to an external subscription service.

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
SIMPLEUI_SNI={sni}
SIMPLEUI_INSECURE={insecure}
SIMPLEUI_CERT_PATH={common.env("SIMPLEUI_CERT_PATH")}
SIMPLEUI_KEY_PATH={common.env("SIMPLEUI_KEY_PATH")}
SIMPLEUI_JUMP_PORT_START={jump_port_start}
SIMPLEUI_JUMP_PORT_END={jump_port_end}
SIMPLEUI_JUMP_PORT_INTERFACE={jump_port_interface}
SIMPLEUI_JUMP_PORT_IPV6_INTERFACE={jump_port_ipv6_interface}
""",
        0o600,
    )

    common.run(["systemctl", "daemon-reload"])
    common.run(["systemctl", "enable", "hysteria-server.service"])
    common.run(["systemctl", "restart", "hysteria-server.service"])
    common.run(["systemctl", "is-active", "--quiet", "hysteria-server.service"])

    common.log("Hysteria2 deployed through Python-maintained upstream flow")
    common.emit("__SIMPLEUI_RESULT__", {
        "protocol": "hysteria2",
        "service": "hysteria-server.service",
        "domain": domain,
        "connectHost": connect_host,
        "port": int(port),
        "tlsMode": tls_mode,
        "certPath": common.env("SIMPLEUI_CERT_PATH"),
        "keyPath": common.env("SIMPLEUI_KEY_PATH"),
        "sni": sni,
        "insecure": insecure == "1",
        "jumpPortStart": jump_port_start,
        "jumpPortEnd": jump_port_end,
    })


if __name__ == "__main__":
    with certificates.deployment_lock(), certificates.deployment_transaction("hysteria2"):
        main()
