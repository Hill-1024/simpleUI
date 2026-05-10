import { isIP } from "node:net";

const HOSTNAME_RE = /^(?=.{1,253}\.?$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.?$/;
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);
const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const SENSITIVE_NODE_FIELDS = [
  "dnsToken",
  "obfsPassword"
];

export function stripBracketedHost(host) {
  const value = String(host || "").trim();
  if (value.startsWith("[") && value.includes("]")) {
    const close = value.indexOf("]");
    if (close === value.length - 1) return value.slice(1, close);
  }
  return value;
}

export function isWildcardBindHost(host) {
  return WILDCARD_HOSTS.has(String(host || "").trim().toLowerCase());
}

export function isLoopbackBindHost(host) {
  const clean = stripBracketedHost(host).toLowerCase();
  if (LOOPBACK_NAMES.has(clean)) return true;
  if (isIP(clean) === 4 && clean.startsWith("127.")) return true;
  return clean === "::1";
}

export function isValidServerHost(host) {
  const value = String(host || "").trim();
  if (!value || value.length > 253) return false;
  if (/[\s/@?#\\]/.test(value)) return false;

  if (value.startsWith("[")) {
    if (!value.endsWith("]")) return false;
    return isIP(stripBracketedHost(value)) === 6;
  }

  if (isIP(value)) return true;
  if (value.includes(":")) return false;
  return HOSTNAME_RE.test(value);
}

export function isValidUsername(value) {
  return /^[^\s:|]{1,64}$/.test(String(value || ""));
}

export function isValidUserPassword(value) {
  const text = String(value || "");
  return text.length >= 1 && text.length <= 256 && !/[\r\n|]/.test(text);
}

export function hasNoControlChars(value) {
  return !/[\u0000-\u001f\u007f]/.test(String(value || ""));
}

export function hasNoShellControlChars(value) {
  return !/[\u0000\u007f]/.test(String(value || ""));
}

export function normalizeIpTarget(value) {
  let raw = String(value || "").trim();
  if (raw.startsWith("[") && raw.includes("]")) {
    const host = raw.slice(1, raw.indexOf("]"));
    const suffix = raw.slice(raw.indexOf("]") + 1);
    raw = suffix.startsWith("/") ? `${host}${suffix}` : host;
  } else if (raw.includes(".") && raw.split(":").length === 2) {
    raw = raw.split(":")[0];
  }
  let [address, prefix] = raw.split("/");
  let family = isIP(address);
  if (!family) return null;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) {
    const mapped = address.slice(7);
    if (isIP(mapped) === 4) {
      address = mapped;
      family = 4;
      if (prefix !== undefined) {
        const mappedPrefix = Number(prefix);
        if (!Number.isInteger(mappedPrefix) || mappedPrefix < 96 || mappedPrefix > 128) return null;
        prefix = String(mappedPrefix - 96);
      }
    }
  }
  if (prefix !== undefined) {
    if (!/^\d+$/.test(prefix)) return null;
    const length = Number(prefix);
    if ((family === 4 && length > 32) || (family === 6 && length > 128)) return null;
    raw = `${address}/${length}`;
  } else {
    raw = address;
  }
  return { value: raw, family };
}

function originHost(host) {
  const clean = stripBracketedHost(host);
  return isIP(clean) === 6 ? `[${clean}]` : clean;
}

function addOrigin(origins, protocol, host, port) {
  if (!host || !port) return;
  const normalizedProtocol = protocol.endsWith(":") ? protocol : `${protocol}:`;
  origins.add(`${normalizedProtocol}//${originHost(host)}:${port}`);
}

export function parseAllowedOrigins(value = "") {
  const origins = new Set();
  for (const item of String(value).split(",")) {
    const clean = item.trim();
    if (!clean) continue;
    try {
      const parsed = new URL(clean);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        origins.add(parsed.origin);
      }
    } catch {
      // Invalid operator-provided origins are ignored instead of widening trust.
    }
  }
  return origins;
}

