import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("API metadata edits preserve Hook trust and bulk bans validate every server before scheduling", { timeout: 20_000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "simpleui-api-test-"));
  const previousDir = process.env.SIMPLEUI_DATA_DIR;
  const previousPath = process.env.SIMPLEUI_DB_PATH;
  process.env.SIMPLEUI_DATA_DIR = directory;
  delete process.env.SIMPLEUI_DB_PATH;
  const db = await import("./lib/db.js");
  let child;
  try {
    const server = {
      id: "server-one", name: "Original", host: "node.example.com", port: 22,
      hookPort: 37877, hookUrl: "https://node.example.com:37877",
      hookToken: "test-token", hookCertFingerprint: "a".repeat(64), hookTlsError: "fingerprint-mismatch"
    };
    await db.saveDb({ servers: [server] });
    db.closeDbForTests();
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    child = spawn(process.execPath, [fileURLToPath(new URL("./index.js", import.meta.url))], {
      env: { ...process.env, NODE_ENV: "development", SIMPLEUI_HOST: "127.0.0.1", PORT: String(port),
        SIMPLEUI_AUTH_DISABLED: "1", SIMPLEUI_SYNC_INTERVAL_MS: "0" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error(`API startup timed out: ${output}`)), 10_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`API exited (${code}): ${output}`)); });
      const collect = (chunk) => {
        output += chunk;
        if (output.includes("SimpleUI API listening")) { clearTimeout(timer); resolve(); }
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
    });
    const update = async (patch) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/servers/${server.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch)
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    for (const host of [server.host, "NODE.example.com."]) {
      const result = await update({ name: "Renamed", group: "New group", host, port: 2222, hookPort: "37877" });
      assert.equal(result.server.hookSecurity.pinned, true);
      const saved = (await db.loadDb()).servers[0];
      assert.equal(saved.hookCertFingerprint, server.hookCertFingerprint);
      assert.equal(saved.hookTlsError, server.hookTlsError);
    }
    const changed = await update({ hookPort: 37878 });
    assert.equal(changed.server.hookSecurity.pinned, false);
    assert.equal((await db.loadDb()).servers[0].hookTlsError, "");

    await db.mutateDb((state) => {
      state.servers = [
        { ...server, hookUrl: "http://127.0.0.1:1", hookStatus: "online" },
        { ...server, id: "server-offline", hookStatus: "unreachable" }
      ];
      state.nodes = [
        { id: "node-online", serverId: server.id, name: "Online", protocol: "hysteria2" },
        { id: "node-offline", serverId: "server-offline", name: "Offline", protocol: "hysteria2" },
        { id: "node-orphan", serverId: "missing", name: "Orphan", protocol: "hysteria2" }
      ];
    });
    for (const action of ["ban", "unban"]) {
      for (const [nodeId, status] of [["node-offline", 409], ["node-orphan", 404]]) {
        const response = await fetch(`http://127.0.0.1:${port}/api/hooks/${action}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetIp: "192.0.2.1", nodeIds: ["node-online", nodeId] })
        });
        assert.equal(response.status, status);
        assert.deepEqual((await db.loadDb()).jobs, [], "A rejected batch must not leave hidden remote jobs");
      }
    }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    db.closeDbForTests();
    if (previousDir === undefined) delete process.env.SIMPLEUI_DATA_DIR;
    else process.env.SIMPLEUI_DATA_DIR = previousDir;
    if (previousPath === undefined) delete process.env.SIMPLEUI_DB_PATH;
    else process.env.SIMPLEUI_DB_PATH = previousPath;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
