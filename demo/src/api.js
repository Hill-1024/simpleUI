const storageKey = "simpleui.demo.state.v4";
const jobsById = new Map();

const gb = (value) => Math.round(value * 1024 * 1024 * 1024);
const mb = (value) => Math.round(value * 1024 * 1024);
const now = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));

const providers = [
  {
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
    capabilities: [
      "multi-server",
      "multi-node",
      "password-auth",
      "brutal",
      "obfs-salamander",
      "sniff",
      "port-hopping",
      "source-ip-ban",
      "service-control"
    ]
  },
  {
    id: "trojan",
    name: "Trojan",
    deployable: true,
    upstream: "https://github.com/xyz690/Trojan",
    branch: "master",
    installMode: "shell",
    installEntrypoints: ["https://raw.githubusercontent.com/xyz690/Trojan/master/trojan_install.sh"],
    certificateModes: [{ id: "acme-http", label: "acme.sh HTTP 自动申请", requiresDomain: true }],
    capabilities: ["multi-server", "multi-node", "password-auth", "nginx-masquerade", "source-ip-ban", "service-control"]
  }
];

const monitorProtocols = [
  ...providers,
  { id: "shadowsocks", name: "Shadowsocks", serviceProtocol: "tcp,udp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "vmess", name: "VMess", serviceProtocol: "tcp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "vless", name: "VLESS", serviceProtocol: "tcp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "naive", name: "Naive", serviceProtocol: "tcp,udp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "hysteria", name: "Hysteria", serviceProtocol: "udp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "shadowtls", name: "ShadowTLS", serviceProtocol: "tcp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "tuic", name: "TUIC", serviceProtocol: "udp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "anytls", name: "AnyTLS", serviceProtocol: "tcp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "wireguard", name: "WireGuard", serviceProtocol: "udp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "socks", name: "SOCKS", serviceProtocol: "tcp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "http", name: "HTTP", serviceProtocol: "tcp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] },
  { id: "mixed", name: "Mixed", serviceProtocol: "tcp", deployable: false, capabilities: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"] }
];

const protocolService = Object.fromEntries(monitorProtocols.map((item) => [item.id, item.serviceProtocol || (item.id === "hysteria2" ? "udp" : "tcp")]));

function id(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function ago(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function stamp(item, create = false) {
  const time = now();
  return {
    ...item,
    createdAt: item.createdAt || (create ? time : item.createdAt),
    updatedAt: time
  };
}

function serverMetrics(cpu, memory, disk, rxRate, txRate, minutes = 1) {
  return {
    cpu: { usagePercent: cpu },
    memory: { usedPercent: memory },
    disk: { usedPercent: disk },
    network: { rxRate, txRate },
    updatedAt: ago(minutes)
  };
}

function seedState() {
  return {
    servers: [
      {
        id: "srv-tokyo",
        name: "Tokyo Edge 01",
        host: "203.0.113.14",
        port: 22,
        hookPort: 37877,
        hookUrl: "http://203.0.113.14:37877",
        hookInstalled: true,
        hookStatus: "online",
        status: "online",
        sshUserHint: "root",
        location: "Tokyo, JP",
        group: "Asia",
        metrics: serverMetrics(24, 48, 36, mb(8.4), mb(3.1), 1),
        createdAt: ago(1400),
        updatedAt: ago(1)
      },
      {
        id: "srv-sg",
        name: "Singapore Relay",
        host: "198.51.100.22",
        port: 22,
        hookPort: 37877,
        hookUrl: "http://198.51.100.22:37877",
        hookInstalled: true,
        hookStatus: "online",
        status: "online",
        sshUserHint: "root",
        location: "Singapore",
        group: "Asia",
        metrics: serverMetrics(41, 55, 44, mb(5.7), mb(2.6), 2),
        createdAt: ago(1200),
        updatedAt: ago(2)
      },
      {
        id: "srv-fra",
        name: "Frankfurt Core",
        host: "192.0.2.73",
        port: 22,
        hookPort: 37877,
        hookUrl: "http://192.0.2.73:37877",
        hookInstalled: true,
        hookStatus: "online",
        status: "online",
        sshUserHint: "debian",
        location: "Frankfurt, DE",
        group: "Europe",
        metrics: serverMetrics(18, 39, 58, mb(4.8), mb(2.2), 3),
        createdAt: ago(950),
        updatedAt: ago(3)
      },
      {
        id: "srv-la",
        name: "Los Angeles Lab",
        host: "203.0.113.89",
        port: 22,
        hookPort: 37877,
        hookUrl: "http://203.0.113.89:37877",
        hookInstalled: true,
        hookStatus: "unreachable",
        status: "unreachable",
        sshUserHint: "ubuntu",
        location: "Los Angeles, US",
        group: "America",
        metrics: serverMetrics(0, 0, 62, 0, 0, 14),
        createdAt: ago(820),
        updatedAt: ago(14)
      }
    ],
    nodes: [
      demoNode("node-hy2-tokyo", "srv-tokyo", "hysteria2", "JP HY2 443", "Game", "jp-hy2.demo.simpleui.dev:443", 443, "online", gb(431), gb(88), 42, "hysteria-server.service"),
      demoNode("node-trojan-tokyo", "srv-tokyo", "trojan", "JP Trojan TLS", "Game", "jp-trojan.demo.simpleui.dev:443", 443, "online", gb(284), gb(61), 28, "trojan.service"),
      demoNode("node-ss-sg", "srv-sg", "shadowsocks", "SG sing-box SS", "General", "sg-ss.demo.simpleui.dev:8388", 8388, "active", gb(178), gb(37), 19, "sing-box.service", true),
      demoNode("node-vless-fra", "srv-fra", "vless", "DE VLESS Reality", "Work", "de-vless.demo.simpleui.dev:443", 443, "online", gb(205), gb(42), 16, "sing-box.service", true),
      demoNode("node-hy2-la", "srv-la", "hysteria2", "US HY2 Lab", "Lab", "us-lab.demo.simpleui.dev:8443", 8443, "warning", gb(74), gb(12), 0, "hysteria-server.service")
    ],
    users: [
      { id: "user-demo", username: "demo", nodeId: "node-hy2-tokyo", createdAt: ago(900), updatedAt: ago(20) },
      { id: "user-media", username: "media", nodeId: "node-trojan-tokyo", createdAt: ago(820), updatedAt: ago(18) }
    ],
    connections: [
      connection("conn-1", "node-hy2-tokyo", "srv-tokyo", "198.51.100.42", "198.51.100.42:56214", "0.0.0.0:443", ["udp"], gb(11.2), gb(2.1), 4, 4),
      connection("conn-2", "node-trojan-tokyo", "srv-tokyo", "203.0.113.210", "203.0.113.210:49221", "0.0.0.0:443", ["tcp"], gb(7.8), gb(1.4), 2, 4),
      connection("conn-3", "node-ss-sg", "srv-sg", "2001:db8:54::20", "[2001:db8:54::20]:54022", "[::]:8388", ["tcp", "udp"], gb(6.4), gb(1.1), 3, 6),
      connection("conn-4", "node-vless-fra", "srv-fra", "198.51.100.77", "198.51.100.77:60128", "0.0.0.0:443", ["tcp"], gb(4.9), gb(0.9), 1, 4)
    ],
    remoteTraffic: [
      traffic("rt-1", "node-hy2-tokyo", "198.51.100.42", 4, ["udp"], gb(64), gb(12), 18),
      traffic("rt-2", "node-hy2-tokyo", "2001:db8:14::a2", 6, ["udp"], gb(38), gb(7), 8),
      traffic("rt-3", "node-trojan-tokyo", "203.0.113.210", 4, ["tcp"], gb(51), gb(9), 12),
      traffic("rt-4", "node-ss-sg", "2001:db8:54::20", 6, ["tcp", "udp"], gb(31), gb(5), 7),
      traffic("rt-5", "node-vless-fra", "198.51.100.77", 4, ["tcp"], gb(27), gb(4), 5)
    ],
    bans: [
      blacklist("ban-demo-1", "node-hy2-tokyo", "203.0.113.66", 180),
      blacklist("ban-demo-2", "node-trojan-tokyo", "203.0.113.66", 180),
      blacklist("ban-demo-3", "node-ss-sg", "2001:db8:54::88", 96),
      blacklist("ban-demo-4", "node-hy2-tokyo", "198.51.100.42", 42)
    ],
    jobs: [
      completedJob("job-seed-status", "status", "Refresh JP HY2 443", "客户端 4，客户端 IP 2", 7),
      completedJob("job-seed-ipq", "ipquality", "IPQuality Tokyo Edge 01 IPv4", "报告已返回", 33, ipQualityResult("ipv4", "Tokyo Edge 01")),
      completedJob("job-seed-opt", "optimize", "Optimize Frankfurt Core: bbr-fq", "BBR + FQ 已启用", 72, optimizeResult(false))
    ],
    audit: [
      { id: "audit-1", type: "hook.install.done", message: "Tokyo Edge 01 hook installed", createdAt: ago(900) },
      { id: "audit-2", type: "node.deploy.done", message: "JP HY2 443 deployed", createdAt: ago(880) }
    ]
  };
}

function demoNode(idValue, serverId, protocol, name, group, endpoint, listenPort, status, rx, tx, onlineUsers, service, monitorOnly = false) {
  return {
    id: idValue,
    serverId,
    protocol,
    name,
    group,
    endpoint,
    domain: endpoint.split(":")[0],
    listenPort,
    configPath: monitorOnly ? "/etc/sing-box/config.json" : (protocol === "trojan" ? "/usr/src/trojan/server.conf" : "/etc/hysteria/config.yaml"),
    remoteKey: monitorOnly
      ? `sing-box:/etc/sing-box/config.json:inbound:${idValue}:${listenPort}`
      : `${protocol}:${protocol === "trojan" ? "/usr/src/trojan/server.conf" : "/etc/hysteria/config.yaml"}:${listenPort}`,
    tlsMode: protocol === "hysteria2" ? "acme-http" : "acme-http",
    acmeEmail: "admin@demo.simpleui.dev",
    masqueradeUrl: "https://www.bing.com/",
    service,
    serviceProtocol: protocolService[protocol] || "tcp",
    managedBy: monitorOnly ? "sing-box" : "simpleui",
    importSource: monitorOnly ? "sing-box-discovery" : "simpleui",
    monitorOnly,
    status,
    capability: ["traffic-monitor", "connection-ip", "source-ip-ban", "service-control"],
    traffic: { rx, tx },
    onlineUsers,
    lastCheckedAt: ago(status === "warning" ? 14 : 2),
    createdAt: ago(820),
    updatedAt: ago(status === "warning" ? 14 : 2)
  };
}

function connection(idValue, nodeId, serverId, sourceIp, remote, local, protocols, rx, tx, connections, family) {
  return {
    id: idValue,
    nodeId,
    serverId,
    sourceIp,
    remote,
    local,
    protocol: protocols[0],
    protocols,
    rx,
    tx,
    total: rx + tx,
    connections,
    state: "ESTABLISHED",
    ipFamily: family,
    updatedAt: ago(1)
  };
}

function traffic(idValue, nodeId, clientIp, family, protocols, rx, tx, connections) {
  return {
    id: idValue,
    nodeId,
    clientIp,
    remoteIp: clientIp,
    ipFamily: family,
    protocols,
    rx,
    tx,
    total: rx + tx,
    connections,
    lastSeenAt: ago(2),
    updatedAt: ago(2)
  };
}

function seedNodeMeta(nodeId) {
  const values = {
    "node-hy2-tokyo": { serverId: "srv-tokyo", protocol: "hysteria2", listenPort: 443, configPath: "/etc/hysteria/config.yaml" },
    "node-trojan-tokyo": { serverId: "srv-tokyo", protocol: "trojan", listenPort: 443, configPath: "/usr/src/trojan/server.conf" },
    "node-ss-sg": { serverId: "srv-sg", protocol: "shadowsocks", listenPort: 8388, configPath: "/etc/sing-box/config.json" },
    "node-vless-fra": { serverId: "srv-fra", protocol: "vless", listenPort: 443, configPath: "/etc/sing-box/config.json" },
    "node-hy2-la": { serverId: "srv-la", protocol: "hysteria2", listenPort: 8443, configPath: "/etc/hysteria/config.yaml" }
  };
  return values[nodeId] || {};
}

function blacklist(idValue, nodeId, target, minutes = 5, nodeOverride = null) {
  const node = nodeOverride || seedNodeMeta(nodeId);
  const remoteKey = node.remoteKey || (String(node.configPath || "").includes("sing-box")
    ? `sing-box:${node.configPath}:inbound:${nodeId}:${node.listenPort || ""}`
    : `${node.protocol || "demo"}:${node.configPath || "managed"}:${node.listenPort || ""}`);
  return {
    id: idValue,
    targetKind: "source-ip",
    target,
    ipFamily: target.includes(":") ? 6 : 4,
    serverId: node.serverId || "",
    nodeId,
    remoteKey,
    status: "active",
    source: "demo",
    remoteCreatedAt: ago(minutes),
    lastSeenAt: ago(Math.min(minutes, 2)),
    createdAt: ago(minutes),
    updatedAt: ago(Math.min(minutes, 2))
  };
}

function completedJob(idValue, type, title, summary, minutes, result = { ok: true }) {
  return {
    id: idValue,
    type,
    title,
    status: "success",
    result,
    logs: [`[demo] ${summary}\n`],
    createdAt: ago(minutes + 1),
    updatedAt: ago(minutes)
  };
}

function loadState() {
  if (typeof window === "undefined") return seedState();
  if (new URLSearchParams(window.location.search).has("resetDemo")) {
    window.localStorage.removeItem(storageKey);
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "");
    if (saved && Array.isArray(saved.servers) && Array.isArray(saved.nodes)) return saved;
  } catch {
    // Ignore invalid demo snapshots.
  }
  const seeded = seedState();
  window.localStorage.setItem(storageKey, JSON.stringify(seeded));
  return seeded;
}

let state = loadState();

function saveState() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }
}

function respond(data, ms = 120) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(clone(data)), ms);
  });
}

