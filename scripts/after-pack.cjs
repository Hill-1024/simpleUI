const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const desktopRuntimeDependencies = [
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
  return Object.keys(manifest.dependencies || {});
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

  const runtimeNodeModulesDir = path.join(resourcesDirForPack(context), "node_modules");
  await fs.rm(runtimeNodeModulesDir, { recursive: true, force: true });
  await fs.mkdir(runtimeNodeModulesDir, { recursive: true });

  for (const pkg of collected.values()) {
    await copyPackage(pkg, runtimeNodeModulesDir);
  }

  console.log(`  • copied desktop runtime dependencies  count=${collected.size}`);
};
