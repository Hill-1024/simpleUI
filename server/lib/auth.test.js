import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const AUTH_COOKIE = "simpleui_session";

async function withAuthDb(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "simpleui-auth-test-"));
  const previousDataDir = process.env.SIMPLEUI_DATA_DIR;
  const previousDbPath = process.env.SIMPLEUI_DB_PATH;
  process.env.SIMPLEUI_DATA_DIR = dir;
  delete process.env.SIMPLEUI_DB_PATH;
  const auth = await import(`./auth.js?auth=${Date.now()}-${Math.random()}`);
  const db = await import("./db.js");
  try {
    await fn({ auth, db });
  } finally {
    db.closeDbForTests();
    if (previousDataDir === undefined) delete process.env.SIMPLEUI_DATA_DIR;
    else process.env.SIMPLEUI_DATA_DIR = previousDataDir;
    if (previousDbPath === undefined) delete process.env.SIMPLEUI_DB_PATH;
    else process.env.SIMPLEUI_DB_PATH = previousDbPath;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function reqWithCookie(token) {
  return {
    headers: {
      cookie: `${AUTH_COOKIE}=${encodeURIComponent(token)}`
    }
  };
}

test("auth bootstrap creates one UUID password and preserves it", async () => {
  await withAuthDb(async ({ auth }) => {
    const first = await auth.ensureAuthInitialized();
    const second = await auth.ensureAuthInitialized();
    assert.equal(first.created, true);
    assert.match(first.initialPassword, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(second, { created: false });
  });
});

test("login, authenticate, change password, and logout lifecycle", async () => {
  await withAuthDb(async ({ auth }) => {
    const initial = await auth.ensureAuthInitialized();
    assert.equal((await auth.loginWithPassword("wrong")).ok, false);

    const login = await auth.loginWithPassword(initial.initialPassword);
    assert.equal(login.ok, true);
    const session = await auth.authenticateRequest(reqWithCookie(login.token));
    assert.ok(session?.tokenHash);

    const changed = await auth.changePassword({
      tokenHash: session.tokenHash,
      currentPassword: initial.initialPassword,
      newPassword: "new-password-123"
    });
    assert.equal(changed.ok, true);
    assert.equal((await auth.loginWithPassword(initial.initialPassword)).ok, false);
    assert.equal((await auth.loginWithPassword("new-password-123")).ok, true);

    await auth.logoutSession(login.token);
    assert.equal(await auth.authenticateRequest(reqWithCookie(login.token)), null);
  });
});
