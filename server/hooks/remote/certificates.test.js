import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("shared certificate lifecycle and migration regressions", { skip: process.platform === "win32" ? "Remote hooks require POSIX (tested on Linux/macOS)" : false }, () => {
  // macOS ships LibreSSL; the remote hooks target Linux OpenSSL.
  const openssl = ["/opt/homebrew/opt/openssl@3/bin", "/usr/local/opt/openssl@3/bin"].find((directory) => existsSync(`${directory}/openssl`));
  const result = spawnSync("python3", ["-B", fileURLToPath(new URL("./certificates_test.py", import.meta.url))], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${openssl ? `${openssl}:` : ""}${process.env.PATH}`, PYTHONDONTWRITEBYTECODE: "1" }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
