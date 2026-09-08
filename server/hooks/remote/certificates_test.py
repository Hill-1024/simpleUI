import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import certificates as certs


class CertificatesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.shared = self.root / "certificates"
        self.shared.mkdir()
        self.patches = [
            patch.object(certs, "ROOT", self.shared),
            patch.object(certs, "STATE", self.shared / "state.json"),
            patch.object(certs, "permissions"),
            patch.object(certs.common, "ensure_tool"),
        ]
        for item in self.patches:
            item.start()
        self.cert, self.key = self.make_pair("node.example.com", "first")

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def make_pair(self, domain, name):
        cert, key = self.root / f"{name}.pem", self.root / f"{name}.key"
        subprocess.run(["openssl", "req", "-x509", "-nodes", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
                        "-keyout", str(key), "-out", str(cert), "-subj", f"/CN={domain}", "-addext", f"subjectAltName=DNS:{domain}", "-days", "2"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return cert, key

    def seed(self):
        record = {"mode": "acme-http", "domain": "node.example.com", "sni": "node.example.com", "insecure": False}
        certs.publish(self.cert, self.key, record["sni"])
        certs.common.atomic_write(certs.STATE, json.dumps(record))
        return record

    def test_certificate_and_key_and_sni_are_checked(self):
        certs.validate_pair(self.cert, self.key, "node.example.com")
        with self.assertRaises(SystemExit):
            certs.validate_pair(self.cert, self.key, "other.example.com")
        _, wrong_key = self.make_pair("node.example.com", "wrong-key")
        with self.assertRaises(SystemExit):
            certs.validate_pair(self.cert, wrong_key, "node.example.com")

    def test_failed_publication_retains_existing_pair(self):
        self.seed()
        before = (self.shared / "current").resolve()
        _, wrong_key = self.make_pair("node.example.com", "wrong-key")
        with self.assertRaises(SystemExit):
            certs.publish(self.cert, wrong_key, "node.example.com")
        self.assertEqual((self.shared / "current").resolve(), before)
        self.assertEqual((self.shared / "current/fullchain.cer").read_bytes(), self.cert.read_bytes())
        self.assertEqual((self.shared / "current/private.key").stat().st_mode & 0o007, 0)

    def test_both_deployment_orders_reuse_one_pair_without_issuing(self):
        record = self.seed()
        for protocol, peer in [("hysteria2", "trojan"), ("trojan", "hysteria2")]:
            with self.subTest(protocol=protocol), patch.object(certs, "peer_protocol", return_value=peer), patch.object(certs, "migrate_peer") as migrate, patch.object(certs, "issue") as issue:
                actual = certs.ensure_certificate(protocol, "acme-http", "Node.Example.Com.")
                self.assertEqual(certs.paths(actual), certs.paths(record))
                issue.assert_not_called()
                migrate.assert_called_once_with(peer, record)

    def test_different_connection_domain_reuses_the_original_sni(self):
        self.seed()
        with patch.object(certs, "peer_protocol", return_value="trojan"), patch.object(certs, "issue") as issue, patch.object(certs, "migrate_peer") as migrate:
            record = certs.ensure_certificate("hysteria2", "acme-http", "other.example.com")
            self.assertEqual(record["sni"], "node.example.com")
            issue.assert_not_called()
            migrate.assert_called_once()

    def test_migration_removes_acme_and_preserves_other_configuration(self):
        original = 'listen: :443\n\nacme:\n  domains:\n    - "node.example.com"\n  email: "a@example.com"\n\nauth:\n  type: password\n  password: "retain-me"\n\nobfs:\n  type: salamander\n  salamander:\n    password: "obfs-secret"\n'
        migrated = certs.replace_hysteria_tls(original, certs.tls_block(self.seed()))
        self.assertNotIn("acme:", migrated)
        self.assertIn('password: "retain-me"', migrated)
        self.assertIn('password: "obfs-secret"', migrated)
        self.assertIn("listen: :443", migrated)
        self.assertEqual(migrated.count("tls:"), 1)

    def test_existing_dns_credentials_are_preserved_for_migration(self):
        path = self.root / "config.yaml"
        path.write_text('acme:\n  email: "a@example.com"\n  type: dns\n  dns:\n    name: cloudflare\n    config:\n      cloudflare_api_token: "private-token"\n')
        with patch.dict(certs.CONFIGS, hysteria2=path):
            settings = certs.legacy_settings("hysteria2", {"SIMPLEUI_TLS_MODE": "acme-dns"})
        self.assertEqual(settings["SIMPLEUI_DNS_PROVIDER"], "cloudflare")
        self.assertEqual(settings["SIMPLEUI_DNS_TOKEN"], "private-token")
        args, env = certs.dns_args(settings)
        self.assertEqual(args, ["--dns", "dns_cf"])
        self.assertEqual(env, {"CF_Token": "private-token"})

    def test_issuance_failure_does_not_stop_services_or_install_a_stale_certificate(self):
        record = self.seed()
        calls = []
        def run(args, **kwargs):
            calls.append([str(arg) for arg in args])
            return subprocess.CompletedProcess(args, 1 if "--issue" in args else 0)
        with patch.object(certs, "ACME", self.cert), patch.object(certs, "prepare_http"), patch.object(certs.common, "run", side_effect=run):
            with self.assertRaises(SystemExit):
                certs.issue(record, {})
        self.assertFalse(any("stop" in call or "--install-cert" in call for call in calls))
        self.assertEqual((self.shared / "current/fullchain.cer").read_bytes(), self.cert.read_bytes())

    def test_legacy_standalone_ecc_renewal_is_migrated_to_nginx(self):
        record = self.seed()
        acme = self.root / "acme.sh"
        acme.touch()
        directory = self.root / "node.example.com_ecc"
        directory.mkdir()
        (directory / "node.example.com.conf").write_text("Le_Webroot='no'\n")
        calls = []
        def run(args, **kwargs):
            calls.append([str(arg) for arg in args])
            return subprocess.CompletedProcess(args, 0)
        with patch.object(certs, "ACME", acme), patch.object(certs, "prepare_http"), patch.object(certs.common, "run", side_effect=run):
            certs.issue(record, {})
        issuance = next(call for call in calls if "--issue" in call)
        install = next(call for call in calls if "--install-cert" in call)
        self.assertIn("--force", issuance)
        self.assertIn("--nginx", issuance)
        self.assertIn("ec-256", issuance)
        self.assertIn("--ecc", install)
        self.assertIn("--reloadcmd", install)
        self.assertNotIn("--standalone", issuance)

    def test_renewal_validates_pair_before_replacing_it(self):
        self.seed()
        before = (self.shared / "current").resolve()
        incoming = self.shared / "incoming"
        incoming.mkdir()
        _, wrong = self.make_pair("node.example.com", "wrong")
        (incoming / "fullchain.cer").write_bytes(self.cert.read_bytes())
        (incoming / "private.key").write_bytes(wrong.read_bytes())
        (self.shared / "renew.json").write_text(json.dumps({"sni": "node.example.com"}))
        with self.assertRaises(AssertionError):
            exec(compile(certs.RENEW_SCRIPT, "renew.py", "exec"), {"__file__": str(self.shared / "renew.py")})
        self.assertEqual((self.shared / "current").resolve(), before)

    def test_renewal_restarts_both_consumers_even_if_one_restart_fails(self):
        self.seed()
        second, key = self.make_pair("node.example.com", "renewed")
        incoming = self.shared / "incoming"
        incoming.mkdir()
        (incoming / "fullchain.cer").write_bytes(second.read_bytes())
        (incoming / "private.key").write_bytes(key.read_bytes())
        (self.shared / "renew.json").write_text(json.dumps({"sni": "node.example.com"}))
        script = certs.RENEW_SCRIPT
        for protocol, config in [("hysteria2", "/etc/hysteria/config.yaml"), ("trojan", "/usr/src/trojan/server.conf")]:
            directory = self.root / protocol
            directory.mkdir()
            (directory / "managed.env").touch()
            target = directory / "config"
            target.write_text(str(self.shared / "current/fullchain.cer"))
            script = script.replace(config, str(target))
        calls = []
        original_run = subprocess.run
        def run(args, **kwargs):
            if args[0] != "systemctl":
                return original_run(args, **kwargs)
            calls.append(args)
            return subprocess.CompletedProcess(args, 1 if args[-1] == "hysteria-server.service" else 0)
        with patch.object(os, "chown"), patch.object(subprocess, "run", side_effect=run), self.assertRaises(SystemExit):
            exec(compile(script, "renew.py", "exec"), {"__file__": str(self.shared / "renew.py")})
        self.assertEqual(calls, [["systemctl", "try-restart", "hysteria-server.service"], ["systemctl", "try-restart", "trojan.service"]])
        self.assertEqual((self.shared / "current/fullchain.cer").read_bytes(), second.read_bytes())
        self.assertEqual((self.shared / "current/private.key").stat().st_mode & 0o007, 0)

    def test_deployment_lock_excludes_concurrent_process_requests(self):
        with patch.object(certs, "LOCK_PATH", self.root / "deployment.lock"):
            with certs.deployment_lock():
                with self.assertRaises(SystemExit), certs.deployment_lock():
                    self.fail("Concurrent deployment was allowed")
            with certs.deployment_lock():
                pass

    def test_failed_redeployment_restores_running_node_configuration(self):
        config = self.root / "config.yaml"
        config.write_text("original configuration")
        calls = []
        with patch.dict(certs.CONFIGS, hysteria2=config), patch.object(certs.common, "service_state", return_value="active"), patch.object(certs.common, "run", side_effect=lambda args, **kw: calls.append(args)), patch.object(os, "chown"):
            with self.assertRaises(RuntimeError), certs.deployment_transaction("hysteria2"):
                config.write_text("broken configuration")
                raise RuntimeError("restart failed")
        self.assertEqual(config.read_text(), "original configuration")
        self.assertIn(["systemctl", "restart", "hysteria-server.service"], calls)

    def test_uninstall_keeps_shared_renewal_dependencies(self):
        self.seed()
        path = pathlib.Path(__file__).with_name("uninstall.py")
        spec = importlib.util.spec_from_file_location("uninstall", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        events = []
        with patch.object(module, "cleanup_traffic_accounting"), patch.object(module.common, "read_env_file", return_value={"SIMPLEUI_INSTALLED_SERVICE": "0", "SIMPLEUI_HAD_ACME": "0", "SIMPLEUI_HAD_NGINX": "0"}), patch.object(module.os.path, "exists", return_value=True), patch.object(module.shutil, "copy2"), patch.object(module.common, "mkdir"), patch.object(module.common, "systemctl", side_effect=lambda *args: events.append(args)), patch.object(module.common, "run", side_effect=lambda args, **kw: events.append(args)), patch.object(module.common, "rm_rf", side_effect=lambda *args: events.append(args)):
            module.cleanup_trojan()
        self.assertFalse(any("--uninstall" in event or "/root/.acme.sh" in event or "nginx" in event for event in events))
        self.assertTrue(certs.STATE.exists())


if __name__ == "__main__":
    unittest.main()
