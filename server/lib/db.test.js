import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function withTempDb(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "simpleui-db-test-"));
  const previousDataDir = process.env.SIMPLEUI_DATA_DIR;
  const previousDbPath = process.env.SIMPLEUI_DB_PATH;
  process.env.SIMPLEUI_DATA_DIR = dir;
  delete process.env.SIMPLEUI_DB_PATH;
  const db = await import(`./db.js?test=${Date.now()}-${Math.random()}`);
  try {
    await fn({ dir, db });
  } finally {
    db.closeDbForTests();
    if (previousDataDir === undefined) delete process.env.SIMPLEUI_DATA_DIR;
    else process.env.SIMPLEUI_DATA_DIR = previousDataDir;
    if (previousDbPath === undefined) delete process.env.SIMPLEUI_DB_PATH;
    else process.env.SIMPLEUI_DB_PATH = previousDbPath;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("loadDb imports legacy JSON into SQLite and keeps a backup", async () => {
  await withTempDb(async ({ dir, db }) => {
    await fs.writeFile(path.join(dir, "state.json"), JSON.stringify({
      meta: { version: 1, createdAt: "2026-05-09T00:00:00.000Z" },
      servers: [{ id: "srv-1", name: "Tokyo", hookToken: "secret" }],
      nodes: [],
      users: [],
      connections: [],
      remoteTraffic: [],
      bans: [],
      jobs: [],
      audit: [{ id: "audit-1", type: "legacy", message: "imported", createdAt: "2026-05-09T00:00:01.000Z" }]
    }));

    const state = await db.loadDb();
    assert.equal(state.meta.storage, "sqlite");
    assert.equal(state.meta.version, 2);
    assert.equal(state.servers[0].name, "Tokyo");
    assert.ok(await fs.stat(path.join(dir, "state.sqlite")));

    const backups = await fs.readdir(path.join(dir, "archive"));
    assert.ok(backups.some((item) => item.startsWith("state-json-imported-")));
  });
});

test("mutateDb serializes concurrent writes", async () => {
  await withTempDb(async ({ db }) => {
    await Promise.all(Array.from({ length: 25 }, async (_, index) => {
      await db.mutateDb((state) => {
        state.audit.push({
          id: `audit-${index}`,
          type: "test.write",
          message: `write ${index}`,
          createdAt: new Date(index).toISOString()
        });
      });
    }));

    const state = await db.loadDb();
    for (let index = 0; index < 25; index += 1) {
      assert.ok(state.audit.some((item) => item.id === `audit-${index}`));
    }
  });
});

test("retention caps high-volume collections", async () => {
  await withTempDb(async ({ db }) => {
    await db.saveDb({
      meta: { version: 2 },
      servers: [],
      nodes: [],
      users: [],
      connections: [],
      remoteTraffic: [],
      bans: [],
      jobs: Array.from({ length: 205 }, (_, index) => ({
        id: `job-${index}`,
        type: "test",
        title: `job ${index}`,
        createdAt: new Date(index).toISOString()
      })),
      audit: Array.from({ length: 1005 }, (_, index) => ({
        id: `audit-${index}`,
        type: "test",
        message: `audit ${index}`,
        createdAt: new Date(index).toISOString()
      }))
    });

    const state = await db.loadDb();
    assert.equal(state.jobs.length, 200);
    assert.equal(state.jobs[0].id, "job-5");
    assert.equal(state.audit.length, 1000);
    assert.equal(state.audit[0].id, "audit-5");
  });
});

test("public state filters server hook tokens", async () => {
  await withTempDb(async ({ db }) => {
    const publicView = db.publicState({
      servers: [{
        id: "srv-1",
        hookUrl: "https://example.test:37877",
        hookStatus: "online",
        hookToken: "secret",
        hookCertFingerprint: "abc",
        hookTlsError: "fingerprint-mismatch"
      }],
      nodes: [],
      users: [],
      connections: [],
      remoteTraffic: [],
      bans: [],
      jobs: [],
      audit: []
    });
    assert.equal(publicView.servers[0].hookToken, undefined);
    assert.equal(publicView.servers[0].hookCertFingerprint, undefined);
    assert.equal(publicView.servers[0].hookInstalled, true);
    assert.equal(publicView.servers[0].hookSecurity.pinned, true);
    assert.equal(publicView.servers[0].hookSecurity.mismatch, true);
  });
});