function publicState() {
  return {
    ...clone(state),
    providers: clone(providers),
    monitorProtocols: clone(monitorProtocols)
  };
}

function serverName(serverId) {
  return state.servers.find((server) => server.id === serverId)?.name || "Demo Server";
}

function nodeName(nodeId) {
  return state.nodes.find((node) => node.id === nodeId)?.name || "Demo Node";
}

function findServer(serverId) {
  return state.servers.find((server) => server.id === serverId);
}

function findNode(nodeId) {
  return state.nodes.find((node) => node.id === nodeId);
}

function createJob({ type, title, logs, complete }) {
  const job = {
    id: id("job"),
    type,
    title,
    status: "queued",
    result: null,
    logs: [],
    createdAt: now(),
    updatedAt: now()
  };
  jobsById.set(job.id, { logs: logs || defaultLogs(type, title), complete });
  state.jobs = [job, ...(state.jobs || [])].slice(0, 30);
  saveState();
  return job;
}

function updateJob(jobId, patch) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: now() });
  saveState();
  return job;
}

function defaultLogs(type, title) {
  const prefix = `[demo:${type}]`;
  return [
    `${prefix} queued ${title}\n`,
    `${prefix} connecting to persistent hook\n`,
    `${prefix} applying simulated changes\n`,
    `${prefix} done\n`
  ];
}

