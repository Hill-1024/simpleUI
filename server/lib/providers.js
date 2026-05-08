import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hookDir = path.resolve(__dirname, "../hooks/remote");

export const providers = {
  hysteria2: {
    id: "hysteria2",
    name: "Hysteria2",
    upstream: "https://github.com/seagullz4/hysteria2",
    branch: "main",
    installMode: "python",
    installEntrypoints: [
      "https://raw.githubusercontent.com/seagullz4/hysteria2/main/phy2.sh",
      "https://raw.githubusercontent.com/seagullz4/hysteria2/main/hysteria2.py"
    ],
    certificateModes: [
      { id: "acme-http", label: "ACME HTTP", requiresDomain: true },
      { id: "acme-dns", label: "ACME DNS", requiresDomain: true },
      { id: "self-signed", label: "自签证书", requiresDomain: false },
      { id: "manual-cert", label: "手动证书路径", requiresDomain: true }
    ],
    serviceNames: ["hysteria-server.service", "hysteria.service"],
    configPaths: ["/etc/hysteria/config.yaml", "/etc/hy2config"],
    capabilities: [
      "multi-server",
      "multi-node",
      "password-auth",
      "brutal",
      "obfs-salamander",
      "sniff",
      "port-hopping",
      "acme-dns-providers",
      "manual-cert",
      "self-signed-ip",
      "subscription-templates",
      "kick",
      "source-ip-ban",
      "service-control"
    ],
    notes:
      "Uses the maintained Python flow from seagullz4 for dependencies/source parity, then writes the same password-auth config shape as the upstream CLI branches."
  },
  trojan: {
    id: "trojan",
    name: "Trojan",
    upstream: "https://github.com/xyz690/Trojan",
    branch: "master",
    installMode: "shell",
    installEntrypoints: [
      "https://raw.githubusercontent.com/xyz690/Trojan/master/trojan_install.sh"
    ],
    certificateModes: [
      { id: "acme-http", label: "acme.sh HTTP 自动申请", requiresDomain: true }
    ],
    serviceNames: ["trojan.service"],
    configPaths: ["/usr/src/trojan/server.conf", "/usr/local/etc/trojan/config.json"],
    capabilities: [
      "multi-server",
      "multi-node",
      "password-auth",
      "acme-http",
      "nginx-masquerade",
      "share-links",
      "connection-ip",
      "source-ip-ban",
      "service-control"
    ],
    notes:
      "Wraps xyz690/Trojan's installer and then writes the same single-password server.conf auth shape as the upstream CLI."
  }
};

export function providerList() {
  return Object.values(providers);
}

export async function readHookScript(name) {
  return fs.readFile(path.join(hookDir, name), "utf8");
}

export async function composeHook(names) {
  const parts = [];
  for (const name of names) {
    parts.push(`# ---- ${name} ----`);
    parts.push(await readHookScript(name));
  }
  return parts.join("\n\n");
}
