import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContentSecurityPolicy,
  buildAllowedOrigins,
  collectNodeSecrets,
  isTrustedBrowserRequest,
  isValidServerHost,
  isValidUserPassword,
  isValidUsername,
  normalizeIpTarget,
  sanitizeNodeSecrets
} from "./security.js";

function request({
  method = "POST",
  origin,
  referer,
  host = "127.0.0.1:8787",
  forwardedHost,
  forwarded,
  secFetchSite
} = {}) {
  return {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      ...(referer ? { referer } : {}),
      ...(forwardedHost ? { "x-forwarded-host": forwardedHost } : {}),
      ...(forwarded ? { forwarded } : {}),
      ...(secFetchSite ? { "sec-fetch-site": secFetchSite } : {}),
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

test("origin guard can trust forwarded hosts only when proxy trust is enabled", () => {
  const allowed = buildAllowedOrigins({ host: "127.0.0.1", port: 8787 });
  const proxied = request({
    origin: "https://panel.example",
    referer: "https://panel.example/#/servers",
    host: "127.0.0.1:8787",
    forwardedHost: "panel.example"
  });

  assert.equal(isTrustedBrowserRequest(proxied, allowed), false);
  assert.equal(isTrustedBrowserRequest(proxied, allowed, { trustProxy: true }), true);
  assert.equal(
    isTrustedBrowserRequest(request({ origin: "https://evil.example", forwardedHost: "panel.example" }), allowed, { trustProxy: true }),
    false
  );
});

test("origin guard accepts proxied same-origin browser posts without forwarded host", () => {
  const allowed = buildAllowedOrigins({ host: "127.0.0.1", port: 8787 });
  const syncButtonPost = request({
    origin: "https://panel.example",
    referer: "https://panel.example/#/overview",
    host: "127.0.0.1:8787",
    secFetchSite: "same-origin"
  });

  assert.equal(isTrustedBrowserRequest(syncButtonPost, allowed), true);
  assert.equal(isTrustedBrowserRequest(request({ origin: "https://evil.example", secFetchSite: "cross-site" }), allowed), false);
});

test("origin guard accepts remote Vite dev frontend ports only when enabled", () => {
  const allowed = buildAllowedOrigins({ host: "127.0.0.1", port: 8787 });
  const remoteDevPost = request({
    origin: "http://192.0.2.10:5173",
    referer: "http://192.0.2.10:5173/#/overview",
    host: "127.0.0.1:8787"
  });

  assert.equal(isTrustedBrowserRequest(remoteDevPost, allowed), false);
  assert.equal(isTrustedBrowserRequest(remoteDevPost, allowed, { devOriginPorts: [5173, 5174] }), true);
  assert.equal(
    isTrustedBrowserRequest(request({ origin: "http://192.0.2.10:8788" }), allowed, { devOriginPorts: [5173, 5174] }),
    false
  );
});

test("origin guard understands standard Forwarded host when proxy trust is enabled", () => {
  const allowed = buildAllowedOrigins({ host: "127.0.0.1", port: 8787 });
  const proxied = request({
    origin: "https://panel.example",
    referer: "https://panel.example/#/overview",
    host: "127.0.0.1:8787",
    forwarded: 'for=192.0.2.1;proto=https;host="panel.example"'
  });

  assert.equal(isTrustedBrowserRequest(proxied, allowed), false);
  assert.equal(isTrustedBrowserRequest(proxied, allowed, { trustProxy: true }), true);
});

test("server host validation rejects URL and host:port forms", () => {
  assert.equal(isValidServerHost("example.com"), true);
  assert.equal(isValidServerHost("127.0.0.1"), true);
  assert.equal(isValidServerHost("[2001:db8::1]"), true);
  assert.equal(isValidServerHost("http://example.com"), false);
  assert.equal(isValidServerHost("example.com:22"), false);
  assert.equal(isValidServerHost("example.com/path"), false);
});

test("IP target normalization accepts host:port and mapped IPv4 CIDR", () => {
  assert.deepEqual(normalizeIpTarget("203.0.113.4:443"), { value: "203.0.113.4", family: 4 });
  assert.deepEqual(normalizeIpTarget("[2001:db8::1]/64"), { value: "2001:db8::1/64", family: 6 });
  assert.deepEqual(normalizeIpTarget("::ffff:192.0.2.10/120"), { value: "192.0.2.10/24", family: 4 });
  assert.equal(normalizeIpTarget("192.0.2.10/40"), null);
  assert.equal(normalizeIpTarget("not-an-ip"), null);
});

test("CSP limits executable sources while allowing remote IPQuality reports in frames", () => {
  const csp = buildContentSecurityPolicy();
  assert.deepEqual(csp.directives["script-src"], ["'self'"]);
  assert.deepEqual(csp.directives["object-src"], ["'none'"]);
  assert.deepEqual(csp.directives["frame-ancestors"], ["'none'"]);
  assert.deepEqual(csp.directives["frame-src"], ["https:"]);
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