function finishJob(jobId) {
  const plan = jobsById.get(jobId);
  const result = plan?.complete?.() || { ok: true };
  const job = updateJob(jobId, { status: "success", result });
  jobsById.delete(jobId);
  return job;
}

export function subscribeJob(jobId, handlers = {}) {
  const existing = state.jobs.find((item) => item.id === jobId);
  const plan = jobsById.get(jobId);
  if (!existing) {
    window.setTimeout(() => handlers.onError?.(), 0);
    return () => {};
  }
  if (!plan) {
    window.setTimeout(() => {
      for (const line of existing.logs || []) handlers.onLog?.(line);
      handlers.onDone?.(clone(existing));
    }, 0);
    return () => {};
  }

  let cancelled = false;
  const timers = [];
  updateJob(jobId, { status: "running" });

  plan.logs.forEach((line, index) => {
    timers.push(window.setTimeout(() => {
      if (cancelled) return;
      const job = state.jobs.find((item) => item.id === jobId);
      if (job) {
        job.logs = [...(job.logs || []), line];
        job.status = "running";
        job.updatedAt = now();
        saveState();
      }
      handlers.onLog?.(line);
    }, 180 + index * 360));
  });

  timers.push(window.setTimeout(() => {
    if (cancelled) return;
    const job = finishJob(jobId);
    handlers.onDone?.(clone(job));
  }, 520 + plan.logs.length * 360));

  return () => {
    cancelled = true;
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}

function syncTraffic() {
  for (const server of state.servers) {
    if (server.hookStatus !== "online") continue;
    const cpu = Number(server.metrics?.cpu?.usagePercent || 20);
    const memory = Number(server.metrics?.memory?.usedPercent || 40);
    server.metrics = serverMetrics(
      Math.max(5, Math.min(92, cpu + (Math.random() * 8 - 3))),
      Math.max(20, Math.min(88, memory + (Math.random() * 4 - 1))),
      Number(server.metrics?.disk?.usedPercent || 42),
      mb(3 + Math.random() * 8),
      mb(1 + Math.random() * 4),
      0
    );
    server.updatedAt = now();
  }
  for (const node of state.nodes) {
    if (node.status === "online" || node.status === "active") {
      node.traffic = {
        rx: Number(node.traffic?.rx || 0) + mb(20 + Math.random() * 120),
        tx: Number(node.traffic?.tx || 0) + mb(4 + Math.random() * 30)
      };
      node.lastCheckedAt = now();
      node.updatedAt = now();
    }
  }
  for (const item of state.remoteTraffic) {
    item.rx += mb(2 + Math.random() * 12);
    item.tx += mb(0.5 + Math.random() * 3);
    item.total = item.rx + item.tx;
    item.lastSeenAt = now();
    item.updatedAt = now();
  }
  saveState();
}

function completeInstall(serverId) {
  const server = findServer(serverId);
  if (server) {
    Object.assign(server, stamp({
      ...server,
      hookInstalled: true,
      hookStatus: "online",
      status: "online",
      hookUrl: `http://${server.host}:${server.hookPort || 37877}`,
      metrics: serverMetrics(16 + Math.random() * 20, 38 + Math.random() * 15, 31 + Math.random() * 12, mb(2.2), mb(0.9), 0)
    }));
  }
  saveState();
  return { ok: true, hookUrl: server?.hookUrl, discovery: { imported: 1, updated: 0 } };
}

function completeDeploy(serverId, nodePayload = {}) {
  const server = findServer(serverId);
  const protocol = nodePayload.protocol || "hysteria2";
  const listenPort = protocol === "trojan" ? 443 : Number(nodePayload.listenPort || 443);
  const domain = String(nodePayload.domain || `${protocol}-${server?.host || "demo"}.demo.simpleui.dev`).replace(/^https?:\/\//, "");
  const node = demoNode(
    id("node"),
    serverId,
    protocol,
    nodePayload.name || `${protocol === "trojan" ? "Trojan" : "HY2"} ${server?.name || "Demo"}`,
    nodePayload.group || "Demo",
    `${domain}:${listenPort}`,
    listenPort,
    "online",
    gb(3.6),
    gb(0.8),
    Math.floor(2 + Math.random() * 8),
    protocol === "trojan" ? "trojan.service" : "hysteria-server.service"
  );
  Object.assign(node, {
    tlsMode: protocol === "trojan" ? "acme-http" : nodePayload.tlsMode,
    masqueradeUrl: nodePayload.masqueradeUrl,
    acmeEmail: nodePayload.acmeEmail
  });
  state.nodes.unshift(node);
  saveState();
  return { ok: true, endpoint: node.endpoint, node };
}

function completeNodeUpdate(nodeId, nodePayload = {}) {
  const node = findNode(nodeId);
  if (!node) return { ok: true };
  Object.assign(node, stamp({
    ...node,
    ...nodePayload,
    endpoint: `${nodePayload.domain || node.domain || node.endpoint.split(":")[0]}:${nodePayload.protocol === "trojan" ? 443 : (nodePayload.listenPort || node.listenPort)}`,
    status: "online",
    lastCheckedAt: now()
  }));
  saveState();
  return { ok: true, endpoint: node.endpoint, node };
}

function completeRefresh(nodeId) {
  const node = findNode(nodeId);
  if (!node) return { ok: true, connections: [], remoteTraffic: [] };
  node.status = node.status === "warning" ? "online" : node.status;
  node.onlineUsers = Math.max(1, Number(node.onlineUsers || 0) + Math.floor(Math.random() * 4 - 1));
  node.traffic = {
    rx: Number(node.traffic?.rx || 0) + mb(160 + Math.random() * 500),
    tx: Number(node.traffic?.tx || 0) + mb(30 + Math.random() * 120)
  };
  node.lastCheckedAt = now();
  node.updatedAt = now();
  const demoClient = `198.51.100.${Math.floor(30 + Math.random() * 180)}`;
  const entry = traffic(id("rt"), node.id, demoClient, 4, [protocolService[node.protocol]?.includes("udp") ? "udp" : "tcp"], mb(800), mb(180), 1);
  state.remoteTraffic = [entry, ...state.remoteTraffic.filter((item) => item.nodeId !== node.id).slice(0, 9)];
  saveState();
  return { ok: true, connections: state.connections.filter((item) => item.nodeId === node.id), remoteTraffic: [entry] };
}

function optimizeResult(needsReboot = false) {
  return {
    ok: true,
    kernel: needsReboot ? "6.9.8-xanmod1" : "6.8.0-cloud",
    congestionControl: "bbr",
    queueDiscipline: needsReboot ? "cake" : "fq",
    ecn: "enabled",
    needsReboot
  };
}

function ipQualityResult(mode = "ipv4", server = "Demo Server") {
  return {
    ok: true,
    mode,
    reportPath: `/tmp/simpleui-ipquality-${mode}.txt`,
    rawOutput: [
      `IPQuality ${server} ${mode.toUpperCase()} demo report`,
      "出口 ASN: AS64500 SimpleUI Example Transit",
      "风险评分: 低",
      "流媒体: Netflix / Disney+ / YouTube Premium 可用",
      "说明: 这是静态演示数据，没有请求任何第三方检测服务。"
    ].join("\n")
  };
}

function commandLogs(command = "") {
  const clean = String(command || "").trim();
  if (/^cd\s+'?([^']+)'?\s+&&\s+pwd$/.test(clean)) {
    const match = clean.match(/^cd\s+'?([^']+)'?/);
    return [`${match?.[1] || "/root"}\n`];
  }
  if (clean.includes("systemctl")) {
    return ["● simpleui-demo.service - SimpleUI Demo Service\n", "   Loaded: loaded (/etc/systemd/system/simpleui-demo.service; enabled)\n", "   Active: active (running)\n"];
  }
  if (clean.includes("ls")) return ["total 24\n", "drwxr-xr-x  2 root root 4096 demo-config\n", "-rw-r--r--  1 root root  812 config.yaml\n"];
  if (clean.includes("ip a")) return ["2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP>\n", "    inet 203.0.113.14/24 scope global eth0\n"];
  return [`$ ${clean}\n`, "demo hook accepted command\n", "no real remote process was started\n"];
}

