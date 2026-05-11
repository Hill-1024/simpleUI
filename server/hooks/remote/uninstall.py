#!/usr/bin/env python3
import ipaddress
import json
import os
import pathlib
import shutil
import subprocess

import common


MANAGED_FILE = "/etc/simpleui/managed-protocols"


def traffic_prefix(protocol, port):
    return "".join(char if char.isalnum() or char == "_" else "_" for char in f"{protocol}_{port}")


def cleanup_traffic_accounting(protocol, port):
    if not common.command_exists("nft") or not protocol or not port:
        return
    prefix = traffic_prefix(protocol, port)
    for chain in ["input", "output"]:
        output = common.capture(["nft", "-a", "list", "chain", "inet", "simpleui_traffic", chain])
        for line in output.splitlines():
            if f"@{prefix}_" not in line:
                continue
            handle = line.split()[-1] if line.split() else ""
            if handle:
                common.run(["nft", "delete", "rule", "inet", "simpleui_traffic", chain, "handle", handle], check=False)
    for suffix in ["rx4", "tx4", "rx6", "tx6"]:
        common.run(["nft", "delete", "set", "inet", "simpleui_traffic", f"{prefix}_{suffix}"], check=False)


def normalize_target(raw):
    try:
        text = str(raw or "").strip()
        if not text:
            return None
        parsed = ipaddress.ip_network(text, strict=False) if "/" in text else ipaddress.ip_address(text)
        if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped:
            parsed = parsed.ipv4_mapped
        elif isinstance(parsed, ipaddress.IPv6Network) and parsed.network_address.ipv4_mapped and parsed.prefixlen >= 96:
            parsed = ipaddress.ip_network(f"{parsed.network_address.ipv4_mapped}/{parsed.prefixlen - 96}", strict=False)
        return str(parsed), parsed.version
    except Exception:
        return None


def blacklist_rows():
    rows = []
    data = common.read_json("/etc/simpleui/source-ip-blacklist.json", {})
    nodes = data.get("nodes") if isinstance(data, dict) and isinstance(data.get("nodes"), dict) else {}
    for node in nodes.values():
        if not isinstance(node, dict):
            continue
        targets = node.get("targets") if isinstance(node.get("targets"), dict) else {}
        for key, entry in targets.items():
            entry = entry if isinstance(entry, dict) else {"target": key}
            normalized = normalize_target(entry.get("target") or key)
            if normalized:
                target, family = normalized
                rows.append((target, family, str(node.get("listenPort") or ""), common.normalize_service_protocols(node.get("serviceProtocol", ""), node.get("protocol", ""))))

    for line in common.read_text("/etc/simpleui/banned-source-ips.txt").splitlines():
        normalized = normalize_target(line.strip())
        if normalized:
            target, family = normalized
            rows.append((target, family, "", "tcp,udp"))

    deduped = []
    seen = set()
    for row in rows:
        if row in seen:
            continue
        seen.add(row)
        deduped.append(row)
    return deduped


def iptables_tool(family):
    if family == 6 and common.command_exists("ip6tables"):
        return "ip6tables"
    if family == 4 and common.command_exists("iptables"):
        return "iptables"
    return ""


