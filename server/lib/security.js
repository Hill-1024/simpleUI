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
  return Boolean(parsed && hostHeader && parsed.host === String(hostHeader));
}

export function isUnsafeMethod(method) {
  return UNSAFE_METHODS.has(String(method || "").toUpperCase());
}

export function isTrustedBrowserRequest(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (origin) {
    return isAllowedOrigin(origin, allowedOrigins) || isSameHostOrigin(origin, req.headers.host);
  }

  const referer = req.headers.referer;
  if (!referer) return true;
  const parsed = parseHttpUrl(referer);
  if (!parsed) return false;
  return allowedOrigins.has(parsed.origin) || isSameHostOrigin(parsed.origin, req.headers.host);
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
