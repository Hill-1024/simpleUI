const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { rebuild } = require("@electron/rebuild");

const desktopRuntimeDependencies = [
  "better-sqlite3",
  "cors",
  "express",
  "helmet",
  "ssh2",
  "uuid",
  "zod"
];

function resolvePackageJson(packageName, fromDir) {
  const resolver = createRequire(path.join(fromDir, "package.json"));
  try {
    return resolver.resolve(`${packageName}/package.json`);
  } catch (error) {
    if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    return findPackageJson(resolver.resolve(packageName));
  }
}

function findPackageJson(entryPath) {
  let currentDir = path.dirname(entryPath);
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fsSync.existsSync(packageJsonPath)) return packageJsonPath;
    currentDir = path.dirname(currentDir);
  }
  throw new Error(`Unable to find package.json for ${entryPath}`);
}

function packageDirFromJson(packageJsonPath) {
  return path.dirname(packageJsonPath);
}

function dependencyNames(manifest) {
  return Array.from(new Set([
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.optionalDependencies || {})
  ]));
}

function collectDependencyClosure(packageName, fromDir, collected) {
  const packageJsonPath = resolvePackageJson(packageName, fromDir);
  const manifest = require(packageJsonPath);
  const sourceDir = packageDirFromJson(packageJsonPath);
  const key = `${manifest.name}@${manifest.version}`;

  if (collected.has(key)) return;
  collected.set(key, {
    name: manifest.name,
    version: manifest.version,
    sourceDir
  });

  for (const dependencyName of dependencyNames(manifest)) {
    collectDependencyClosure(dependencyName, sourceDir, collected);
  }
}

function resourcesDirForPack(context) {
  if (context.electronPlatformName === "darwin") {
    const appName = `${context.packager.appInfo.productFilename}.app`;
    return path.join(context.appOutDir, appName, "Contents", "Resources");
  }
  return path.join(context.appOutDir, "resources");
}

function destinationForPackage(runtimeNodeModulesDir, packageName) {
  return path.join(runtimeNodeModulesDir, ...packageName.split("/"));
}

async function walkFiles(rootDir, visitor) {
  if (!fsSync.existsSync(rootDir)) return;
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(entryPath, visitor);
    } else if (entry.isFile()) {
      await visitor(entryPath);
    }
  }
}

async function findNativePackageDirs(runtimeNodeModulesDir) {
  const packageDirs = new Set();

  async function visitPackageDir(packageDir) {
    const bindingFile = path.join(packageDir, "binding.gyp");
    if (fsSync.existsSync(bindingFile)) packageDirs.add(packageDir);
  }

  if (!fsSync.existsSync(runtimeNodeModulesDir)) return [];
  for (const entry of await fs.readdir(runtimeNodeModulesDir, { withFileTypes: true })) {
    if (entry.name === ".bin") continue;
    const entryPath = path.join(runtimeNodeModulesDir, entry.name);
    if (entry.isDirectory() && entry.name.startsWith("@")) {
      for (const scopedEntry of await fs.readdir(entryPath, { withFileTypes: true })) {
        if (scopedEntry.isDirectory()) {
          await visitPackageDir(path.join(entryPath, scopedEntry.name));
        }
      }
    } else if (entry.isDirectory()) {
      await visitPackageDir(entryPath);
    }
  }

  return Array.from(packageDirs).sort();
}

function electronVersionForPack(context, projectDir) {
  if (context.electronVersion) return context.electronVersion;
  if (context.packager?.info?.framework?.version) {
    return context.packager.info.framework.version;
  }
  const electronPackageJson = resolvePackageJson("electron", projectDir);
  return require(electronPackageJson).version;
}

function archForRebuild(context) {
  if (typeof context.arch === "string") return context.arch;
  const electronBuilderArchNames = {
    0: "ia32",
    1: "x64",
    2: "armv7l",
    3: "arm64",
    4: "universal"
  };
  return electronBuilderArchNames[context.arch] || process.arch;
}

async function rebuildNativeDependencies(runtimeNodeModulesDir, context, projectDir) {
  const nativePackageDirs = await findNativePackageDirs(runtimeNodeModulesDir);
  if (!nativePackageDirs.length) return;

  const electronVersion = electronVersionForPack(context, projectDir);
  const arch = archForRebuild(context);
  for (const packageDir of nativePackageDirs) {
    console.log(
      `  • rebuilding native dependency for Electron  module=${path.relative(runtimeNodeModulesDir, packageDir)} electron=${electronVersion} arch=${arch}`
    );
    await rebuild({
      buildPath: packageDir,
      electronVersion,
      arch,
      platform: context.electronPlatformName,
      force: true,
      buildFromSource: false,
      mode: "sequential"
    });
  }
}

async function syncNativeArtifacts(runtimeNodeModulesDir, resourcesDir) {
  const unpackedNodeModulesDir = path.join(resourcesDir, "app.asar.unpacked", "node_modules");
  if (!fsSync.existsSync(unpackedNodeModulesDir)) return;

  let copied = 0;
  await walkFiles(runtimeNodeModulesDir, async (sourcePath) => {
    if (path.extname(sourcePath) !== ".node") return;
    const relativePath = path.relative(runtimeNodeModulesDir, sourcePath);
    const destinationPath = path.join(unpackedNodeModulesDir, relativePath);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
    copied += 1;
  });

  if (copied > 0) {
    console.log(`  • synced Electron native artifacts  count=${copied}`);
  }
}

async function copyPackage(pkg, runtimeNodeModulesDir) {
  const destination = destinationForPackage(runtimeNodeModulesDir, pkg.name);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(pkg.sourceDir, destination, {
    recursive: true,
    dereference: true,
    filter: (source) => path.basename(source) !== "node_modules"
  });
}

module.exports = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const collected = new Map();

  for (const packageName of desktopRuntimeDependencies) {
    collectDependencyClosure(packageName, projectDir, collected);
  }

  const resourcesDir = resourcesDirForPack(context);
  const runtimeNodeModulesDir = path.join(resourcesDir, "node_modules");
  await fs.rm(runtimeNodeModulesDir, { recursive: true, force: true });
  await fs.mkdir(runtimeNodeModulesDir, { recursive: true });

  for (const pkg of collected.values()) {
    await copyPackage(pkg, runtimeNodeModulesDir);
  }

  console.log(`  • copied desktop runtime dependencies  count=${collected.size}`);
  await rebuildNativeDependencies(runtimeNodeModulesDir, context, projectDir);
  await syncNativeArtifacts(runtimeNodeModulesDir, resourcesDir);
};
