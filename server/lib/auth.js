import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { appendAudit, loadDb, mutateDb } from "./db.js";

export const AUTH_COOKIE = "simpleui_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function now() {
  return new Date().toISOString();
}

function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${digest}`;
}

function verifyPassword(password, encoded = "") {
  const [algorithm, salt, expected] = String(encoded).split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actual, expectedBuffer);
}

function tokenHash(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function pruneSessions(auth, timestamp = Date.now()) {
  auth.sessions = (auth.sessions || []).filter((session) => new Date(session.expiresAt).getTime() > timestamp);
}

export function parseCookies(req) {
  const cookies = {};
  for (const item of String(req.headers.cookie || "").split(";")) {
    const clean = item.trim();
    if (!clean) continue;
    const index = clean.indexOf("=");
    const key = index === -1 ? clean : clean.slice(0, index);
    const rawValue = index === -1 ? "" : clean.slice(index + 1);
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }
  return cookies;
}

export function shouldUseSecureCookie(req) {
  return req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

export function setSessionCookie(res, token, req) {
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (shouldUseSecureCookie(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res, req) {
  const parts = [
    `${AUTH_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0"
  ];
  if (shouldUseSecureCookie(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export async function ensureAuthInitialized() {
  return mutateDb((state) => {
    state.meta = state.meta || {};
    if (state.meta.auth?.passwordHash) {
      state.meta.auth.sessions = state.meta.auth.sessions || [];
      return { created: false };
    }

    const initialPassword = randomUUID();
    const timestamp = now();
    state.meta.auth = {
      passwordHash: passwordHash(initialPassword),
      sessions: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      passwordChangedAt: null
    };
    appendAudit(state, "auth.init", "Initial WebUI password generated");
    return { created: true, initialPassword };
  });
}

export async function authenticateRequest(req) {
  const token = parseCookies(req)[AUTH_COOKIE];
  if (!token) return null;
  const hash = tokenHash(token);
  const state = await loadDb();
  const auth = state.meta?.auth;
  if (!auth?.passwordHash) return null;
  const session = (auth.sessions || []).find((item) => item.tokenHash === hash);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return { sessionId: session.id, tokenHash: hash };
}

export async function loginWithPassword(password) {
  let token = "";
  return mutateDb((state) => {
    const auth = state.meta?.auth;
    if (!auth?.passwordHash || !verifyPassword(password, auth.passwordHash)) {
      return { ok: false };
    }

    const timestamp = Date.now();
    pruneSessions(auth, timestamp);
    token = randomBytes(32).toString("hex");
    const createdAt = now();
    auth.sessions.push({
      id: randomUUID(),
      tokenHash: tokenHash(token),
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: new Date(timestamp + SESSION_TTL_MS).toISOString()
    });
    auth.updatedAt = createdAt;
    appendAudit(state, "auth.login", "WebUI login succeeded");
    return { ok: true, token };
  });
}

export async function logoutSession(token) {
  if (!token) return;
  const hash = tokenHash(token);
  await mutateDb((state) => {
    const auth = state.meta?.auth;
    if (!auth) return;
    auth.sessions = (auth.sessions || []).filter((session) => session.tokenHash !== hash);
    auth.updatedAt = now();
  });
}

export async function changePassword({ tokenHash: currentTokenHash, currentPassword, newPassword }) {
  return mutateDb((state) => {
    const auth = state.meta?.auth;
    if (!auth?.passwordHash || !verifyPassword(currentPassword, auth.passwordHash)) {
      return { ok: false, error: "Current password is incorrect" };
    }

    const timestamp = now();
    auth.passwordHash = passwordHash(newPassword);
    auth.passwordChangedAt = timestamp;
    auth.updatedAt = timestamp;
    auth.sessions = (auth.sessions || []).filter((session) => session.tokenHash === currentTokenHash);
    appendAudit(state, "auth.password-change", "WebUI password changed");
    return { ok: true };
  });
}
