import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createJob, recoverInterruptedJobs } from "./jobs.js";
import { closeDb, loadDb } from "./db.js";

test("concurrent deployments are serialized per server and recover after panel restart", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "simpleui-queue-test-"));
  const previous = process.env.SIMPLEUI_DATA_DIR;
  const previousPath = process.env.SIMPLEUI_DB_PATH;
  process.env.SIMPLEUI_DATA_DIR = directory;
  delete process.env.SIMPLEUI_DB_PATH;
  try {
    const create = (protocol, serverId = "one") => createJob({ type: "deploy", title: protocol, payload: { serverId, node: { protocol } } });
    const results = await Promise.allSettled([create("hysteria2"), create("trojan")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
    await create("trojan", "two");
    assert.equal((await loadDb()).jobs.length, 2);
    await recoverInterruptedJobs();
    assert.ok((await loadDb()).jobs.every((job) => job.status === "failed" && job.error.includes("结果未知")));
    await create("trojan");
  } finally {
    closeDb();
    if (previous === undefined) delete process.env.SIMPLEUI_DATA_DIR;
    else process.env.SIMPLEUI_DATA_DIR = previous;
    if (previousPath === undefined) delete process.env.SIMPLEUI_DB_PATH;
    else process.env.SIMPLEUI_DB_PATH = previousPath;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
