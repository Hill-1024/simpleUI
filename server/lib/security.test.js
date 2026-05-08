import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAllowedOrigins,
  collectNodeSecrets,
  isTrustedBrowserRequest,
  isValidServerHost,
  isValidUserPassword,
  isValidUsername,
  sanitizeNodeSecrets
} from "./security.js";

function request({ method = "POST", origin, referer, host = "127.0.0.1:8787" } = {}) {
  return {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      ...(referer ? { referer } : {}),
      host
    }
  };
}

test("origin guard trusts same-host and configured UI origins only", () => {
  const allowed = buildAllowedOrigins({
    host: "127.0.0.1",
    port: 8787,
    includeDevOrigins: true
  });

  assert.equal(isTrustedBrowserRequest(request({ origin: "http://127.0.0.1:8787" }), allowed), true);
  assert.equal(isTrustedBrowserRequest(request({ origin: "http://127.0.0.1:5173" }), allowed), true);
  assert.equal(isTrustedBrowserRequest(request({ origin: "https://evil.example" }), allowed), false);
  assert.equal(isTrustedBrowserRequest(request({ referer: "https://evil.example/page" }), allowed), false);
  assert.equal(isTrustedBrowserRequest(request({ origin: "http://panel.example:8787", host: "panel.example:8787" }), allowed), true);
});

test("server host validation rejects URL and host:port forms", () => {
  assert.equal(isValidServerHost("example.com"), true);
  assert.equal(isValidServerHost("127.0.0.1"), true);
  assert.equal(isValidServerHost("[2001:db8::1]"), true);
  assert.equal(isValidServerHost("http://example.com"), false);
  assert.equal(isValidServerHost("example.com:22"), false);
  assert.equal(isValidServerHost("example.com/path"), false);
});

test("hook user serialization rejects record separators", () => {
  assert.equal(isValidUsername("alice"), true);
  assert.equal(isValidUsername("alice:admin"), false);
  assert.equal(isValidUsername("alice admin"), false);
  assert.equal(isValidUserPassword("safe:password"), true);
  assert.equal(isValidUserPassword("bad|extra"), false);
  assert.equal(isValidUserPassword("bad\nextra"), false);
});

test("node secrets are redacted from persisted and public state", () => {
  const node = {
    name: "node-1",
    dnsToken: "dns-secret",
    obfsPassword: "obfs-secret",
    domain: "example.com"
  };
  assert.deepEqual(sanitizeNodeSecrets(node), {
    name: "node-1",
    domain: "example.com"
  });
  assert.deepEqual(collectNodeSecrets(node), ["dns-secret", "obfs-secret"]);
});
