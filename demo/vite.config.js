import path from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const repoRoot = path.resolve(import.meta.dirname, "..");
const demoRoot = path.join(repoRoot, "demo");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const appVuePath = path.join(repoRoot, "src/App.vue");
const appStorePath = path.join(repoRoot, "src/stores/appStore.js");
const demoApiPath = path.join(demoRoot, "src/api.js");

function demoApiRedirect() {
  return {
    name: "simpleui-demo-api-redirect",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      const cleanImporter = importer.split("?")[0];
      if (source === "./api.js" && cleanImporter === appVuePath) return demoApiPath;
      if (source === "../api.js" && cleanImporter === appStorePath) return demoApiPath;
      return null;
    }
  };
}

export default defineConfig({
  root: demoRoot,
  base: "./",
  publicDir: path.join(demoRoot, "public"),
  plugins: [demoApiRedirect(), vue()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_AUTHOR__: JSON.stringify(packageJson.author || "Hill-1024"),
    __APP_HOMEPAGE__: JSON.stringify(packageJson.homepage || "https://github.com/Hill-1024/simpleUI")
  },
  build: {
    outDir: path.join(demoRoot, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    fs: {
      allow: [repoRoot]
    }
  },
  preview: {
    port: 4174
  }
});
