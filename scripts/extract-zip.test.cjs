const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");

// Exercise the exact extractor used by Electron's install script.
const extract = createRequire(require.resolve("electron/package.json"))("extract-zip");

function writeZip(filename, entries) {
  execFileSync("python3", ["-c", `
import json, stat, sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as archive:
    for name, content, symlink in json.loads(sys.argv[2]):
        entry = zipfile.ZipInfo(name)
        entry.create_system = 3
        entry.external_attr = ((stat.S_IFLNK | 0o777) if symlink else (stat.S_IFREG | 0o644)) << 16
        archive.writestr(entry, content)
`, filename, JSON.stringify(entries)]);
}

test("Electron extraction rejects escaping links and preserves files outside its destination", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "simpleui-zip-test-"));
  try {
    const outside = path.join(directory, "outside.txt");
    await fs.writeFile(outside, "preserve me");
    for (const [index, target] of ["../outside.txt", outside].entries()) {
      const zip = path.join(directory, `escape-${index}.zip`);
      const output = path.join(directory, `output-${index}`);
      writeZip(zip, [["escape", target, true]]);
      await assert.rejects(extract(zip, { dir: output }), /Out of bound/);
      assert.equal(await fs.readFile(outside, "utf8"), "preserve me");
      await assert.rejects(fs.lstat(path.join(output, "escape")), { code: "ENOENT" });
    }
    const safeZip = path.join(directory, "safe.zip");
    writeZip(safeZip, [["nested/file.txt", "valid contents", false]]);
    const safeOutput = path.join(directory, "safe");
    await extract(safeZip, { dir: safeOutput });
    assert.equal(await fs.readFile(path.join(safeOutput, "nested/file.txt"), "utf8"), "valid contents");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Electron extraction supports internal framework links and rejects existing external links", {
  skip: process.platform === "win32" ? "Creating symlinks requires Windows privileges" : false
}, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "simpleui-zip-links-"));
  try {
    const zip = path.join(directory, "framework.zip");
    writeZip(zip, [["Versions/Current", "A", true], ["Versions/A/file.txt", "framework", false]]);
    const output = path.join(directory, "output");
    await extract(zip, { dir: output });
    assert.equal(await fs.readFile(path.join(output, "Versions/Current/file.txt"), "utf8"), "framework");

    const outside = path.join(directory, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "keep.txt"), "preserve me");
    await fs.symlink(outside, path.join(output, "external"));
    writeZip(zip, [["escape", "external/keep.txt", true]]);
    await assert.rejects(extract(zip, { dir: output }), /Out of bound/);

    await fs.symlink(path.join(outside, "keep.txt"), path.join(output, "existing.txt"));
    writeZip(zip, [["existing.txt", "overwritten", false]]);
    await assert.rejects(extract(zip, { dir: output }), /symbolic link/);
    assert.equal(await fs.readFile(path.join(outside, "keep.txt"), "utf8"), "preserve me");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
