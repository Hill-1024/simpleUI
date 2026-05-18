import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hookPath = fileURLToPath(new URL("./hysteria2-deploy.py", import.meta.url));

function isRunEventForScript(event, scriptName) {
  return event[0] === "run" && event[1] === "bash" && event[2]?.split(/[\\/]/).at(-1) === scriptName;
}

function runPythonSnippet(source) {
  const result = spawnSync("python3", ["-", hookPath], {
    input: source,
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test("Hysteria2 port hopping appends NAT PREROUTING rules with action before chain", () => {
  const output = runPythonSnippet(String.raw`
import importlib.util
import json
import pathlib
import sys

hook_path = sys.argv[1]
sys.path.insert(0, str(pathlib.Path(hook_path).parent))
spec = importlib.util.spec_from_file_location("hysteria2_deploy", hook_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

calls = []

class Result:
    def __init__(self, returncode):
        self.returncode = returncode

def fake_run(args, **kwargs):
    calls.append([str(item) for item in args])
    return Result(1 if len(calls) == 1 else 0)

module.common.run = fake_run
module.add_iptables_rule("iptables", "eth0", 1111, 1234, 443)
print(json.dumps(calls))
`);

  assert.deepEqual(JSON.parse(output), [
    ["iptables", "-t", "nat", "-C", "PREROUTING", "-i", "eth0", "-p", "udp", "--dport", "1111:1234", "-j", "REDIRECT", "--to-ports", "443"],
    ["iptables", "-t", "nat", "-A", "PREROUTING", "-i", "eth0", "-p", "udp", "--dport", "1111:1234", "-j", "REDIRECT", "--to-ports", "443"]
  ]);
});

test("Hysteria2 port hopping does not append duplicate NAT rules", () => {
  const output = runPythonSnippet(String.raw`
import importlib.util
import json
import pathlib
import sys

hook_path = sys.argv[1]
sys.path.insert(0, str(pathlib.Path(hook_path).parent))
spec = importlib.util.spec_from_file_location("hysteria2_deploy", hook_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

calls = []

class Result:
    returncode = 0

def fake_run(args, **kwargs):
    calls.append([str(item) for item in args])
    return Result()

module.common.run = fake_run
module.add_iptables_rule("ip6tables", "eth0", 1111, 1234, 443)
print(json.dumps(calls))
`);

  assert.deepEqual(JSON.parse(output), [
    ["ip6tables", "-t", "nat", "-C", "PREROUTING", "-i", "eth0", "-p", "udp", "--dport", "1111:1234", "-j", "REDIRECT", "--to-ports", "443"]
  ]);
});

test("Hysteria2 installer repairs missing systemd service files when binary exists", () => {
  const output = runPythonSnippet(String.raw`
import importlib.util
import json
import pathlib
import sys

hook_path = sys.argv[1]
sys.path.insert(0, str(pathlib.Path(hook_path).parent))
spec = importlib.util.spec_from_file_location("hysteria2_deploy", hook_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

events = []
service_checks = iter([False, True])

class Result:
    returncode = 0

def record(kind, value):
    events.append([kind, str(value)])

module.hysteria_binary_exists = lambda: True
module.hysteria_service_units_exist = lambda: next(service_checks, True)
module.common.mkdir = lambda path, mode=None: record("mkdir", path)
module.common.mark_protocol = lambda protocol: record("mark", protocol)
module.common.download = lambda url, target, *args, **kwargs: events.append(["download", url, str(target)])
module.common.chmod = lambda path, mode: events.append(["chmod", str(path), oct(mode)])
module.common.log = lambda message: record("log", message)
module.common.run = lambda args, **kwargs: events.append(["run", *[str(item) for item in args]]) or Result()

installed_core = module.install_upstream_flow()
print(json.dumps({"installed_core": installed_core, "events": events}))
`);

  const result = JSON.parse(output);
  assert.equal(result.installed_core, "0");
  assert.ok(result.events.some((event) => event[0] === "log" && event[1].includes("service files are missing")));
  assert.ok(result.events.some((event) => event[0] === "download" && event[1] === "https://get.hy2.sh/"));
  assert.ok(result.events.some((event) => isRunEventForScript(event, "get-hy2.sh")));
});

test("Hysteria2 installer skips official core installer only when binary and services exist", () => {
  const output = runPythonSnippet(String.raw`
import importlib.util
import json
import pathlib
import sys

hook_path = sys.argv[1]
sys.path.insert(0, str(pathlib.Path(hook_path).parent))
spec = importlib.util.spec_from_file_location("hysteria2_deploy", hook_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

events = []

class Result:
    returncode = 0

def record(kind, value):
    events.append([kind, str(value)])

module.hysteria_binary_exists = lambda: True
module.hysteria_service_units_exist = lambda: True
module.common.mkdir = lambda path, mode=None: record("mkdir", path)
module.common.mark_protocol = lambda protocol: record("mark", protocol)
module.common.download = lambda url, target, *args, **kwargs: events.append(["download", url, str(target)])
module.common.chmod = lambda path, mode: events.append(["chmod", str(path), oct(mode)])
module.common.log = lambda message: record("log", message)
module.common.run = lambda args, **kwargs: events.append(["run", *[str(item) for item in args]]) or Result()

installed_core = module.install_upstream_flow()
print(json.dumps({"installed_core": installed_core, "events": events}))
`);

  const result = JSON.parse(output);
  assert.equal(result.installed_core, "0");
  assert.ok(result.events.some((event) => event[0] === "log" && event[1] === "Hysteria2 core already present"));
  assert.equal(result.events.some((event) => event[0] === "download" && event[1] === "https://get.hy2.sh/"), false);
});
