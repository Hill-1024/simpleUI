import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHookUpgradeBundleB64,
  buildInstallAgentScript,
  hookFingerprintMatches,
  isLegacyHookActionAllowed,
  isLegacyHookTransport,
  normalizeHookFingerprint
} from "./hook-agent.js";

test("hook certificate fingerprints normalize and compare safely", () => {
  assert.equal(normalizeHookFingerprint("AA:bb cc"), "aabbcc");
  assert.equal(hookFingerprintMatches("AA:BB:CC", "aabbcc"), true);
  assert.equal(hookFingerprintMatches("AA:BB:CC", "aabbcd"), false);
  assert.equal(hookFingerprintMatches("", "aabbcc"), false);
});

test("legacy HTTP hooks may only use upgrade transport actions", () => {
  assert.equal(isLegacyHookTransport({ hookUrl: "http://203.0.113.10:37877", hookCertFingerprint: "" }), true);
  assert.equal(isLegacyHookTransport({ hookUrl: "https://203.0.113.10:37877", hookCertFingerprint: "aa" }), false);
  assert.equal(isLegacyHookActionAllowed("upgrade-agent"), true);
  assert.equal(isLegacyHookActionAllowed("deploy"), false);
  assert.equal(isLegacyHookActionAllowed("exec"), false);
});

test("install agent script preserves an existing server-bound token", async () => {
  const script = await buildInstallAgentScript();
  assert.match(script, /existing_hook_token/);
  assert.match(script, /__SIMPLEUI_SECRET_RESULT__/);
  assert.match(script, /tokenReused/);
  assert.doesNotMatch(script, /SIMPLEUI_HOOK_TOKENS/);
});

test("install agent script uses dual-stack bind with IPv4 fallback", async () => {
  const script = await buildInstallAgentScript();
  assert.ok(script.includes("SIMPLEUI_HOOK_BIND=${SIMPLEUI_HOOK_BIND:-::}"));
  assert.match(script, /make_server\("0\.0\.0\.0"\)/);
  assert.match(script, /run_hook_coalesced/);
  assert.match(script, /rm -f "\$HOOK_DIR"\/\*\.sh/);
});

test("hook bundle deploys native Python protocol hooks", async () => {
  const bundle = JSON.parse(Buffer.from(await buildHookUpgradeBundleB64(), "base64").toString("utf8"));
  const names = bundle.hooks.map((item) => item.name);
  assert.ok(names.includes("common.py"));
  assert.ok(names.includes("hysteria2-deploy.py"));
  assert.ok(names.includes("trojan-deploy.py"));
  assert.ok(names.includes("server-status.py"));
  assert.ok(names.includes("status.py"));
  assert.ok(names.includes("exec.py"));
  assert.ok(names.includes("agent-upgrade.py"));
  assert.equal(names.some((name) => name.endsWith(".sh")), false);
  assert.equal(names.includes("hysteria2-deploy.sh"), false);
  assert.equal(names.includes("trojan-deploy.sh"), false);
  assert.match(bundle.agent, /"deploy": \{"hysteria2": "hysteria2-deploy\.py", "trojan": "trojan-deploy\.py"\}/);
  assert.match(bundle.agent, /\["python3", "-I", "-B", "-c", PYTHON_RUNNER, HOOK_DIR, hook_path\]/);
  assert.match(bundle.agent, /if not key\.startswith\("PYTHON"\)/);
});