def remove_iptables(tool, source_ip, node_port, proto):
    if node_port:
        args = ["INPUT", "-p", proto, "--dport", str(node_port), "-s", source_ip, "-j", "DROP"]
        while common.run([tool, "-C", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            if common.run([tool, "-D", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
                break
    args = ["INPUT", "-s", source_ip, "-j", "DROP"]
    while common.run([tool, "-C", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        if common.run([tool, "-D", *args], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
            break


def remove_nft_rules(family, source_ip, node_port, proto):
    if not common.command_exists("nft"):
        return
    family_expr = "ip6 saddr" if family == 6 else "ip saddr"
    output = common.capture(["nft", "-a", "list", "chain", "inet", "simpleui", "input"])
    for line in output.splitlines():
        if family_expr not in line or source_ip not in line:
            continue
        if node_port and (f"dport {node_port}" not in line or proto not in line):
            continue
        handle = line.split()[-1] if line.split() else ""
        if handle:
            common.run(["nft", "delete", "rule", "inet", "simpleui", "input", "handle", handle], check=False)


def cleanup_bans():
    common.log("Cleaning SimpleUI firewall DROP rules")
    for source_ip, family, node_port, protocols in blacklist_rows():
        tool = iptables_tool(family)
        for proto in protocols.split(","):
            if proto not in {"tcp", "udp"}:
                continue
            if tool:
                remove_iptables(tool, source_ip, node_port, proto)
            remove_nft_rules(family, source_ip, node_port, proto)
    common.run(["nft", "delete", "table", "inet", "simpleui"], check=False)
    common.save_firewall()


def cleanup_hysteria2():
    common.log("Cleaning Hysteria2 files managed by SimpleUI")
    env = common.read_env_file("/etc/simpleui/hysteria2/managed.env")
    if not env:
        env = common.read_env_file("/etc/hy2config/simpleui.env")
    domain = env.get("SIMPLEUI_DOMAIN", "")
    tls_mode = env.get("SIMPLEUI_TLS_MODE", "")
    installed_core = env.get("SIMPLEUI_INSTALLED_CORE", "0")
    cert_dir = env.get("SIMPLEUI_CERT_DIR", "/etc/ssl/private")
    cert_name = env.get("SIMPLEUI_CERT_NAME") or env.get("SIMPLEUI_SNI") or domain
    node_port = env.get("SIMPLEUI_PORT") or os.environ.get("SIMPLEUI_PORT", "")

    common.systemctl("disable", "--now", "hysteria-server.service")
    common.systemctl("disable", "--now", "hysteria.service")
    common.systemctl("disable", "--now", "hysteria-iptables.service")
    cleanup_traffic_accounting("hysteria2", node_port)

    if os.access("/etc/hy2config/jump_port_back.py", os.X_OK):
        common.run(["python3", "-I", "-B", "/etc/hy2config/jump_port_back.py"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    elif os.access("/etc/hy2config/jump_port_back.sh", os.X_OK):
        common.run(["/etc/hy2config/jump_port_back.sh"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    common.rm_f(
        "/etc/systemd/system/hysteria-iptables.service",
        "/etc/hy2config/iptables-rules.v4",
        "/etc/hy2config/iptables-rules.v6",
        "/etc/hy2config/restore-iptables.py",
        "/etc/hy2config/restore-iptables.sh",
        "/etc/hy2config/jump_port_back.py",
        "/etc/hy2config/jump_port_back.sh",
    )

    if os.path.exists("/etc/simpleui/hysteria2/original-config.yaml"):
        common.mkdir("/etc/hysteria")
        shutil.copy2("/etc/simpleui/hysteria2/original-config.yaml", "/etc/hysteria/config.yaml")
        common.systemctl("restart", "hysteria-server.service")
    else:
        common.rm_f("/etc/hysteria/config.yaml", "/etc/systemd/system/hysteria-server.service", "/etc/systemd/system/hysteria.service")

    if installed_core == "1":
        common.rm_f("/usr/local/bin/hysteria", "/usr/bin/hysteria")
        common.rm_rf("/etc/hysteria")

    if tls_mode == "self-signed" and cert_name:
        common.rm_f(
            f"/etc/ssl/private/{cert_name}.key",
            f"/etc/ssl/private/{cert_name}.crt",
            f"{cert_dir}/{cert_name}.key",
            f"{cert_dir}/{cert_name}.crt",
            f"{cert_dir}/ec_param.pem",
            f"/etc/hysteria/certs/{cert_name}.key",
            f"/etc/hysteria/certs/{cert_name}.crt",
        )
        common.rmdir("/etc/hysteria/certs")
        common.rmdir(cert_dir)

    common.rm_f(
        "/usr/local/bin/simpleui-hy2-auth",
        "/etc/hy2config/simpleui.env",
        "/etc/hy2config/hy2_url_scheme.txt",
        "/etc/hy2config/share-links.json",
        "/etc/hy2config/clash.yaml",
        "/etc/hy2config/sing-box.yaml",
        "/etc/hy2config/surge.yaml",
        "/etc/hy2config/agree.txt",
    )
    common.rmdir("/etc/hy2config")
    common.rm_rf("/etc/simpleui/hysteria2")
    common.rm_rf("/opt/simpleui/upstream/hysteria2")


def cleanup_trojan():
    common.log("Cleaning Trojan files managed by SimpleUI")
    env = common.read_env_file("/etc/simpleui/trojan/managed.env")
    installed_service = env.get("SIMPLEUI_INSTALLED_SERVICE", "0")
    had_nginx = env.get("SIMPLEUI_HAD_NGINX", "1")
    had_acme = env.get("SIMPLEUI_HAD_ACME", "1")
    config = env.get("SIMPLEUI_CONFIG", "/usr/src/trojan/server.conf")
    node_port = env.get("SIMPLEUI_PORT") or os.environ.get("SIMPLEUI_PORT", "443")
    cleanup_traffic_accounting("trojan", node_port)

    if installed_service == "1":
        common.systemctl("disable", "--now", "trojan.service")
        common.rm_f("/etc/systemd/system/trojan.service", "/usr/local/bin/trojan", "/usr/bin/trojan")
        common.systemctl("reset-failed", "trojan.service")
        for item in pathlib.Path("/usr/src").glob("trojan*"):
            common.rm_rf(item)
        common.rm_rf("/usr/local/etc/trojan")
        common.rm_rf("/etc/trojan")
    elif os.path.exists("/etc/simpleui/trojan/original-config.json"):
        common.mkdir(os.path.dirname(config))
        shutil.copy2("/etc/simpleui/trojan/original-config.json", config)
        common.systemctl("restart", "trojan.service")
    else:
        common.systemctl("restart", "trojan.service")

    if not os.path.exists("/etc/simpleui/trojan/managed.env"):
        for item in pathlib.Path("/usr/src").glob("trojan*"):
            common.rm_rf(item)
        common.rm_rf("/usr/local/etc/trojan")
        common.rm_rf("/etc/trojan")

    if os.path.exists("/etc/simpleui/trojan/original-nginx.conf"):
        common.mkdir("/etc/nginx")
        shutil.copy2("/etc/simpleui/trojan/original-nginx.conf", "/etc/nginx/nginx.conf")
        common.systemctl("restart", "nginx")
    elif had_nginx == "0":
        common.systemctl("disable", "--now", "nginx")
        if common.command_exists("apt-get"):
            env_vars = os.environ.copy()
            env_vars["DEBIAN_FRONTEND"] = "noninteractive"
            common.run(["apt-get", "purge", "-y", "nginx", "nginx-common"], env=env_vars, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            common.run(["apt-get", "autoremove", "-y"], env=env_vars, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif common.command_exists("dnf"):
            common.run(["dnf", "remove", "-y", "nginx"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif common.command_exists("yum"):
            common.run(["yum", "remove", "-y", "nginx"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        html = pathlib.Path("/usr/share/nginx/html")
        if html.is_dir():
            for item in html.iterdir():
                common.rm_rf(item)
        common.rm_f("/etc/systemd/system/multi-user.target.wants/nginx.service")

    if had_acme == "0":
        common.run(["/root/.acme.sh/acme.sh", "--uninstall"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        common.rm_rf("/root/.acme.sh")

    common.rm_rf("/etc/simpleui/trojan")
    common.rm_rf("/opt/simpleui/upstream/trojan")


def managed_protocols_for_scope(scope, target_protocol):
    if scope == "node":
        if not target_protocol:
            common.log("Node uninstall requires SIMPLEUI_PROTOCOL")
            raise SystemExit(22)
        common.log(f"Cleaning SimpleUI-managed {target_protocol} node and keeping hook agent")
        return [target_protocol]
    common.log("Cleaning SimpleUI-managed nodes and uninstalling hook agent")
    protocols = [line.strip() for line in common.read_text(MANAGED_FILE).splitlines() if line.strip()]
    if not protocols:
        if os.path.isdir("/etc/simpleui/hysteria2"):
            protocols.append("hysteria2")
        if os.path.isdir("/etc/simpleui/trojan"):
            protocols.append("trojan")
    return protocols


def update_managed_protocols_after_node_delete(target_protocol):
    if not os.path.exists(MANAGED_FILE):
        return
    lines = [line for line in common.read_text(MANAGED_FILE).splitlines() if line.strip() and line.strip() != target_protocol]
    if lines:
        common.atomic_write(MANAGED_FILE, "\n".join(lines), 0o600)
    else:
        common.rm_f(MANAGED_FILE)


def schedule_self_remove():
    script = "/tmp/simpleui-hook-self-remove.py"
    common.write_text(
        script,
        """#!/usr/bin/env python3
import os
import shutil
import subprocess
import time

time.sleep(2)
subprocess.run(["systemctl", "disable", "--now", "simpleui-hook.service"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for path in ["/etc/systemd/system/simpleui-hook.service", "/etc/simpleui-hook.env"]:
    try:
        os.unlink(path)
    except OSError:
        pass
shutil.rmtree("/opt/simpleui-hook", ignore_errors=True)
subprocess.run(["systemctl", "daemon-reload"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    os.unlink("/tmp/simpleui-hook-self-remove.py")
except OSError:
    pass
""",
        0o700,
    )
    if common.command_exists("systemd-run"):
        result = common.run(["systemd-run", "--unit=simpleui-hook-self-remove", "--on-active=2s", "python3", "-I", "-B", script], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode == 0:
            return
    subprocess.Popen(["python3", "-I", "-B", script], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


def main():
    common.bootstrap()
    scope = os.environ.get("SIMPLEUI_UNINSTALL_SCOPE", "server")
    target_protocol = os.environ.get("SIMPLEUI_PROTOCOL", "")

    if os.environ.get("SIMPLEUI_MONITOR_ONLY", "0") == "1":
        common.log("Monitor-only node; remote proxy files will not be changed.")
        common.emit("__SIMPLEUI_RESULT__", {"ok": True, "action": "monitor-remove", "protocol": target_protocol})
        return

    for protocol in managed_protocols_for_scope(scope, target_protocol):
        if protocol == "hysteria2":
            cleanup_hysteria2()
        elif protocol == "trojan":
            cleanup_trojan()
        elif protocol:
            common.log(f"Ignoring unknown managed protocol: {protocol}")

    if scope == "node":
        update_managed_protocols_after_node_delete(target_protocol)
        common.systemctl("daemon-reload")
        common.emit("__SIMPLEUI_RESULT__", {"ok": True, "action": "node-delete", "protocol": target_protocol})
        return

    cleanup_bans()
    common.run(["nft", "delete", "table", "inet", "simpleui_traffic"], check=False)
    common.rm_f(MANAGED_FILE)
    common.rm_rf("/etc/simpleui")
    common.rm_rf("/opt/simpleui")
    common.systemctl("daemon-reload")
    schedule_self_remove()
    common.emit("__SIMPLEUI_RESULT__", {"ok": True, "action": "uninstall"})


if __name__ == "__main__":
    main()
