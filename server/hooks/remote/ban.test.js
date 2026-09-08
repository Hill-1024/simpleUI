import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("firewall unban scope and failure regressions", () => {
  const result = spawnSync("python3", ["-B", fileURLToPath(new URL("./ban_test.py", import.meta.url))], {
    encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