function terminalResult(command = "") {
  return {
    ok: true,
    exitCode: 0,
    command,
    stdoutBytes: commandLogs(command).join("").length,
    stderrBytes: 0
  };
}

function upsertDemoBlacklist(nodeId, target) {
  const node = findNode(nodeId);
  if (!node) return null;
  const existing = state.bans.find((item) =>
    item.nodeId === nodeId &&
    String(item.target || "").toLowerCase() === String(target || "").toLowerCase()
  );
  const next = blacklist(existing?.id || id("ban"), nodeId, target, 0, node);
  if (existing) {
    Object.assign(existing, {
      ...next,
      createdAt: existing.createdAt,
      remoteCreatedAt: existing.remoteCreatedAt || next.remoteCreatedAt,
      status: "active"
    });
    return existing;
  }
  state.bans.unshift(next);
  return next;
}

function removeDemoBlacklist(nodeId, target) {
  const timestamp = now();
  let removed = false;
  for (const item of state.bans) {
    if (
      item.nodeId === nodeId &&
      String(item.target || "").toLowerCase() === String(target || "").toLowerCase() &&
      item.status !== "removed"
    ) {
      item.status = "removed";
      item.removedAt = timestamp;
      item.updatedAt = timestamp;
      removed = true;
    }
  }
  return removed;
}

