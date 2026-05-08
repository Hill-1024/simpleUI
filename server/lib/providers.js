import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hookDir = path.resolve(__dirname, "../hooks/remote");

export const DEPLOYABLE_PROTOCOLS = ["hysteria2", "trojan"];

export const monitorProtocols = {
  hysteria2: {
    id: "hysteria2",
    name: "Hysteria2",
    serviceProtocol: "udp",
    deployable: true,
    autoDiscover: ["simpleui", "sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  trojan: {
    id: "trojan",
    name: "Trojan",
    serviceProtocol: "tcp",
    deployable: true,
    autoDiscover: ["simpleui", "sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  shadowsocks: {
    id: "shadowsocks",
    name: "Shadowsocks",
    serviceProtocol: "tcp,udp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  vmess: {
    id: "vmess",
    name: "VMess",
    serviceProtocol: "tcp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  vless: {
    id: "vless",
    name: "VLESS",
    serviceProtocol: "tcp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  naive: {
    id: "naive",
    name: "Naive",
    serviceProtocol: "tcp,udp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  hysteria: {
    id: "hysteria",
    name: "Hysteria",
    serviceProtocol: "udp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  shadowtls: {
    id: "shadowtls",
    name: "ShadowTLS",
    serviceProtocol: "tcp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  tuic: {
    id: "tuic",
    name: "TUIC",
    serviceProtocol: "udp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  anytls: {
    id: "anytls",
    name: "AnyTLS",
    serviceProtocol: "tcp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  wireguard: {
    id: "wireguard",
    name: "WireGuard",
    serviceProtocol: "udp",
    deployable: false,
    autoDiscover: ["sing-box-endpoint"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  socks: {
    id: "socks",
    name: "SOCKS",
    serviceProtocol: "tcp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  http: {
    id: "http",
    name: "HTTP",
    serviceProtocol: "tcp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  },
  mixed: {
    id: "mixed",
    name: "Mixed",
    serviceProtocol: "tcp",
    deployable: false,
    autoDiscover: ["sing-box"],
    capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"]
  }
};

export const providers = {
  hysteria2: {
    id: "hysteria2",
    name: "Hysteria2",
    deployable: true,
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
    deployable: true,
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
  return DEPLOYABLE_PROTOCOLS.map((id) => providers[id]).filter(Boolean);
}

export function monitorProtocolList() {
  return Object.values(monitorProtocols);
}

export function monitorProtocolIds() {
  return Object.keys(monitorProtocols);
}

export function isDeployableProtocol(protocol) {
  return DEPLOYABLE_PROTOCOLS.includes(protocol);
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
