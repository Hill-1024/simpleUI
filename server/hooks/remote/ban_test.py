import subprocess
import unittest
from unittest.mock import patch

import ban


class BanTest(unittest.TestCase):
    def test_unban_matches_exact_ip_port_protocol_and_drop_verdict(self):
        output = """table inet simpleui {
 chain input {
  meta l4proto tcp th dport 443 ip saddr 192.0.2.1 drop # handle 10
  meta l4proto tcp th dport 443 ip saddr 192.0.2.10 drop # handle 11
  meta l4proto tcp th dport 4433 ip saddr 192.0.2.1 drop # handle 12
  meta l4proto udp th dport 443 ip saddr 192.0.2.1 drop # handle 13
  ip saddr 192.0.2.1 tcp dport 443 drop # handle 14
  ip saddr 192.0.2.1 tcp dport 443 accept # handle 15
  ip saddr 192.0.2.0/24 tcp dport 443 drop # handle 16
  meta l4proto 6 tcp dport 443 ip saddr 192.0.2.1 drop # handle 17
 }
}"""
        with patch.object(ban.common, "command_exists", return_value=True), patch.object(ban.common, "capture", return_value=output), patch.object(ban.common, "run") as run:
            ban.remove_nft_rule("tcp", 4, "192.0.2.1", "443")
        self.assertEqual([call.args[0][-1] for call in run.call_args_list], ["10", "14", "17"])

    def test_unban_canonicalizes_ipv6_and_does_not_remove_other_nodes(self):
        output = """ip6 saddr 2001:db8::1 tcp dport 443 drop # handle 1
ip6 saddr 2001:db8::10 tcp dport 443 drop # handle 2
ip6 saddr 2001:db8::1 drop # handle 3
ip6 saddr 2001:db8::/64 tcp dport 443 drop # handle 4
"""
        with patch.object(ban.common, "command_exists", return_value=True), patch.object(ban.common, "capture", return_value=output), patch.object(ban.common, "run") as run:
            ban.remove_nft_rule("tcp", 6, "2001:0db8::1", "443")
            self.assertEqual([call.args[0][-1] for call in run.call_args_list], ["1"])
            run.reset_mock()
            ban.remove_nft_rule("tcp", 6, "2001:db8::1", None)
            self.assertEqual([call.args[0][-1] for call in run.call_args_list], ["3"])

    def test_nft_failure_does_not_report_a_successful_ban(self):
        def run(args, check=True, **kwargs):
            if "rule" in args and check:
                raise subprocess.CalledProcessError(1, args)
            return subprocess.CompletedProcess(args, 1 if "rule" in args else 0)
        with patch.object(ban.common, "command_exists", return_value=True), patch.object(ban.common, "run", side_effect=run):
            with self.assertRaises(subprocess.CalledProcessError):
                ban.add_nft_rule("tcp", 4, "192.0.2.1", "443")


if __name__ == "__main__":
    unittest.main()
