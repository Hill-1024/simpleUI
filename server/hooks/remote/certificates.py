#!/usr/bin/env python3
"""One certificate and one renewal owner for the SimpleUI services on a host."""
import contextlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile

import common

ROOT = pathlib.Path("/etc/simpleui/certificates")
STATE = ROOT / "state.json"
LOCK_PATH = pathlib.Path("/run/simpleui-deployment.lock")
ACME = pathlib.Path("/root/.acme.sh/acme.sh")
CONFIGS = {
    "hysteria2": pathlib.Path("/etc/hysteria/config.yaml"),
    "trojan": pathlib.Path("/usr/src/trojan/server.conf"),
}
SERVICES = {"hysteria2": "hysteria-server.service", "trojan": "trojan.service"}


@contextlib.contextmanager
def deployment_lock():
    import fcntl
    # A file lock also protects separate hook requests/processes and uninstall.
    with LOCK_PATH.open("a", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another SimpleUI deployment or uninstall is running on this server")
        yield


def managed(protocol):
    return common.read_env_file(f"/etc/simpleui/{protocol}/managed.env")


@contextlib.contextmanager
def deployment_transaction(protocol):
    files = [CONFIGS[protocol], pathlib.Path(f"/etc/systemd/system/{SERVICES[protocol]}")]
    files += list(pathlib.Path(f"/etc/simpleui/{protocol}").glob("*"))
    if protocol == "hysteria2":
        files += [pathlib.Path(f"/etc/hy2config/{name}") for name in ("simpleui.env", "share-links.json", "hy2_url_scheme.txt")]
    snapshots = {path: (path.read_bytes(), path.stat()) for path in files if path.is_file()}
    active = common.service_state(SERVICES[protocol]) == "active"
    try:
        yield
    except BaseException:
        for path, (content, stat) in snapshots.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            os.chmod(path, stat.st_mode & 0o777)
            os.chown(path, stat.st_uid, stat.st_gid)
        if active:
            common.run(["systemctl", "daemon-reload"], check=False)
            common.run(["systemctl", "restart", SERVICES[protocol]], check=False)
        raise


def peer_protocol(protocol):
    peer = "trojan" if protocol == "hysteria2" else "hysteria2"
    return peer if managed(peer) and CONFIGS[peer].exists() else ""


def cleanup_shared_certificate():
    """Only full server removal retires the shared renewal entry."""
    record = common.read_json(STATE, {})
    if record.get("mode") in ("acme-http", "acme-dns") and ACME.exists():
        domain = validate_domain(record["sni"])
        for suffix, args in [("", []), ("_ecc", ["--ecc"])]:
            conf = common.read_text(ACME.parent / f"{domain}{suffix}" / f"{domain}.conf")
            if str(ROOT / "incoming") in conf:
                common.run([ACME, "--remove", "-d", domain, *args])
    # Leave user-provided certificates and the shared system ACME client untouched.
    for path in pathlib.Path("/etc/nginx/conf.d").glob("simpleui-certificate-*.conf"):
        path.unlink()
    if common.command_exists("nginx"):
        common.run(["nginx", "-t"])
        common.run(["systemctl", "reload", "nginx"], check=False)


def validate_domain(domain):
    domain = domain.strip().lower().rstrip(".")
    if not re.fullmatch(r"(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", domain):
        raise SystemExit("Certificate domain must be a DNS name")
    return domain


def validate_pair(cert, key, sni):
    if not pathlib.Path(cert).is_file() or not pathlib.Path(key).is_file():
        raise SystemExit("Certificate or private key file is missing")
    common.run(["openssl", "x509", "-in", cert, "-noout", "-checkend", "0"], stdout=subprocess.DEVNULL)
    import ipaddress
    try:
        ipaddress.ip_address(sni.strip("[]"))
        check = "-checkip"
    except ValueError:
        check = "-checkhost"
    match = common.capture(["openssl", "x509", "-in", cert, "-noout", check, sni.strip("[]")])
    if "does match certificate" not in match:
        raise SystemExit("Certificate does not cover the node's SNI")
    cert_public = common.capture(["openssl", "x509", "-in", cert, "-pubkey", "-noout"], check=True).strip()
    key_public = common.capture(["openssl", "pkey", "-in", key, "-pubout"], check=True).strip()
    if not cert_public or cert_public != key_public:
        raise SystemExit("Certificate and private key do not match")


def permissions():
    import grp
    # The official Hysteria service runs as hysteria. Never make a private key world-readable.
    try:
        gid = grp.getgrnam("hysteria").gr_gid
    except KeyError:
        gid = 0
    for path in [ROOT, ROOT / "current", *(ROOT / "current").glob("*")]:
        if path.exists():
            os.chown(path, 0, gid)
            os.chmod(path, 0o750 if path.is_dir() else (0o640 if path.name == "private.key" else 0o644))


def publish(cert, key, sni):
    validate_pair(cert, key, sni)
    ROOT.mkdir(parents=True, exist_ok=True)
    generation = pathlib.Path(tempfile.mkdtemp(prefix="pair-", dir=ROOT))
    shutil.copyfile(cert, generation / "fullchain.cer")
    shutil.copyfile(key, generation / "private.key")
    os.chmod(generation / "private.key", 0o600)
    link = ROOT / "next"
    link.unlink(missing_ok=True)
    link.symlink_to(generation.name, target_is_directory=True)
    old = (ROOT / "current").resolve() if (ROOT / "current").exists() else None
    os.replace(link, ROOT / "current")
    permissions()
    # Keep the previous generation for rollback; do not accumulate private keys forever.
    for path in ROOT.glob("pair-*"):
        if path != generation and path != old:
            shutil.rmtree(path)


def paths(record):
    if record["mode"] == "manual-cert":
        return record["cert"], record["key"]
    return str(ROOT / "current/fullchain.cer"), str(ROOT / "current/private.key")


def tls_block(record):
    cert, key = paths(record)
    return f"tls:\n  cert: {common.yaml_value(cert)}\n  key: {common.yaml_value(key)}\n"


def replace_hysteria_tls(text, block):
    # Only replace top-level TLS/ACME blocks; keep passwords, obfs and transport settings.
    pattern = r"(?m)^(?:acme|tls):[^\n]*(?:\n(?:[ \t].*|[ \t]*|#[^\n]*))*\n?"
    if not re.search(pattern, text):
        raise SystemExit("Cannot locate the managed Hysteria TLS configuration")
    return re.sub(pattern, "", text).rstrip() + "\n\n" + block


def migrate_peer(peer, record):
    if not peer:
        return
    config = CONFIGS[peer]
    original = common.read_text(config)
    if peer == "hysteria2":
        updated = replace_hysteria_tls(original, tls_block(record))
    else:
        parsed = json.loads(original)
        parsed["ssl"]["cert"], parsed["ssl"]["key"] = paths(record)
        updated = json.dumps(parsed, indent=4) + "\n"
    if updated == original:
        return
    common.copy_if_missing(config, f"/etc/simpleui/{peer}/before-shared-certificate.conf")
    common.atomic_write(config, updated, 0o640 if peer == "hysteria2" else 0o600)
    if peer == "hysteria2":
        import grp
        try:
            os.chown(config, 0, grp.getgrnam("hysteria").gr_gid)
        except KeyError:
            pass
    try:
        # Restart only running services; do not unexpectedly start a disabled node.
        common.run(["systemctl", "try-restart", SERVICES[peer]])
    except BaseException:
        common.atomic_write(config, original, 0o640 if peer == "hysteria2" else 0o600)
        common.run(["systemctl", "try-restart", SERVICES[peer]], check=False)
        raise
    env = managed(peer)
    env.update(certificate_env(record))
    common.atomic_write(f"/etc/simpleui/{peer}/managed.env", "".join(f"{key}={value}\n" for key, value in env.items()))


def certificate_env(record):
    cert, key = paths(record)
    return {"SIMPLEUI_TLS_MODE": "shared-cert", "SIMPLEUI_CERT_PATH": cert,
            "SIMPLEUI_KEY_PATH": key, "SIMPLEUI_SNI": record["sni"],
            "SIMPLEUI_INSECURE": "1" if record.get("insecure") else "0"}


def prepare_http(domain):
    domain = validate_domain(domain)
    common.ensure_tool("nginx")
    config = common.capture(["nginx", "-T"])
    matching = any(domain in line.split()[1:] for line in config.replace(";", " ").splitlines()
                   if line.strip().startswith("server_name "))
    if not matching:
        # Use the distribution's include directory, preserving all existing websites.
        if not re.search(r"include\s+/etc/nginx/conf\.d/\*\.conf\s*;", config):
            raise SystemExit("Nginx needs an HTTP server_name for this domain, or use DNS/manual certificate mode")
        target = pathlib.Path(f"/etc/nginx/conf.d/simpleui-certificate-{domain}.conf")
        before = common.read_text(target) if target.exists() else None
        ipv6 = "    listen [::]:80;\n" if pathlib.Path("/proc/net/if_inet6").exists() else ""
        common.write_text(target, f"server {{\n    listen 80;\n{ipv6}    server_name {domain};\n    location / {{ return 404; }}\n}}\n")
        try:
            common.run(["nginx", "-t"])
        except BaseException:
            if before is None:
                target.unlink(missing_ok=True)
            else:
                common.write_text(target, before)
            raise
    common.run(["systemctl", "enable", "--now", "nginx"])
    common.run(["systemctl", "reload", "nginx"])


def dns_args(settings):
    provider = settings.get("SIMPLEUI_DNS_PROVIDER", "cloudflare")
    token = settings.get("SIMPLEUI_DNS_TOKEN", "")
    if not token:
        raise SystemExit("ACME DNS requires a provider token")
    if provider == "namedotcom" and settings.get("SIMPLEUI_DNS_SERVER", "api.name.com") not in ("", "api.name.com"):
        raise SystemExit("Shared Name.com ACME supports api.name.com; use a manual certificate for a custom API server")
    mapping = {
        "cloudflare": ("dns_cf", {"CF_Token": token}),
        "duckdns": ("dns_duckdns", {"DuckDNS_Token": token}),
        "gandi": ("dns_gandi_livedns", {"GANDI_LIVEDNS_TOKEN": token}),
        "vultr": ("dns_vultr", {"VULTR_API_KEY": token}),
        "namedotcom": ("dns_namecom", {"Namecom_Username": settings.get("SIMPLEUI_DNS_USER", ""), "Namecom_Token": token}),
    }
    if provider == "godaddy":
        key, sep, secret = token.partition(":")
        if not sep or not key or not secret:
            raise SystemExit("GoDaddy token must be API_KEY:API_SECRET")
        mapping[provider] = ("dns_gd", {"GD_Key": key, "GD_Secret": secret})
    if provider not in mapping:
        raise SystemExit("Unsupported DNS provider")
    name, env = mapping[provider]
    args = ["--dns", name]
    if provider == "duckdns" and settings.get("SIMPLEUI_DNS_OVERRIDE_DOMAIN"):
        args += ["--challenge-alias", validate_domain(settings["SIMPLEUI_DNS_OVERRIDE_DOMAIN"])]
    return args, env


def issue(record, settings):
    domain = validate_domain(record["sni"])
    if record["mode"] == "acme-http":
        prepare_http(domain)
        args, credentials = ["--nginx"], {}
    else:
        args, credentials = dns_args(settings)
    common.ensure_tool("openssl")
    common.ensure_tool("socat")
    if not ACME.exists():
        installer = ROOT / "acme-install.sh"
        common.download("https://get.acme.sh", installer)
        common.run(["sh", installer], env={**os.environ, "HOME": "/root"})
    env = {**os.environ, "HOME": "/root", **credentials}
    email = settings.get("SIMPLEUI_ACME_EMAIL", "")
    if email:
        common.run([ACME, "--register-account", "--server", "letsencrypt", "-m", email], env=env)
    # Retain an existing key type so migration does not leave two independent renewals.
    ecc = (ACME.parent / f"{domain}_ecc" / f"{domain}.conf").exists() and not (ACME.parent / domain / f"{domain}.conf").exists()
    domain_config = common.read_text(ACME.parent / (f"{domain}_ecc" if ecc else domain) / f"{domain}.conf")
    force = ["--force"] if domain_config and record["mode"] == "acme-http" and "Le_Webroot='nginx'" not in domain_config else []
    result = common.run([ACME, "--issue", "--server", "letsencrypt", "--keylength", "ec-256" if ecc else "2048", "-d", domain, *args, *force], env=env, check=False)
    if result.returncode not in (0, 2):
        raise SystemExit("Shared certificate issuance failed; existing services and certificate were retained")
    incoming = ROOT / "incoming"
    incoming.mkdir(mode=0o700, exist_ok=True)
    # The standalone renewal entry point has no dependency on the hook bundle.
    common.write_text(ROOT / "renew.py", RENEW_SCRIPT, 0o700)
    common.atomic_write(ROOT / "renew.json", json.dumps({"sni": domain}))
    common.run([ACME, "--install-cert", "-d", domain, *(["--ecc"] if ecc else []),
                "--key-file", incoming / "private.key", "--fullchain-file", incoming / "fullchain.cer",
                "--reloadcmd", f"python3 -I {ROOT}/renew.py"], env=env)
    validate_pair(ROOT / "current/fullchain.cer", ROOT / "current/private.key", domain)


def legacy_settings(peer, env):
    """Read only known fields from SimpleUI's generated, JSON-quoted YAML."""
    settings = dict(os.environ)
    if peer == "trojan":
        settings["SIMPLEUI_TLS_MODE"] = "acme-http"
        return settings
    text = common.read_text(CONFIGS[peer])
    def scalar(key):
        match = re.search(r"(?m)^\s+" + re.escape(key) + r":\s*([^\n]+)$", text)
        if not match:
            return ""
        value = match.group(1).strip()
        try:
            return str(json.loads(value))
        except ValueError:
            return value.strip("'\"")
    mode = env.get("SIMPLEUI_TLS_MODE", "acme-http")
    settings["SIMPLEUI_TLS_MODE"] = mode
    settings["SIMPLEUI_CERT_PATH"] = scalar("cert")
    settings["SIMPLEUI_KEY_PATH"] = scalar("key")
    settings["SIMPLEUI_ACME_EMAIL"] = scalar("email")
    if mode in ("acme-dns", "acme-dns-cloudflare"):
        provider = scalar("name") or "cloudflare"
        settings["SIMPLEUI_DNS_PROVIDER"] = provider
        settings["SIMPLEUI_DNS_TOKEN"] = scalar({"vultr": "vultr_api_key"}.get(provider, f"{provider}_api_token")) or scalar(f"{provider}_token")
        settings["SIMPLEUI_DNS_USER"] = scalar("namedotcom_user")
        settings["SIMPLEUI_DNS_OVERRIDE_DOMAIN"] = scalar("duckdns_override_domain")
    return settings


def ensure_certificate(protocol, mode, domain, sni=None):
    common.ensure_tool("openssl")
    peer = peer_protocol(protocol)
    record = common.read_json(STATE, {})
    domain = domain.strip().lower().rstrip(".")
    if record and (peer or mode == "shared-cert" or record.get("mode") == mode):
        validate_pair(*paths(record), record["sni"])
        permissions()
        migrate_peer(peer, record)
        return record

    if record:
        # Retiring/changing a shared identity needs an explicit migration. Otherwise an
        # older cron entry could publish its certificate over the new identity later.
        raise SystemExit("A shared certificate already exists; reuse it or migrate the certificate before changing its mode")

    settings = dict(os.environ)
    if peer:
        peer_env = managed(peer)
        settings = legacy_settings(peer, peer_env)
        mode = settings["SIMPLEUI_TLS_MODE"]
        sni = peer_env.get("SIMPLEUI_SNI") or peer_env.get("SIMPLEUI_CERT_NAME") or peer_env.get("SIMPLEUI_DOMAIN")
        if not sni:
            raise SystemExit("The existing node has no certificate SNI; repair its certificate settings before sharing")
    elif mode == "shared-cert":
        raise SystemExit("No shared certificate exists on this server yet")
    mode = "acme-dns" if mode == "acme-dns-cloudflare" else mode
    record = {"domain": domain, "sni": sni or domain, "mode": mode, "insecure": mode == "self-signed"}
    ROOT.mkdir(parents=True, exist_ok=True)
    os.chmod(ROOT, 0o750)
    if mode == "manual-cert":
        record.update(cert=settings.get("SIMPLEUI_CERT_PATH", ""), key=settings.get("SIMPLEUI_KEY_PATH", ""))
        validate_pair(*paths(record), record["sni"])
    elif mode == "self-signed":
        if peer:
            publish(settings["SIMPLEUI_CERT_PATH"], settings["SIMPLEUI_KEY_PATH"], record["sni"])
        else:
            name = validate_domain(record["sni"])
            with tempfile.TemporaryDirectory(dir=ROOT) as directory:
                cert, key = pathlib.Path(directory) / "cert.pem", pathlib.Path(directory) / "key.pem"
                common.run(["openssl", "req", "-x509", "-nodes", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
                            "-keyout", key, "-out", cert, "-subj", f"/CN={name}", "-addext", f"subjectAltName=DNS:{name}", "-days", "3650"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                publish(cert, key, name)
    elif mode in ("acme-http", "acme-dns"):
        issue(record, settings)
    else:
        raise SystemExit("Unsupported shared certificate mode")
    common.atomic_write(STATE, json.dumps(record))
    permissions()
    migrate_peer(peer, record)
    common.log("Using one shared certificate for Hysteria2 and Trojan")
    return record


# Installed beside the certificate so renewing still works after either node is removed.
RENEW_SCRIPT = '''import fcntl, json, os, pathlib, subprocess, tempfile, shutil, grp
root = pathlib.Path(__file__).parent
with (root / "renew.lock").open("a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    sni = json.loads((root / "renew.json").read_text())["sni"]
    cert, key = root / "incoming/fullchain.cer", root / "incoming/private.key"
    def output(args):
        return subprocess.check_output(args, stderr=subprocess.DEVNULL).strip()
    subprocess.run(["openssl", "x509", "-in", str(cert), "-noout", "-checkend", "0"], check=True)
    if b"does match certificate" not in output(["openssl", "x509", "-in", str(cert), "-noout", "-checkhost", sni]):
        raise SystemExit("Certificate does not cover the shared SNI")
    assert output(["openssl", "x509", "-in", str(cert), "-pubkey", "-noout"]) == output(["openssl", "pkey", "-in", str(key), "-pubout"]), "Certificate/key mismatch"
    generation = pathlib.Path(tempfile.mkdtemp(prefix="pair-", dir=root))
    try:
        gid = grp.getgrnam("hysteria").gr_gid
    except KeyError:
        gid = 0
    os.chown(root, 0, gid)
    os.chmod(root, 0o750)
    for name, source, mode in [("fullchain.cer", cert, 0o644), ("private.key", key, 0o640)]:
        target = generation / name
        shutil.copyfile(source, target)
        os.chown(target, 0, gid)
        os.chmod(target, mode)
    os.chown(generation, 0, gid)
    os.chmod(generation, 0o750)
    old = (root / "current").resolve() if (root / "current").exists() else None
    link = root / "renew-next"
    link.unlink(missing_ok=True)
    link.symlink_to(generation.name, target_is_directory=True)
    os.replace(link, root / "current")
    failed = []
    for protocol, service, config in [("hysteria2", "hysteria-server.service", "/etc/hysteria/config.yaml"), ("trojan", "trojan.service", "/usr/src/trojan/server.conf")]:
        config = pathlib.Path(config)
        if (root.parent / protocol / "managed.env").exists() and config.exists() and str(root / "current") in config.read_text():
            if subprocess.run(["systemctl", "try-restart", service]).returncode:
                failed.append(service)
    for path in root.glob("pair-*"):
        if path != generation and path != old:
            shutil.rmtree(path)
    if failed:
        raise SystemExit("Certificate updated but service restart failed: " + ", ".join(failed))
'''