export function buildAllowedOrigins({ host, port, includeDevOrigins = false, extraOrigins = "" } = {}) {
  const origins = parseAllowedOrigins(extraOrigins);
  const cleanHost = stripBracketedHost(host);
  if (cleanHost && !isWildcardBindHost(cleanHost)) {
    addOrigin(origins, "http:", cleanHost, port);
  }

  if (!cleanHost || isWildcardBindHost(cleanHost) || isLoopbackBindHost(cleanHost)) {
    for (const loopback of ["127.0.0.1", "localhost", "::1"]) {
      addOrigin(origins, "http:", loopback, port);
    }
  }

  if (includeDevOrigins) {
    for (let devPort = 5173; devPort <= 5180; devPort += 1) {
      addOrigin(origins, "http:", "127.0.0.1", devPort);
      addOrigin(origins, "http:", "localhost", devPort);
      addOrigin(origins, "http:", "::1", devPort);
    }
  }

  return origins;
}

function parseHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  const parsed = parseHttpUrl(origin);
  return Boolean(parsed && allowedOrigins.has(parsed.origin));
}

export function isSameHostOrigin(origin, hostHeader) {
  const parsed = parseHttpUrl(origin);
  const host = String(hostHeader || "").split(",")[0].trim();
  return Boolean(parsed && host && parsed.host === host);
}

function splitHeaderValues(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanForwardedValue(value) {
  const clean = String(value || "").trim();
  if (clean.startsWith('"') && clean.endsWith('"')) return clean.slice(1, -1);
  return clean;
}

function forwardedHosts(req) {
  const headers = req?.headers || {};
  const hosts = [
    ...splitHeaderValues(headers["x-forwarded-host"]),
    ...splitHeaderValues(headers["x-original-host"]),
    ...splitHeaderValues(headers["x-host"])
  ];
  for (const entry of splitHeaderValues(headers.forwarded)) {
    for (const pair of entry.split(";")) {
      const [rawKey, ...rawValue] = pair.split("=");
      if (rawKey?.trim().toLowerCase() === "host") {
        const host = cleanForwardedValue(rawValue.join("="));
        if (host) hosts.push(host);
      }
    }
  }
  return [...new Set(hosts)];
}

function hasSameOriginFetchMetadata(req) {
  return String(req?.headers?.["sec-fetch-site"] || "").toLowerCase() === "same-origin";
}

function isDevFrontendOrigin(origin, ports = []) {
  const parsed = parseHttpUrl(origin);
  if (!parsed) return false;
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  return ports.includes(port);
}

export function isUnsafeMethod(method) {
  return UNSAFE_METHODS.has(String(method || "").toUpperCase());
}

export function isTrustedBrowserRequest(req, allowedOrigins, { trustProxy = false, devOriginPorts = [] } = {}) {
  const origin = req.headers.origin;
  const sameHost = (value) =>
    isSameHostOrigin(value, req.headers.host) ||
    (trustProxy && forwardedHosts(req).some((host) => isSameHostOrigin(value, host)));

  if (origin) {
    return isAllowedOrigin(origin, allowedOrigins) || isDevFrontendOrigin(origin, devOriginPorts) || sameHost(origin) || hasSameOriginFetchMetadata(req);
  }

  const referer = req.headers.referer;
  if (!referer) return true;
  const parsed = parseHttpUrl(referer);
  if (!parsed) return false;
  return allowedOrigins.has(parsed.origin) || isDevFrontendOrigin(parsed.origin, devOriginPorts) || sameHost(parsed.origin) || hasSameOriginFetchMetadata(req);
}

export function buildContentSecurityPolicy() {
  return {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "frame-src": ["https:"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"]
    }
  };
}

export function sanitizeNodeSecrets(node = {}) {
  const next = { ...node };
  for (const field of SENSITIVE_NODE_FIELDS) {
    delete next[field];
  }
  return next;
}

export function collectNodeSecrets(node = {}) {
  return SENSITIVE_NODE_FIELDS
    .map((field) => node[field])
    .filter((value) => value !== undefined && value !== null && String(value).length > 0);
}