export const api = {
  session: () => respond({ authRequired: false, authenticated: true, demo: true }),
  login: () => respond({ ok: true, authenticated: true }),
  logout: () => respond({ ok: true }),
  changePassword: () => respond({ ok: true }),
  bootstrap: () => respond(publicState()),
  sync: async () => {
    syncTraffic();
    return respond({ ok: true, skipped: false, demo: true }, 80);
  },
  installServer: async (payload = {}) => {
    const serverPayload = payload.server || {};
    const serverId = serverPayload.id || id("srv");
    const host = serverPayload.host || "203.0.113.120";
    const server = stamp({
      id: serverId,
      name: serverPayload.name || `Demo Server ${state.servers.length + 1}`,
      host,
      port: Number(serverPayload.port || 22),
      hookPort: Number(serverPayload.hookPort || 37877),
      hookUrl: `http://${host}:${serverPayload.hookPort || 37877}`,
      hookInstalled: false,
      hookStatus: "installing",
      status: "installing",
      sshUserHint: payload.credential?.username || "root",
      location: serverPayload.location || "Demo Region",
      group: serverPayload.group || "Demo",
      metrics: serverMetrics(0, 0, 0, 0, 0, 0)
    }, true);
    const index = state.servers.findIndex((item) => item.id === serverId);
    if (index >= 0) state.servers[index] = { ...state.servers[index], ...server };
    else state.servers.unshift(server);
    const job = createJob({
      type: "hook-install",
      title: `Install hook on ${server.name}`,
      logs: [
        `[demo] ssh ${server.sshUserHint}@${server.host}\n`,
        "[demo] uploading persistent hook bundle\n",
        "[demo] writing /etc/systemd/system/simpleui-hook.service\n",
        "[demo] importing one discovered sing-box node\n"
      ],
      complete: () => completeInstall(server.id)
    });
    return respond({ server, job });
  },
  updateServer: async (serverId, payload = {}) => {
    const server = findServer(serverId);
    if (server) Object.assign(server, stamp({ ...server, ...payload, hookUrl: `http://${payload.host || server.host}:${payload.hookPort || server.hookPort || 37877}` }));
    saveState();
    return respond({ server });
  },
  upgradeHook: async (serverId) => {
    const server = findServer(serverId);
    const job = createJob({
      type: "hook-upgrade",
      title: `Upgrade hook on ${serverName(serverId)}`,
      logs: ["[demo] checking hook version\n", "[demo] replacing remote hook agent\n", "[demo] health check passed\n"],
      complete: () => {
        if (server) Object.assign(server, stamp({ ...server, hookStatus: "online", status: "online" }));
        saveState();
        return { ok: true, reachable: true };
      }
    });
    return respond({ job });
  },
  trustHookCertificate: async (serverId) => {
    const server = findServer(serverId);
    if (server) {
      Object.assign(server, stamp({
        ...server,
        hookStatus: "online",
        status: "online",
        hookSecurity: { transport: "https", pinned: true, legacy: false, mismatch: false, upgradeRequired: false },
        metrics: { ...(server.metrics || {}), lastSyncError: "" }
      }));
      saveState();
    }
    return respond({ server });
  },
  deleteServer: async (serverId) => {
    const server = findServer(serverId);
    const job = createJob({
      type: "server-delete",
      title: `Delete ${serverName(serverId)}`,
      logs: ["[demo] stopping managed services\n", "[demo] removing SimpleUI hook\n", "[demo] pruning local metadata\n"],
      complete: () => {
        const removedNodeIds = new Set(state.nodes.filter((node) => node.serverId === serverId).map((node) => node.id));
        state.nodes = state.nodes.filter((node) => node.serverId !== serverId);
        state.servers = state.servers.filter((item) => item.id !== serverId);
        state.connections = state.connections.filter((item) => item.serverId !== serverId);
        state.remoteTraffic = state.remoteTraffic.filter((item) => !removedNodeIds.has(item.nodeId));
        state.bans = state.bans.filter((item) => item.serverId !== serverId && !removedNodeIds.has(item.nodeId));
        saveState();
        return { ok: true };
      }
    });
    if (server) Object.assign(server, stamp({ ...server, status: "deleting", hookStatus: "deleting" }));
    saveState();
    return respond({ job, server });
  },
  forceClearServer: async (serverId) => {
    const removedNodeIds = new Set(state.nodes.filter((node) => node.serverId === serverId).map((node) => node.id));
    state.nodes = state.nodes.filter((node) => node.serverId !== serverId);
    state.servers = state.servers.filter((server) => server.id !== serverId);
    state.connections = state.connections.filter((item) => item.serverId !== serverId);
    state.remoteTraffic = state.remoteTraffic.filter((item) => !removedNodeIds.has(item.nodeId));
    state.bans = state.bans.filter((item) => item.serverId !== serverId && !removedNodeIds.has(item.nodeId));
    saveState();
    return respond({ ok: true, force: true });
  },
  rebootServer: async (serverId) => {
    const server = findServer(serverId);
    const job = createJob({
      type: "server-reboot",
      title: `Reboot ${serverName(serverId)}`,
      logs: ["[demo] scheduling reboot in 8 seconds\n", "[demo] hook will reconnect after boot\n"],
      complete: () => {
        if (server) Object.assign(server, stamp({ ...server, status: "online", hookStatus: "online" }));
        saveState();
        return { ok: true, delaySeconds: 8 };
      }
    });
    if (server) Object.assign(server, stamp({ ...server, status: "rebooting", hookStatus: "rebooting" }));
    saveState();
    return respond({ job });
  },
  deploy: async (payload = {}) => {
    const nodePayload = payload.node || {};
    const job = createJob({
      type: "deploy",
      title: `Deploy ${nodePayload.protocol || "hysteria2"} on ${serverName(payload.serverId)}`,
      logs: [
        "[demo] resolving provider recipe\n",
        "[demo] preparing certificate mode and auth config\n",
        "[demo] writing remote service files\n",
        "[demo] refreshing traffic counters\n"
      ],
      complete: () => completeDeploy(payload.serverId, nodePayload)
    });
    return respond({ job });
  },
  createMonitorNode: async (payload = {}) => {
    const server = findServer(payload.serverId);
    const nodePayload = payload.node || {};
    const node = demoNode(
      id("node"),
      payload.serverId,
      nodePayload.protocol || "shadowsocks",
      nodePayload.name || "Demo Monitor Node",
      nodePayload.group || "Imported",
      nodePayload.endpoint || `${server?.host || "203.0.113.120"}:${nodePayload.listenPort || 443}`,
      Number(nodePayload.listenPort || 443),
      "warning",
      0,
      0,
      0,
      nodePayload.service || "sing-box.service",
      true
    );
    node.managedBy = "manual";
    node.importSource = "manual-monitor";
    state.nodes.unshift(node);
    saveState();
    return respond({ node });
  },
  updateNode: async (nodeId, payload = {}) => {
    const node = findNode(nodeId);
    if (node) Object.assign(node, stamp({ ...node, status: "updating" }));
    const job = createJob({
      type: "node-update",
      title: `Update ${nodeName(nodeId)} on ${serverName(node?.serverId)}`,
      logs: ["[demo] loading current node metadata\n", "[demo] regenerating config file\n", "[demo] restarting remote service\n"],
      complete: () => completeNodeUpdate(nodeId, payload.node || {})
    });
    saveState();
    return respond({ job, node });
  },
  refreshStatus: async (payload = {}) => {
    const job = createJob({
      type: "status",
      title: `Refresh ${nodeName(payload.nodeId)}`,
      logs: ["[demo] calling /status on remote hook\n", "[demo] reading ss/netstat snapshots\n", "[demo] aggregating client IP traffic\n"],
      complete: () => completeRefresh(payload.nodeId)
    });
    return respond({ job });
  },
  service: async (payload = {}) => {
    const job = createJob({
      type: "service",
      title: `${payload.action || "restart"} ${nodeName(payload.nodeId)}`,
      logs: [`[demo] systemctl ${payload.action || "restart"} ${nodeName(payload.nodeId)}\n`, "[demo] service returned active state\n"],
      complete: () => {
        const node = findNode(payload.nodeId);
        if (node) Object.assign(node, stamp({ ...node, status: "online", lastCheckedAt: now() }));
        saveState();
        return { ok: true, action: payload.action || "restart" };
      }
    });
    return respond({ job });
  },
  deleteNode: async (nodeId) => {
    const node = findNode(nodeId);
    if (node?.monitorOnly) {
      state.nodes = state.nodes.filter((item) => item.id !== nodeId);
      state.connections = state.connections.filter((item) => item.nodeId !== nodeId);
      state.remoteTraffic = state.remoteTraffic.filter((item) => item.nodeId !== nodeId);
      state.bans = state.bans.filter((item) => item.nodeId !== nodeId);
      saveState();
      return respond({ ok: true, monitorOnly: true });
    }
    if (node) Object.assign(node, stamp({ ...node, status: "deleting" }));
    const job = createJob({
      type: "node-delete",
      title: `Delete ${nodeName(nodeId)}`,
      logs: ["[demo] stopping node service\n", "[demo] removing managed config files\n", "[demo] keeping persistent hook online\n"],
      complete: () => {
        state.nodes = state.nodes.filter((item) => item.id !== nodeId);
        state.connections = state.connections.filter((item) => item.nodeId !== nodeId);
        state.remoteTraffic = state.remoteTraffic.filter((item) => item.nodeId !== nodeId);
        state.bans = state.bans.filter((item) => item.nodeId !== nodeId);
        saveState();
        return { ok: true };
      }
    });
    saveState();
    return respond({ job, node });
  },
  forceClearNode: async (nodeId) => {
    state.nodes = state.nodes.filter((node) => node.id !== nodeId);
    state.connections = state.connections.filter((item) => item.nodeId !== nodeId);
    state.remoteTraffic = state.remoteTraffic.filter((item) => item.nodeId !== nodeId);
    state.bans = state.bans.filter((item) => item.nodeId !== nodeId);
    saveState();
    return respond({ ok: true, force: true });
  },
  optimize: async (payload = {}) => {
    const needsReboot = String(payload.action || "").includes("xanmod") || String(payload.action || "").includes("kernel");
    const job = createJob({
      type: "optimize",
      title: `Optimize ${serverName(payload.serverId)}: ${payload.action}`,
      logs: ["[demo] downloading Linux-NetSpeed helper\n", `[demo] applying ${payload.action}\n`, "[demo] reading sysctl and tc qdisc state\n"],
      complete: () => optimizeResult(needsReboot)
    });
    return respond({ job });
  },
  ipQuality: async (payload = {}) => {
    const createIpqJob = (mode) => createJob({
      type: "ipquality",
      title: `IPQuality ${serverName(payload.serverId)} ${mode === "ipv6" ? "IPv6" : "IPv4"}`,
      logs: [`[demo] starting IPQuality ${mode}\n`, "[demo] probing media unlock matrix\n", "[demo] redacting sensitive address details\n"],
      complete: () => ipQualityResult(mode, serverName(payload.serverId))
    });
    if (payload.mode === "dual") return respond({ jobs: [createIpqJob("ipv4"), createIpqJob("ipv6")] });
    return respond({ job: createIpqJob(payload.mode || "ipv4") });
  },
  runCommand: async (payload = {}) => {
    const command = payload.command || "";
    const job = createJob({
      type: "exec",
      title: `Terminal ${serverName(payload.serverId)}`,
      logs: commandLogs(command),
      complete: () => terminalResult(command)
    });
    return respond({ job });
  },
  blockSourceIp: async (payload = {}) => {
    const nodeIds = Array.from(new Set(payload.nodeIds || []));
    const target = payload.targetIp || "203.0.113.66";
    for (const nodeId of nodeIds) upsertDemoBlacklist(nodeId, target);
    const jobs = nodeIds.map((nodeId) => createJob({
      type: "ban",
      title: `Block source IP ${target} on ${nodeName(nodeId)}`,
      logs: [`[demo] validating ${target}\n`, `[demo] writing nftables DROP rule for ${nodeName(nodeId)}\n`, "[demo] rule active in simulated firewall\n"],
      complete: () => {
        const entry = upsertDemoBlacklist(nodeId, target);
        saveState();
        return { ok: true, action: "ban", target, ipFamily: target.includes(":") ? 6 : 4, nodeId, remoteKey: entry?.remoteKey };
      }
    }));
    saveState();
    return respond({ jobs });
  },
  unblockSourceIp: async (payload = {}) => {
    const nodeIds = Array.from(new Set(payload.nodeIds || []));
    const target = payload.targetIp || "203.0.113.66";
    const jobs = nodeIds.map((nodeId) => createJob({
      type: "unban",
      title: `Unblock source IP ${target} on ${nodeName(nodeId)}`,
      logs: [`[demo] validating ${target}\n`, `[demo] removing firewall DROP rule for ${nodeName(nodeId)}\n`, "[demo] blacklist entry removed from simulated node store\n"],
      complete: () => {
        removeDemoBlacklist(nodeId, target);
        saveState();
        return { ok: true, action: "unban", target, ipFamily: target.includes(":") ? 6 : 4, nodeId };
      }
    }));
    saveState();
    return respond({ jobs });
  },
  job: async (jobId) => respond({ job: state.jobs.find((job) => job.id === jobId) || null }),
  clearJobs: async () => {
    state.jobs = [];
    saveState();
    return respond({ ok: true });
  }
};
