// Generated from the former App.vue script so the page split preserves behavior.
import { computed, nextTick, reactive, ref, watch } from "vue";
import { defineStore } from "pinia";
import { api, subscribeJob } from "../api.js";

export const useAppStore = defineStore("app", () => {

const state = reactive({
  servers: [],
  nodes: [],
  users: [],
  connections: [],
  remoteTraffic: [],
  bans: [],
  jobs: [],
  audit: [],
  providers: [],
  monitorProtocols: []
});

const loading = ref(true);
const busy = ref(false);
const toast = ref("");
const auth = reactive({ checked: false, authenticated: false });
const authBusy = ref(false);
const loginForm = reactive({ password: "" });
const passwordForm = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });
let refreshTimer = null;
const pageDefinitions = [
  { id: "overview", title: "舰队总览", description: "服务器、节点、连接来源与流量态势。" },
  { id: "servers", title: "服务器管理", description: "添加服务器、安装或升级持久化 Hook，并维护服务器名称、分组与连接信息。" },
  { id: "deploy", title: "节点部署", description: "在 Hook 已就绪的服务器上部署或重新部署 Hysteria2 / Trojan 节点。" },
  { id: "nodes", title: "节点管理", description: "查看节点状态、资源同步结果，并把已有 sing-box 主流协议节点纳入监控。" },
  { id: "connections", title: "连接统计与封禁", description: "按客户端 IP 查看流量，维护节点黑名单，并支持按 IP 或节点分组查看。" },
  { id: "tools", title: "服务器工具", description: "执行性能优化和 IPQuality 双栈检测等 Hook 侧任务。" },
  { id: "terminal", title: "服务器终端", description: "通过已安装的持久化 Hook 在目标服务器上执行维护命令。" },
  { id: "logs", title: "任务日志", description: "查看当前任务的 Hook 输出，以及需要排障时的原始执行日志。" },
  { id: "about", title: "关于 SimpleUI", description: "项目信息、发布信息与桌面端构建目标。" }
];
const pageMap = Object.fromEntries(pageDefinitions.map((page) => [page.id, page]));
const activePage = ref("overview");
const pageMeta = computed(() => pageMap[activePage.value] || pageMap.overview);
const projectInfo = {
  name: "SimpleUI Node Console",
  version: __APP_VERSION__,
  author: __APP_AUTHOR__,
  homepage: __APP_HOMEPAGE__,
  releaseDate: "2026-05-08"
};
const releaseTargets = [
  { platform: "Windows", arch: "x64", packages: "exe / zip" },
  { platform: "macOS", arch: "arm64", packages: "dmg / zip" },
  { platform: "Linux", arch: "x64", packages: "deb / zip" }
];
const selectedNodes = ref([]);
const selectedBlacklistRecords = ref([]);
const blacklistGroupMode = ref("target");
const collapsedBlacklistGroups = ref([]);
const serversGrouped = ref(false);
const nodesGrouped = ref(false);
const banNodeModalOpen = ref(false);
const manualNodeModalOpen = ref(false);
const banNodeSearch = ref("");
const banNodeGroupFilter = ref("all");
const banNodesGrouped = ref(true);
const jobLogs = ref([]);
const activeJob = ref(null);
const toolFeedback = ref(null);
const toolFeedbackLogExpanded = ref(false);
const pageTaskFeedback = reactive({
  servers: null,
  deploy: null,
  nodes: null,
  connections: null
});
const ipQualityModal = ref(null);
const taskPanelCollapsed = ref(false);
const taskSearch = ref("");
const taskStatusFilter = ref("all");
const taskTypeFilter = ref("all");
const connectionStatsCollapsed = ref(false);
const connectionStatsGrouped = ref(false);
const connectionSearch = ref("");
const connectionNodeFilter = ref("all");
const connectionProtocolFilter = ref("all");
const connectionFamilyFilter = ref("all");
const connectionSortKey = ref("total");
const connectionSortDirection = ref("desc");
const editingServerId = ref("");
const editingNodeId = ref("");
const editingNodeName = ref("");

const serverForm = reactive({ id: "", name: "", host: "", port: 22, hookPort: 37877, location: "", group: "" });
const serverEditForm = reactive({ name: "", host: "", port: 22, hookPort: 37877, location: "", group: "" });
const serverCredential = reactive({ username: "root", password: "" });

const deployServerId = ref("");
const deployProtocol = ref("hysteria2");
const deployNode = reactive({
  name: "",
  group: "",
  domain: "",
  listenPort: 443,
  masqueradeUrl: "https://www.bing.com/",
  tlsMode: "acme-http",
  acmeEmail: "",
  dnsProvider: "cloudflare",
  dnsToken: "",
  dnsOverrideDomain: "",
  dnsUser: "",
  dnsServer: "api.name.com",
  selfSignedDomain: "bing.com",
  selfSignedIpMode: "ipv4",
  selfSignedHost: "",
  certPath: "",
  keyPath: "",
  ignoreClientBandwidth: false,
  obfsEnabled: false,
  obfsPassword: "",
  sniffEnabled: false,
  portHoppingEnabled: false,
  jumpPortStart: 20000,
  jumpPortEnd: 20010,
  jumpPortInterface: "eth0",
  jumpPortIpv6Enabled: false,
  jumpPortIpv6Interface: ""
});
const usersText = ref("");
const manualNodeForm = reactive({
  serverId: "",
  protocol: "shadowsocks",
  name: "",
  group: "",
  endpoint: "",
  domain: "",
  listenPort: 443,
  service: "sing-box.service",
  serviceProtocol: "tcp,udp"
});
const sourceIp = ref("");
const toolServerId = ref("");
const terminalServerId = ref("");
const terminalSessions = reactive({});
const terminalSubscriptions = new Map();
const terminalOutputRef = ref(null);
const terminalCommandInputRef = ref(null);
const optimizeAction = ref("status");
const ipQualityForm = reactive({
  mode: "dual",
  language: "cn",
  interface: "",
  proxy: "",
  fullIp: false,
  privacy: false
});

const optimizeActions = [
  { value: "status", label: "查看当前优化状态" },
  { value: "bbr-fq", label: "BBR + FQ" },
  { value: "bbr-fq-pie", label: "BBR + FQ_PIE" },
  { value: "bbr-cake", label: "BBR + CAKE" },
  { value: "bbrplus-fq", label: "BBRplus + FQ" },
  { value: "ecn-on", label: "开启 ECN" },
  { value: "ecn-off", label: "关闭 ECN" },
  { value: "adaptive-system", label: "系统网络自适应优化" },
  { value: "anti-cc", label: "防 CC/DDOS 轻量优化" },
  { value: "ipv6-on", label: "开启 IPv6" },
  { value: "ipv6-off", label: "禁用 IPv6" },
  { value: "xanmod-main", label: "安装 Xanmod main 内核" },
  { value: "xanmod-lts", label: "安装 Xanmod LTS 内核" },
  { value: "xanmod-edge", label: "安装 Xanmod EDGE 内核" },
  { value: "xanmod-rt", label: "安装 Xanmod RT 内核" },
  { value: "official-stable-kernel", label: "安装官方稳定内核" },
  { value: "official-latest-kernel", label: "安装官方最新内核" },
  { value: "show-kernels", label: "查看已安装内核" }
];
const rebootOptimizeActions = new Set([
  "adaptive-system",
  "xanmod-main",
  "xanmod-lts",
  "xanmod-edge",
  "xanmod-rt",
  "official-stable-kernel",
  "official-latest-kernel"
]);
const taskStatusOptions = [
  { value: "all", label: "全部状态" },
  { value: "running", label: "执行中" },
  { value: "queued", label: "队列中" },
  { value: "success", label: "完成" },
  { value: "failed", label: "失败" }
];
const serverPageTaskTypes = new Set(["hook-install", "hook-upgrade", "server-delete", "server-reboot"]);
const pageTaskFeedbackConfig = {
  servers: { title: "服务器任务反馈", types: serverPageTaskTypes },
  deploy: { title: "部署任务反馈", types: new Set(["deploy", "node-update"]) },
  nodes: { title: "节点任务反馈", types: new Set(["status", "service", "node-delete"]) },
  connections: { title: "封禁任务反馈", types: new Set(["ban", "unban", "batch"]) }
};
const connectionSortOptions = [
  { value: "total", label: "总流量" },
  { value: "rx", label: "RX 流量" },
  { value: "tx", label: "TX 流量" },
  { value: "connections", label: "连接数" },
  { value: "lastSeenAt", label: "刷新时间" },
  { value: "clientIp", label: "客户端 IP" },
  { value: "node", label: "节点名称" },
  { value: "protocol", label: "协议" }
];
const blacklistGroupModes = [
  { value: "target", label: "按 IP 分组" },
  { value: "node", label: "按节点分组" }
];

const emptyTerminalSession = reactive({
  serverId: "",
  command: "",
  cwd: "/root",
  timeoutSeconds: 600,
  output: "",
  job: null,
  running: false
});

const currentProvider = computed(() => state.providers.find((item) => item.id === deployProtocol.value));
const monitorProtocolMap = computed(() => Object.fromEntries((state.monitorProtocols || []).map((item) => [item.id, item])));
const monitorProtocolOptions = computed(() => (state.monitorProtocols || []).filter((item) => !item.deployable));
const currentManualProtocol = computed(() => monitorProtocolMap.value[manualNodeForm.protocol]);
const isHy2 = computed(() => deployProtocol.value === "hysteria2");
const isPasswordAuthProtocol = computed(() => ["hysteria2", "trojan"].includes(deployProtocol.value));
const hasFixedListenPort = computed(() => deployProtocol.value === "trojan");
const readyServers = computed(() => state.servers.filter((server) =>
  (server.hookStatus === "online" || server.hookInstalled) && !server.hookSecurity?.upgradeRequired
));
const readyServerIds = computed(() => new Set(readyServers.value.map((server) => server.id)));
const activeTerminalSession = computed(() => ensureTerminalSession(terminalServerId.value) || emptyTerminalSession);
const serverRows = computed(() => groupedRows(state.servers, serversGrouped.value, "全部服务器", "server"));
const nodeRows = computed(() => groupedRows(state.nodes, nodesGrouped.value, "全部节点", "node"));
const nodeGroupOptions = computed(() => uniqueGroups(state.nodes));
const filteredBanNodes = computed(() => {
  const query = banNodeSearch.value.trim().toLowerCase();
  return (state.nodes || []).filter((node) => {
    if (banNodeGroupFilter.value !== "all" && groupKey(node.group) !== banNodeGroupFilter.value) return false;
    if (!query) return true;
    const haystack = [
      node.name,
      node.protocol,
      node.endpoint,
      serverName(node.serverId),
      groupLabel(node.group),
      statusLabel(node.status)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
});
const banNodeRows = computed(() => groupedRows(filteredBanNodes.value, banNodesGrouped.value, "全部节点", "node"));
const selectedNodePreview = computed(() => {
  const names = selectedNodes.value
    .map((id) => state.nodes.find((node) => node.id === id)?.name)
    .filter(Boolean);
  if (!names.length) return "未选择节点";
  const head = names.slice(0, 3).join("、");
  return names.length > 3 ? `${head} 等 ${names.length} 个节点` : head;
});
const totalTraffic = computed(() =>
  state.nodes.reduce(
    (sum, node) => ({
      tx: sum.tx + (node.traffic?.tx || 0),
      rx: sum.rx + (node.traffic?.rx || 0)
    }),
    { tx: 0, rx: 0 }
  )
);
const totalTrafficBytes = computed(() => totalTraffic.value.tx + totalTraffic.value.rx);
const onlineNodeCount = computed(() => state.nodes.filter((node) => ["online", "active", "success"].includes(node.status)).length);
const fleetOnlinePercent = computed(() => (state.servers.length ? Math.round((readyServers.value.length / state.servers.length) * 100) : 0));
const avgServerMetrics = computed(() => {
  const serversWithMetrics = state.servers.filter((server) => server.metrics);
  if (!serversWithMetrics.length) return { cpu: 0, memory: 0, disk: 0 };
  return {
    cpu: averageMetric(serversWithMetrics, (server) => server.metrics?.cpu?.usagePercent),
    memory: averageMetric(serversWithMetrics, (server) => server.metrics?.memory?.usedPercent),
    disk: averageMetric(serversWithMetrics, (server) => server.metrics?.disk?.usedPercent)
  };
});
const fleetHealth = computed(() => {
  if (!state.servers.length) {
    return {
      label: "等待接入",
      summary: "还没有服务器接入 SimpleUI。",
      tone: "unknown"
    };
  }
  const offline = state.servers.length - readyServers.value.length;
  const failingNodes = state.nodes.filter((node) => ["failed", "unreachable", "cleanup-failed"].includes(node.status)).length;
  if (offline || failingNodes) {
    return {
      label: "需要关注",
      summary: `${readyServers.value.length}/${state.servers.length} 台服务器在线，${failingNodes} 个节点异常。`,
      tone: "warning"
    };
  }
  return {
    label: "运行平稳",
    summary: `${readyServers.value.length} 台服务器与 ${onlineNodeCount.value}/${state.nodes.length || 0} 个节点保持在线。`,
    tone: "online"
  };
});
const overviewServers = computed(() => {
  const rows = state.servers.map((server) => {
    const nodes = state.nodes.filter((node) => node.serverId === server.id);
    const traffic = nodes.reduce((sum, node) => sum + (node.traffic?.tx || 0) + (node.traffic?.rx || 0), 0);
    const activeConnections = (state.connections || []).filter((connection) => connection.serverId === server.id).length;
    return { server, nodes, traffic, activeConnections };
  });
  return rows.sort((a, b) => {
    const aReady = readyServerIds.value.has(a.server.id) ? 1 : 0;
    const bReady = readyServerIds.value.has(b.server.id) ? 1 : 0;
    return bReady - aReady || b.traffic - a.traffic || a.server.name.localeCompare(b.server.name, "zh-Hans-CN");
  });
});
const maxServerTraffic = computed(() => Math.max(1, ...overviewServers.value.map((item) => item.traffic)));
const topTrafficNodes = computed(() =>
  [...state.nodes]
    .map((node) => ({
      node,
      traffic: (node.traffic?.tx || 0) + (node.traffic?.rx || 0)
    }))
    .sort((a, b) => b.traffic - a.traffic)
    .slice(0, 6)
);
const maxNodeTraffic = computed(() => Math.max(1, ...topTrafficNodes.value.map((item) => item.traffic)));
const topRemoteTraffic = computed(() =>
  [...(state.remoteTraffic || [])]
    .sort((a, b) => (b.total || (b.rx || 0) + (b.tx || 0)) - (a.total || (a.rx || 0) + (a.tx || 0)))
    .slice(0, 6)
);
const latestSyncAt = computed(() => {
  const times = [
    ...state.servers.map((server) => server.metrics?.updatedAt),
    ...state.nodes.map((node) => node.lastCheckedAt)
  ].filter(Boolean);
  if (!times.length) return "";
  return times.sort().at(-1);
});
const latestIpQualityJob = computed(() => state.jobs.find((job) => job.type === "ipquality" && job.result?.ok));
const latestIpQualityResult = computed(() => latestIpQualityJob.value?.result || null);
const latestOptimizeJob = computed(() => state.jobs.find((job) => job.type === "optimize" && job.result && typeof job.result === "object"));
const latestOptimizeResult = computed(() => latestOptimizeJob.value?.result || null);
const visibleJobs = computed(() => {
  const jobs = [];
  const seen = new Set();
  if (activeJob.value?.id) {
    jobs.push(activeJob.value);
    seen.add(activeJob.value.id);
  }
  for (const job of state.jobs || []) {
    if (seen.has(job.id)) continue;
    jobs.push(job);
    seen.add(job.id);
  }
  return jobs;
});
const activePageTaskFeedback = computed(() => pageTaskFeedbackConfig[activePage.value] || null);
const activePageTask = computed(() => (activePageTaskFeedback.value ? pageTaskFeedback[activePage.value] : null));
const activePageTaskCards = computed(() => {
  const job = activePageTask.value;
  return job ? [job] : [];
});
const taskTypeOptions = computed(() => {
  const types = Array.from(new Set(visibleJobs.value.map((job) => job.type).filter(Boolean)));
  return types.map((type) => ({ value: type, label: jobKindLabel(type) }));
});
const filteredJobs = computed(() => {
  const query = taskSearch.value.trim().toLowerCase();
  return visibleJobs.value.filter((job) => {
    if (taskStatusFilter.value !== "all" && job.status !== taskStatusFilter.value) return false;
    if (taskTypeFilter.value !== "all" && job.type !== taskTypeFilter.value) return false;
    if (!query) return true;
    const haystack = [
      job.title,
      jobKindLabel(job.type),
      statusLabel(job.status),
      jobSummary(job),
      job.error,
      job.result?.reportUrl,
      job.result?.endpoint,
      job.result?.hookUrl
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
});
const connectionNodeOptions = computed(() => {
  const ids = new Set([
    ...(state.remoteTraffic || []).map((item) => item.nodeId),
    ...(state.connections || []).map((item) => item.nodeId)
  ].filter(Boolean));
  return Array.from(ids).map((id) => ({ value: id, label: nodeName(id) }));
});
const connectionProtocolOptions = computed(() => {
  const protocols = new Set();
  for (const item of state.remoteTraffic || []) {
    for (const protocol of item.protocols || []) {
      if (protocol) protocols.add(protocol);
    }
  }
  for (const connection of state.connections || []) {
    for (const protocol of connection.protocols || [connection.protocol]) {
      if (protocol) protocols.add(protocol);
    }
  }
  return Array.from(protocols).sort();
});
const filteredRemoteTraffic = computed(() => {
  const query = connectionSearch.value.trim().toLowerCase();
  return (state.remoteTraffic || []).filter((item) => {
    if (connectionFamilyFilter.value !== "all" && String(item.ipFamily || "") !== connectionFamilyFilter.value) return false;
    if (connectionNodeFilter.value !== "all" && item.nodeId !== connectionNodeFilter.value) return false;
    if (connectionProtocolFilter.value !== "all" && !(item.protocols || []).includes(connectionProtocolFilter.value)) return false;
    if (!query) return true;
    const haystack = [
      trafficClientIp(item),
      nodeName(item.nodeId),
      ...(item.protocols || []),
      item.connections,
      fmtBytes(item.rx),
      fmtBytes(item.tx),
      fmtBytes(item.total || ((item.rx || 0) + (item.tx || 0))),
      fmtTime(item.lastSeenAt)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
});
const filteredConnections = computed(() => {
  const query = connectionSearch.value.trim().toLowerCase();
  return (state.connections || []).filter((connection) => {
    if (connectionFamilyFilter.value !== "all" && String(connection.ipFamily || "") !== connectionFamilyFilter.value) return false;
    if (connectionNodeFilter.value !== "all" && connection.nodeId !== connectionNodeFilter.value) return false;
    if (connectionProtocolFilter.value !== "all" && !(connection.protocols || [connection.protocol]).includes(connectionProtocolFilter.value)) return false;
    if (!query) return true;
    const haystack = [
      connection.sourceIp,
      nodeName(connection.nodeId),
      connection.remote,
      connection.local,
      connection.protocol,
      ...(connection.protocols || []),
      fmtBytes(connection.total || ((connection.rx || 0) + (connection.tx || 0))),
      connection.connections,
      connection.state
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
});
const sortedRemoteTraffic = computed(() => sortConnectionItems(filteredRemoteTraffic.value, "traffic"));
const sortedConnections = computed(() => sortConnectionItems(filteredConnections.value, "connection"));
const remoteTrafficRows = computed(() =>
  groupedRows(sortedRemoteTraffic.value, connectionStatsGrouped.value, "全部客户端 IP", "traffic", (item) => nodeGroupById(item.nodeId))
);
const connectionRows = computed(() =>
  groupedRows(sortedConnections.value, connectionStatsGrouped.value, "全部连接", "connection", (item) => nodeGroupById(item.nodeId))
);
const activeBlacklistEntries = computed(() =>
  (state.bans || [])
    .flatMap(expandBlacklistEntry)
    .filter((entry) => blacklistEntryActive(entry) && entry.target && entry.nodeId)
);
const blacklistRecordRows = computed(() =>
  activeBlacklistEntries.value
    .map(blacklistRecordRow)
    .filter((record) => record.key)
);
const blacklistTargetRows = computed(() => {
  const buckets = new Map();
  for (const record of blacklistRecordRows.value) {
    const key = blacklistTargetKey(record.target);
    if (!key) continue;
    const bucket = buckets.get(key) || {
      key: `target:${key}`,
      title: record.target,
      detail: record.ipFamily ? `IPv${record.ipFamily}` : "IP/CIDR",
      nodeIds: new Set(),
      serverIds: new Set(),
      entries: [],
      updatedAt: record.updatedAt
    };
    bucket.entries.push(record);
    bucket.nodeIds.add(record.nodeId);
    if (record.serverId) bucket.serverIds.add(record.serverId);
    if (!bucket.detail && record.ipFamily) bucket.detail = `IPv${record.ipFamily}`;
    bucket.updatedAt = latestTime(bucket.updatedAt, record.updatedAt);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values())
    .map((row) => ({
      ...row,
      nodeIds: Array.from(row.nodeIds),
      serverIds: Array.from(row.serverIds),
      count: row.entries.length,
      countLabel: `${row.entries.length} 条节点记录`
    }))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime() || a.title.localeCompare(b.title));
});
const nodeBlacklistRows = computed(() =>
  state.nodes
    .map((node) => {
      const entries = blacklistRecordRows.value
        .filter((record) => record.nodeId === node.id)
        .sort((a, b) => String(a.target).localeCompare(String(b.target)));
      return {
        key: `node:${node.id}`,
        groupKey: groupKey(node.group),
        groupLabel: groupLabel(node.group),
        title: node.name,
        detail: `${serverName(node.serverId)} / ${nodeProtocolLabel(node.protocol)}`,
        count: entries.length,
        countLabel: `${entries.length} 个 IP`,
        entries,
        nodeIds: [node.id],
        serverIds: node.serverId ? [node.serverId] : [],
        updatedAt: blacklistRowLatest(entries)
      };
    })
    .filter((row) => row.entries.length)
    .sort((a, b) => serverName(a.serverIds[0]).localeCompare(serverName(b.serverIds[0]), "zh-Hans-CN") || a.title.localeCompare(b.title, "zh-Hans-CN"))
);
const nodeGroupBlacklistRows = computed(() => {
  const buckets = new Map();
  for (const row of nodeBlacklistRows.value) {
    const key = row.groupKey || "__ungrouped__";
    const bucket = buckets.get(key) || {
      key: `node-group:${key}`,
      title: row.groupLabel || "无分组",
      detail: "节点分组",
      count: 0,
      countLabel: "",
      entries: [],
      children: []
    };
    bucket.children.push(row);
    bucket.entries.push(...row.entries);
    bucket.count = bucket.entries.length;
    bucket.countLabel = `${bucket.children.length} 个节点 / ${bucket.entries.length} 条记录`;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).sort((a, b) =>
    a.key === "node-group:__ungrouped__" ? 1 : b.key === "node-group:__ungrouped__" ? -1 : a.title.localeCompare(b.title, "zh-Hans-CN")
  );
});
const blacklistRows = computed(() => {
  if (blacklistGroupMode.value === "node") return nodeGroupBlacklistRows.value;
  return blacklistTargetRows.value;
});
const selectedBlacklistRows = computed(() => {
  const selected = new Set(selectedBlacklistRecords.value);
  return blacklistRecordRows.value.filter((record) => selected.has(record.key));
});
const blacklistActiveModeLabel = computed(() => blacklistGroupModes.find((mode) => mode.value === blacklistGroupMode.value)?.label || "按 IP 分组");

function fmtBytes(value = 0) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value || 0);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function fmtPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(Number(value) >= 10 ? 0 : 1)}%`;
}

function fmtRate(value = 0) {
  return `${fmtBytes(value)}/s`;
}

function trafficClientIp(item = {}) {
  return item.clientIp || item.remoteIp || item.sourceIp || "";
}

function trafficTotal(item = {}) {
  return Number(item.total ?? (Number(item.rx || 0) + Number(item.tx || 0)));
}

function latestTime(a, b) {
  const aTime = new Date(a || 0).getTime() || 0;
  const bTime = new Date(b || 0).getTime() || 0;
  return bTime > aTime ? b : a;
}

function blacklistTargetKey(target) {
  return String(target || "").trim().toLowerCase();
}

function blacklistRecordKey(entry = {}) {
  const targetKey = blacklistTargetKey(entry.target);
  return entry.nodeId && targetKey ? `${entry.nodeId}::${targetKey}` : "";
}

function blacklistEntryActive(entry = {}) {
  return !["removed", "inactive"].includes(entry.status);
}

function expandBlacklistEntry(entry = {}) {
  if (entry.nodeId) return [entry];
  return (entry.nodeIds || [])
    .map((nodeId) => {
      const node = state.nodes.find((item) => item.id === nodeId);
      return {
        ...entry,
        nodeId,
        serverId: entry.serverId || node?.serverId || ""
      };
    })
    .filter((item) => item.nodeId);
}

function blacklistRecordRow(entry = {}) {
  const node = state.nodes.find((item) => item.id === entry.nodeId);
  const serverId = entry.serverId || node?.serverId || "";
  const updatedAt = entry.lastSeenAt || entry.updatedAt || entry.createdAt;
  return {
    ...entry,
    key: blacklistRecordKey(entry),
    serverId,
    nodeLabel: node?.name || nodeName(entry.nodeId),
    nodeDetail: node ? nodeProtocolLabel(node.protocol) : "",
    serverLabel: serverName(serverId),
    targetDetail: entry.ipFamily ? `IPv${entry.ipFamily}` : "IP/CIDR",
    updatedAt
  };
}

function blacklistRowLatest(entries = []) {
  return entries.reduce((latest, entry) => latestTime(latest, entry.lastSeenAt || entry.updatedAt || entry.createdAt), "");
}

function connectionSortValue(item = {}, kind = "traffic", key = connectionSortKey.value) {
  if (key === "clientIp") return kind === "traffic" ? trafficClientIp(item) : item.sourceIp;
  if (key === "node") return nodeName(item.nodeId);
  if (key === "protocol") return kind === "traffic" ? (item.protocols || []).join(", ") : (item.protocols || [item.protocol]).join(", ");
  if (key === "lastSeenAt") return new Date(item.lastSeenAt || item.updatedAt || 0).getTime() || 0;
  if (key === "rx") return Number(item.rx || 0);
  if (key === "tx") return Number(item.tx || 0);
  if (key === "connections") return kind === "traffic" ? Number(item.connections || 0) : Number(item.connections || 1);
  return trafficTotal(item);
}

function compareSortValues(a, b) {
  const aNumber = typeof a === "number" && Number.isFinite(a);
  const bNumber = typeof b === "number" && Number.isFinite(b);
  if (aNumber || bNumber) return Number(a || 0) - Number(b || 0);
  return String(a || "").localeCompare(String(b || ""), "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function sortConnectionItems(items = [], kind = "traffic") {
  const direction = connectionSortDirection.value === "asc" ? 1 : -1;
  const key = connectionSortKey.value;
  return [...(items || [])].sort((a, b) => {
    const primary = compareSortValues(connectionSortValue(a, kind, key), connectionSortValue(b, kind, key));
    if (primary) return primary * direction;
    const clientCompare = compareSortValues(kind === "traffic" ? trafficClientIp(a) : a.sourceIp, kind === "traffic" ? trafficClientIp(b) : b.sourceIp);
    if (clientCompare) return clientCompare;
    return compareSortValues(nodeName(a.nodeId), nodeName(b.nodeId));
  });
}

function averageMetric(items, getter) {
  const values = items.map((item) => Number(getter(item))).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampPercent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function percentStyle(value, max = 100) {
  const width = max ? clampPercent((Number(value || 0) / max) * 100) : 0;
  return { width: `${width}%` };
}

function fmtTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusLabel(status) {
  if (status === "online" || status === "active") return "在线";
  if (status === "success") return "完成";
  if (status === "running") return "执行中";
  if (status === "queued") return "队列中";
  if (status === "installing") return "安装中";
  if (status === "deleting") return "删除中";
  if (status === "updating") return "更新中";
  if (status === "rebooting") return "重启中";
  if (status === "unreachable") return "不可达";
  if (status === "cleanup-failed") return "清理失败";
  if (status === "warning") return "注意";
  if (status === "failed") return "失败";
  return "未知";
}

function jobSummary(job) {
  if (!job) return "-";
  if (job.id === "batch") return job.status === "running" ? "批量任务执行中" : "批量任务已完成";
  if (job.status === "failed") return job.error || "执行失败";
  if (job.status === "queued") return "等待执行";
  if (job.status === "running") return "正在执行";
  const result = job.result;
  if (job.type === "ipquality" && result) {
    if (result.reportUrl) return `在线报告已生成：${result.reportUrl}`;
    if (result.rawOutput) return "原始报告已返回";
    return `报告 ${result.reportPath || "-"}`;
  }
  if (job.type === "optimize" && result && typeof result === "object") {
    return result.needsReboot
      ? `内核 ${result.kernel || "-"}，需要重启后完全生效`
      : `内核 ${result.kernel || "-"}，${result.congestionControl || "-"} / ${result.queueDiscipline || "-"}`;
  }
  if (job.type === "status" && result && typeof result === "object") {
    return `客户端 ${result.connections?.length || 0}，客户端 IP ${result.remoteTraffic?.length || 0}`;
  }
  if (job.type === "deploy") return result?.endpoint ? `节点部署完成：${result.endpoint}` : "节点部署完成";
  if (job.type === "node-update") return result?.endpoint ? `节点更新完成：${result.endpoint}` : "节点更新完成";
  if (job.type === "ban") return "封禁规则已下发";
  if (job.type === "unban") return "解封规则已下发";
  if (job.type === "node-delete") return "节点清理完成";
  if (job.type === "server-delete") return "服务器清理完成";
  if (job.type === "server-reboot") return job.result?.delaySeconds ? `服务器将在 ${job.result.delaySeconds} 秒后重启` : "服务器重启已下发";
  if (job.type === "hook-install") {
    const discovered = Number(result?.discovery?.imported || 0) + Number(result?.discovery?.updated || 0);
    if (discovered) return `Hook 已就绪，已检出 ${discovered} 个远端节点`;
    return result?.hookUrl ? `Hook 已就绪：${result.hookUrl}` : "Hook 安装完成";
  }
  if (job.type === "hook-upgrade") return result?.reachable ? "Hook 在线升级完成" : "Hook 在线升级已返回";
  if (job.type === "exec" && result && typeof result === "object") return `命令退出码 ${result.exitCode ?? "-"}`;
  return result ? "已返回结构化结果" : "完成";
}

function jobKindLabel(type) {
  const map = {
    "hook-install": "Hook",
    deploy: "部署",
    "node-update": "更新节点",
    status: "状态",
    service: "服务",
    ban: "封禁",
    unban: "解封",
    "node-delete": "卸载节点",
    "server-delete": "删除服务器",
    "server-reboot": "服务器重启",
    "hook-upgrade": "Hook 升级",
    exec: "终端命令",
    optimize: "优化",
    ipquality: "IPQuality"
  };
  return map[type] || "任务";
}

function jobTime(job) {
  return fmtTime(job?.updatedAt || job?.createdAt);
}

function canOpenJobResult(job) {
  return job?.type === "ipquality" && job?.result && (job.result.reportUrl || job.result.rawOutput);
}

function openJobResult(job) {
  if (canOpenJobResult(job)) ipQualityModal.value = job.result;
}

function toolFeedbackReports(job = toolFeedback.value) {
  if (!job) return [];
  if (Array.isArray(job.reports) && job.reports.length) return job.reports;
  if (Array.isArray(job.result?.reports) && job.result.reports.length) return job.result.reports;
  if (job.result?.reportUrl || job.result?.rawOutput) return [job.result];
  return [];
}

function canOpenToolFeedbackResult(job = toolFeedback.value) {
  return toolFeedbackReports(job).some((report) => report.reportUrl || report.rawOutput);
}

function openToolFeedbackResult(job = toolFeedback.value) {
  const reports = toolFeedbackReports(job);
  if (!reports.length) return;
  ipQualityModal.value = reports.length > 1 ? { reports } : reports[0];
}

function openToolReport(report) {
  if (report?.reportUrl || report?.rawOutput) ipQualityModal.value = report;
}

function toolFeedbackSummary(job = toolFeedback.value) {
  if (!job) return "";
  if (job.status === "running") return "任务正在远端 hook 中执行，完成后这里会更新结果。";
  if (job.status === "queued") return "任务已加入队列，等待 hook 执行。";
  if (job.status === "failed") return job.error || "执行失败，请展开输出查看原因。";
  const reports = toolFeedbackReports(job);
  if (reports.length) return `IPQuality 已返回 ${reports.length} 份检测结果，可直接打开报告。`;
  return jobSummary(job);
}

function toolFeedbackLogText(job = toolFeedback.value) {
  const text = (job?.logs || []).join("");
  return text.trim() ? text : "等待 Hook 输出...";
}

function taskLogText(job) {
  const text = (job?.logs || []).join("");
  return text.trim() ? text : "等待 Hook 输出...";
}

function taskHasLogs(job) {
  return Boolean((job?.logs || []).length);
}

function ensureTerminalSession(serverId) {
  if (!serverId) return null;
  if (!terminalSessions[serverId]) {
    terminalSessions[serverId] = {
      serverId,
      command: "",
      cwd: "/root",
      timeoutSeconds: 600,
      output: "",
      job: null,
      running: false
    };
  }
  return terminalSessions[serverId];
}

function appendTerminalOutput(serverId, text) {
  const session = ensureTerminalSession(serverId);
  if (!session) return;
  session.output = `${session.output}${text}`.slice(-120_000);
  scrollTerminalToBottom();
}

function scrollTerminalToBottom() {
  nextTick(() => {
    const element = terminalOutputRef.value;
    if (element) element.scrollTop = element.scrollHeight;
  });
}

function focusTerminalInput() {
  nextTick(() => {
    terminalCommandInputRef.value?.focus?.();
  });
}

function closeTerminalSubscription(serverId = "") {
  if (serverId) {
    const unsubscribe = terminalSubscriptions.get(serverId);
    if (unsubscribe) unsubscribe();
    terminalSubscriptions.delete(serverId);
    return;
  }
  for (const unsubscribe of terminalSubscriptions.values()) {
    unsubscribe();
  }
  terminalSubscriptions.clear();
}

function terminalSessionRunning(session = activeTerminalSession.value) {
  return Boolean(session?.running || ["queued", "running"].includes(session?.job?.status));
}

function terminalPrompt(session = activeTerminalSession.value) {
  if (!session?.serverId) return "$";
  return `${serverName(session.serverId)}:${session.cwd || "/root"}$`;
}

function isSimpleCdCommand(command = "") {
  const text = String(command || "").trim();
  return text === "cd" || /^cd\s+[^;&|`$()]+$/.test(text);
}

function cdTarget(command = "") {
  const text = String(command || "").trim();
  return text === "cd" ? "~" : text.slice(3).trim();
}

function shellQuote(value = "") {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function serverName(serverId) {
  return state.servers.find((server) => server.id === serverId)?.name || "未知服务器";
}

function nodeName(nodeId) {
  return state.nodes.find((node) => node.id === nodeId)?.name || "未知节点";
}

function nodeProtocolLabel(protocol) {
  if (protocol === "hysteria2") return "HY2";
  if (protocol === "trojan") return "Trojan";
  if (monitorProtocolMap.value[protocol]?.name) return monitorProtocolMap.value[protocol].name;
  return protocol || "-";
}

function nodeSourceLabel(node = {}) {
  if (node.managedBy === "sing-box") return "sing-box 自动发现";
  if (node.managedBy === "manual" || node.importSource === "manual-monitor") return "手动监控";
  if (node.monitorOnly) return "仅监控";
  return "SimpleUI 管理";
}

function isDeployableNode(node = {}) {
  return state.providers.some((provider) => provider.id === node.protocol) && !node.monitorOnly;
}

function canControlNodeService(node = {}) {
  return readyServerIds.value.has(node.serverId) && Boolean(node.service || isDeployableNode(node));
}

function nodeGroupById(nodeId) {
  return state.nodes.find((node) => node.id === nodeId)?.group || "";
}

function groupKey(value) {
  const clean = String(value || "").trim();
  return clean || "__ungrouped__";
}

function groupLabel(value) {
  const clean = String(value || "").trim();
  return clean || "无分组";
}

function uniqueGroups(items = []) {
  const groups = new Map();
  for (const item of items || []) {
    const key = groupKey(item.group);
    if (!groups.has(key)) groups.set(key, groupLabel(item.group));
  }
  return Array.from(groups.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => (a.value === "__ungrouped__" ? 1 : b.value === "__ungrouped__" ? -1 : a.label.localeCompare(b.label, "zh-Hans-CN")));
}

function groupedRows(items = [], grouped, allLabel, itemKey, getGroup = (item) => item.group) {
  if (!grouped) {
    return (items || []).map((item) => ({ type: itemKey, key: `${itemKey}-${item.id}`, [itemKey]: item }));
  }
  const groups = new Map();
  for (const item of items || []) {
    const groupValue = getGroup(item);
    const key = groupKey(groupValue);
    if (!groups.has(key)) groups.set(key, { key, label: groupLabel(groupValue), items: [] });
    groups.get(key).items.push(item);
  }
  if (!groups.size) return [];
  const ordered = Array.from(groups.values()).sort((a, b) =>
    a.key === "__ungrouped__" ? 1 : b.key === "__ungrouped__" ? -1 : a.label.localeCompare(b.label, "zh-Hans-CN")
  );
  return ordered.flatMap((group) => [
    { type: "group", key: `group-${itemKey}-${group.key}`, label: group.label || allLabel, count: group.items.length },
    ...group.items.map((item) => ({ type: itemKey, key: `${itemKey}-${item.id}`, [itemKey]: item }))
  ]);
}

function normalizePageId(value) {
  const pageId = String(value || "").replace(/^#/, "") || "overview";
  if (pageId === "hooks") return "logs";
  return pageMap[pageId] ? pageId : "overview";
}

function syncPageFromHash() {
  activePage.value = normalizePageId(window.location.hash);
}

function parseUsers(text, protocol = deployProtocol.value) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (["hysteria2", "trojan"].includes(protocol) && !line.includes(":")) {
        return { username: "default", password: line };
      }
      const [username, ...rest] = line.split(":");
      return { username: username.trim(), password: rest.join(":").trim() };
    })
    .filter((user) => user.username && user.password);
}

function stopRefresh() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startRefresh() {
  stopRefresh();
  refreshTimer = window.setInterval(() => {
    load().catch(showError);
  }, 5000);
}

function clearRuntimeState() {
  Object.assign(state, {
    servers: [],
    nodes: [],
    users: [],
    connections: [],
    remoteTraffic: [],
    bans: [],
    jobs: [],
    audit: [],
    providers: [],
    monitorProtocols: []
  });
  selectedNodes.value = [];
  selectedBlacklistRecords.value = [];
  activeJob.value = null;
  jobLogs.value = [];
  toolFeedback.value = null;
  for (const page of Object.keys(pageTaskFeedback)) {
    pageTaskFeedback[page] = null;
  }
  ipQualityModal.value = null;
  closeTerminalSubscription();
  for (const key of Object.keys(terminalSessions)) {
    delete terminalSessions[key];
  }
  terminalServerId.value = "";
}

function handleAuthError(error) {
  if (error?.status !== 401) return false;
  auth.authenticated = false;
  auth.checked = true;
  loading.value = false;
  busy.value = false;
  stopRefresh();
  clearRuntimeState();
  toast.value = "登录已过期，请重新登录。";
  return true;
}

async function checkSession() {
  try {
    const session = await api.session();
    auth.authenticated = Boolean(session.authenticated);
  } catch {
    auth.authenticated = false;
  } finally {
    auth.checked = true;
    if (!auth.authenticated) loading.value = false;
  }
}

async function login() {
  authBusy.value = true;
  toast.value = "";
  try {
    await api.login(loginForm.password);
    loginForm.password = "";
    auth.authenticated = true;
    loading.value = true;
    await load();
    startRefresh();
  } catch (error) {
    toast.value = error?.status === 401 ? "密码不正确。" : (error?.message || "登录失败");
  } finally {
    authBusy.value = false;
  }
}

async function logout() {
  authBusy.value = true;
  try {
    await api.logout();
  } catch {
    // The local session should still be discarded even if the request is interrupted.
  } finally {
    auth.authenticated = false;
    loading.value = false;
    stopRefresh();
    clearRuntimeState();
    authBusy.value = false;
  }
}

async function changeWebPassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    toast.value = "两次输入的新密码不一致。";
    return;
  }
  authBusy.value = true;
  try {
    await api.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword
    });
    Object.assign(passwordForm, { currentPassword: "", newPassword: "", confirmPassword: "" });
    toast.value = "WebUI 登录密码已更新。";
  } catch (error) {
    showError(error);
  } finally {
    authBusy.value = false;
  }
}

async function load() {
  let data;
  try {
    data = await api.bootstrap();
  } catch (error) {
    if (handleAuthError(error)) return;
    throw error;
  }
  Object.assign(state, data);
  const currentNodeIds = new Set((data.nodes || []).map((node) => node.id));
  selectedNodes.value = selectedNodes.value.filter((id) => currentNodeIds.has(id));
  const currentBlacklistRecords = new Set(blacklistRecordRows.value.map((record) => record.key));
  selectedBlacklistRecords.value = selectedBlacklistRecords.value.filter((key) => currentBlacklistRecords.has(key));
  if (!deployServerId.value && readyServers.value.length) {
    deployServerId.value = readyServers.value[0].id;
  }
  if (!manualNodeForm.serverId && readyServers.value.length) {
    manualNodeForm.serverId = readyServers.value[0].id;
  }
  if (!monitorProtocolMap.value[manualNodeForm.protocol] && monitorProtocolOptions.value.length) {
    manualNodeForm.protocol = monitorProtocolOptions.value[0].id;
  }
  if (!toolServerId.value && readyServers.value.length) {
    toolServerId.value = readyServers.value[0].id;
  }
  if (!terminalServerId.value && readyServers.value.length) {
    terminalServerId.value = readyServers.value[0].id;
  }
  if (terminalServerId.value) ensureTerminalSession(terminalServerId.value);
  loading.value = false;
}

async function syncNow() {
  loading.value = true;
  try {
    await api.sync();
  } catch (error) {
    if (!handleAuthError(error)) showError(error);
  }
  await load().catch(showError);
}

function showError(error) {
  if (handleAuthError(error)) return;
  toast.value = error?.message || String(error);
}

function startToolFeedback(job, title = job?.title) {
  toolFeedback.value = {
    ...(job || {}),
    title: title || job?.title || "工具任务",
    status: job?.status || "queued",
    createdAt: job?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: [],
    reports: []
  };
  toolFeedbackLogExpanded.value = false;
}

function appendToolFeedbackLog(line) {
  if (!toolFeedback.value) return;
  const logs = [...(toolFeedback.value.logs || []), line].slice(-500);
  const status = toolFeedback.value.status === "queued" ? "running" : toolFeedback.value.status;
  toolFeedback.value = { ...toolFeedback.value, status, logs, updatedAt: new Date().toISOString() };
}

function updateToolFeedback(patch = {}) {
  if (!toolFeedback.value) return;
  const reports = patch.reports || toolFeedback.value.reports || [];
  toolFeedback.value = {
    ...toolFeedback.value,
    ...patch,
    reports,
    updatedAt: new Date().toISOString()
  };
  if (patch.status === "failed") toolFeedbackLogExpanded.value = true;
}

function clearToolFeedback() {
  toolFeedback.value = null;
  toolFeedbackLogExpanded.value = false;
}

function startPageTaskFeedback(job, page = activePage.value, title = job?.title) {
  if (!pageTaskFeedbackConfig[page]) return;
  pageTaskFeedback[page] = {
    ...(job || {}),
    title: title || job?.title || "任务",
    feedbackPage: page,
    status: job?.status || "queued",
    createdAt: job?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: []
  };
}

function appendPageTaskFeedbackLog(page, line) {
  const current = pageTaskFeedback[page];
  if (!current) return;
  const logs = [...(current.logs || []), line].slice(-500);
  const status = current.status === "queued" ? "running" : current.status;
  pageTaskFeedback[page] = { ...current, status, logs, updatedAt: new Date().toISOString() };
}

function updatePageTaskFeedback(page, patch = {}) {
  const current = pageTaskFeedback[page];
  if (!current) return;
  pageTaskFeedback[page] = {
    ...current,
    ...patch,
    logs: patch.logs || current.logs || [],
    updatedAt: new Date().toISOString()
  };
}

function clearPageTaskFeedback(page = activePage.value) {
  if (!pageTaskFeedbackConfig[page]) return;
  pageTaskFeedback[page] = null;
}

function watchJob(job, options = {}) {
  const feedbackPage = options.feedbackPage || activePage.value;
  activeJob.value = {
    ...job,
    feedbackPage,
    logs: []
  };
  jobLogs.value = [];
  startPageTaskFeedback(job, feedbackPage, options.title);
  if (options.feedbackScope === "tools") startToolFeedback(job, options.title);
  subscribeJob(job.id, {
    onLog: (line) => {
      jobLogs.value.push(line);
      if (activeJob.value?.id === job.id) {
        activeJob.value = {
          ...activeJob.value,
          status: activeJob.value.status === "queued" ? "running" : activeJob.value.status,
          logs: [...jobLogs.value],
          updatedAt: new Date().toISOString()
        };
      }
      appendPageTaskFeedbackLog(feedbackPage, line);
      if (options.feedbackScope === "tools") appendToolFeedbackLog(line);
    },
    onDone: (done) => {
      const completedJob = { ...activeJob.value, ...done, logs: [...jobLogs.value], updatedAt: new Date().toISOString() };
      activeJob.value = completedJob;
      updatePageTaskFeedback(feedbackPage, completedJob);
      if (options.feedbackScope === "tools") updateToolFeedback(done);
      if (completedJob.type === "ipquality" && done?.result) {
        ipQualityModal.value = done.result;
      }
      busy.value = false;
      load().catch(showError);
    },
    onError: () => {
      if (activeJob.value?.id === job.id) {
        activeJob.value = {
          ...activeJob.value,
          status: "failed",
          error: "任务订阅中断，请查看任务日志确认最终状态。",
          logs: [...jobLogs.value],
          updatedAt: new Date().toISOString()
        };
      }
      updatePageTaskFeedback(feedbackPage, {
        status: "failed",
        error: "任务订阅中断，请查看任务日志确认最终状态。",
        logs: [...jobLogs.value]
      });
      if (options.feedbackScope === "tools") {
        updateToolFeedback({ status: "failed", error: "任务订阅中断，请查看任务日志确认最终状态。" });
      }
      busy.value = false;
    }
  });
}

function watchJobs(jobs, title, options = {}) {
  const feedbackPage = options.feedbackPage || activePage.value;
  const pending = new Set(jobs.map((job) => job.id));
  const ipQualityResults = [];
  let failed = 0;
  activeJob.value = {
    id: "batch",
    title,
    type: "batch",
    status: "running",
    feedbackPage,
    createdAt: new Date().toISOString(),
    logs: []
  };
  jobLogs.value = [];
  startPageTaskFeedback(activeJob.value, feedbackPage, title);
  if (options.feedbackScope === "tools") startToolFeedback(activeJob.value, title);
  for (const job of jobs) {
    jobLogs.value.push(`--- ${job.title} ---\n`);
    activeJob.value = { ...activeJob.value, logs: [...jobLogs.value], updatedAt: new Date().toISOString() };
    appendPageTaskFeedbackLog(feedbackPage, `--- ${job.title} ---\n`);
    if (options.feedbackScope === "tools") appendToolFeedbackLog(`--- ${job.title} ---\n`);
    subscribeJob(job.id, {
      onLog: (line) => {
        jobLogs.value.push(line);
        activeJob.value = {
          ...activeJob.value,
          status: activeJob.value.status === "queued" ? "running" : activeJob.value.status,
          logs: [...jobLogs.value],
          updatedAt: new Date().toISOString()
        };
        appendPageTaskFeedbackLog(feedbackPage, line);
        if (options.feedbackScope === "tools") appendToolFeedbackLog(line);
      },
      onDone: (done) => {
        if (done?.status === "failed") failed += 1;
        if (job.type === "ipquality" && done?.result) {
          ipQualityResults.push({ ...done.result, title: job.title });
          if (options.feedbackScope === "tools") updateToolFeedback({ reports: ipQualityResults });
        }
        pending.delete(job.id);
        if (!pending.size) {
          busy.value = false;
          const completedBatch = {
            ...activeJob.value,
            status: failed ? "failed" : "success",
            updatedAt: new Date().toISOString(),
            error: failed ? `${failed} 个子任务失败` : "",
            logs: [...jobLogs.value],
            result: ipQualityResults.length ? { reports: ipQualityResults } : undefined
          };
          activeJob.value = completedBatch;
          updatePageTaskFeedback(feedbackPage, completedBatch);
          if (options.feedbackScope === "tools") updateToolFeedback(completedBatch);
          if (ipQualityResults.length) {
            ipQualityModal.value = { reports: ipQualityResults };
          }
          load().catch(showError);
        }
      },
      onError: () => {
        failed += 1;
        pending.delete(job.id);
        if (!pending.size) {
          busy.value = false;
          const errorPatch = {
            status: "failed",
            error: `${failed} 个子任务失败或订阅中断`,
            logs: [...jobLogs.value],
            updatedAt: new Date().toISOString()
          };
          activeJob.value = { ...activeJob.value, ...errorPatch };
          updatePageTaskFeedback(feedbackPage, errorPatch);
          if (options.feedbackScope === "tools") updateToolFeedback(errorPatch);
        }
      }
    });
  }
}

async function clearJobs() {
  if (!window.confirm("清空任务执行记录？不会影响服务器、节点或远端 hook。")) return;
  const activeStillRunning = ["queued", "running"].includes(activeJob.value?.status);
  try {
    await api.clearJobs();
    state.jobs = [];
    if (!activeStillRunning) {
      activeJob.value = null;
      jobLogs.value = [];
    }
    taskSearch.value = "";
    taskStatusFilter.value = "all";
    taskTypeFilter.value = "all";
    for (const page of Object.keys(pageTaskFeedback)) {
      pageTaskFeedback[page] = null;
    }
  } catch (error) {
    showError(error);
  }
}

function toggleNode(nodeId, checked) {
  if (checked) {
    if (!selectedNodes.value.includes(nodeId)) selectedNodes.value = [...selectedNodes.value, nodeId];
    return;
  }
  selectedNodes.value = selectedNodes.value.filter((id) => id !== nodeId);
}

function selectFilteredBanNodes() {
  const ids = new Set(selectedNodes.value);
  for (const node of filteredBanNodes.value) ids.add(node.id);
  selectedNodes.value = Array.from(ids);
}

function clearSelectedNodes() {
  selectedNodes.value = [];
}

function toggleBlacklistRecord(key, checked) {
  if (!key) return;
  if (checked) {
    if (!selectedBlacklistRecords.value.includes(key)) selectedBlacklistRecords.value = [...selectedBlacklistRecords.value, key];
    return;
  }
  selectedBlacklistRecords.value = selectedBlacklistRecords.value.filter((item) => item !== key);
}

function toggleBlacklistGroup(row, checked) {
  const keys = new Set((row?.entries || []).map((record) => record.key).filter(Boolean));
  if (!keys.size) return;
  if (checked) {
    const selected = new Set(selectedBlacklistRecords.value);
    for (const key of keys) selected.add(key);
    selectedBlacklistRecords.value = Array.from(selected);
    return;
  }
  selectedBlacklistRecords.value = selectedBlacklistRecords.value.filter((key) => !keys.has(key));
}

function blacklistGroupSelectedCount(row = {}) {
  const selected = new Set(selectedBlacklistRecords.value);
  return (row.entries || []).filter((record) => selected.has(record.key)).length;
}

function blacklistGroupAllSelected(row = {}) {
  return !!row.entries?.length && blacklistGroupSelectedCount(row) === row.entries.length;
}

function blacklistGroupCollapsed(key) {
  return collapsedBlacklistGroups.value.includes(key);
}

function toggleBlacklistCollapse(key) {
  if (!key) return;
  if (blacklistGroupCollapsed(key)) {
    collapsedBlacklistGroups.value = collapsedBlacklistGroups.value.filter((item) => item !== key);
    return;
  }
  collapsedBlacklistGroups.value = [...collapsedBlacklistGroups.value, key];
}

function selectAllBlacklistRecords() {
  selectedBlacklistRecords.value = blacklistRows.value.flatMap((row) => row.entries.map((record) => record.key)).filter(Boolean);
}

function clearSelectedBlacklistRecords() {
  selectedBlacklistRecords.value = [];
}

watch(blacklistGroupMode, () => clearSelectedBlacklistRecords());

function prepareHookUpgrade(server) {
  Object.assign(serverForm, {
    id: server.id,
    name: server.name || "",
    host: server.host || "",
    port: server.port || 22,
    hookPort: server.hookPort || 37877,
    location: server.location || "",
    group: server.group || ""
  });
  serverCredential.username = server.sshUserHint || "root";
  serverCredential.password = "";
  window.location.hash = "servers";
}

function resetServerForm() {
  Object.assign(serverForm, { id: "", name: "", host: "", port: 22, hookPort: 37877, location: "", group: "" });
  serverCredential.password = "";
}

function startEditServer(server) {
  editingServerId.value = server.id;
  Object.assign(serverEditForm, {
    name: server.name || "",
    host: server.host || "",
    port: server.port || 22,
    hookPort: server.hookPort || 37877,
    location: server.location || "",
    group: server.group || ""
  });
}

function cancelEditServer() {
  editingServerId.value = "";
}

async function saveServer(server) {
  busy.value = true;
  try {
    await api.updateServer(server.id, { ...serverEditForm });
    editingServerId.value = "";
    await load();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function installServer() {
  busy.value = true;
  try {
    const result = await api.installServer({
      server: { ...serverForm },
      credential: { ...serverCredential }
    });
    resetServerForm();
    watchJob(result.job, { feedbackPage: "servers" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function upgradeHook(server) {
  if (!window.confirm(`通过现有 hook 在线升级 ${server.name}？如果目标服务器运行的是旧版 hook，可能需要先用 SSH 重装一次来获得在线升级能力。`)) return;
  busy.value = true;
  try {
    const result = await api.upgradeHook(server.id);
    watchJob(result.job, { feedbackPage: "servers" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function trustHookCertificate(server) {
  if (!window.confirm(`信任 ${server.name} 当前返回的 Hook TLS 证书？仅当你确认该服务器没有被中间人劫持，或刚刚重装/升级过 hook 时才应继续。`)) return;
  busy.value = true;
  try {
    const result = await api.trustHookCertificate(server.id);
    const index = state.servers.findIndex((item) => item.id === server.id);
    if (index >= 0) state.servers[index] = result.server;
    toast.value = `${server.name} 的 Hook TLS 证书已重新固定。`;
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function deleteServer(server) {
  if (!window.confirm(`删除 ${server.name} 会先卸载目标服务器上的 SimpleUI hook，并清理 SimpleUI 部署的节点。继续吗？`)) return;
  busy.value = true;
  try {
    const result = await api.deleteServer(server.id);
    watchJob(result.job, { feedbackPage: "servers" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function forceClearServer(server) {
  if (!window.confirm(`强制清除 ${server.name}？该动作只删除本地记录，不会连接目标服务器，也不会清理远端 hook 或节点。`)) return;
  busy.value = true;
  try {
    await api.forceClearServer(server.id);
    editingServerId.value = "";
    await load();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function rebootServer(server) {
  if (!window.confirm(`重启服务器 ${server.name}？目标服务器会在任务返回后短暂下线，期间 hook 和节点都可能不可用。继续吗？`)) return;
  busy.value = true;
  try {
    const result = await api.rebootServer(server.id);
    watchJob(result.job, { feedbackPage: "servers" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

function resetDeployForm() {
  editingNodeId.value = "";
  editingNodeName.value = "";
  Object.assign(deployNode, {
    name: "",
    group: "",
    domain: "",
    listenPort: 443,
    masqueradeUrl: "https://www.bing.com/",
    tlsMode: "acme-http",
    acmeEmail: "",
    dnsProvider: "cloudflare",
    dnsToken: "",
    dnsOverrideDomain: "",
    dnsUser: "",
    dnsServer: "api.name.com",
    selfSignedDomain: "bing.com",
    selfSignedIpMode: "ipv4",
    selfSignedHost: "",
    certPath: "",
    keyPath: "",
    ignoreClientBandwidth: false,
    obfsEnabled: false,
    obfsPassword: "",
    sniffEnabled: false,
    portHoppingEnabled: false,
    jumpPortStart: 20000,
    jumpPortEnd: 20010,
    jumpPortInterface: "eth0",
    jumpPortIpv6Enabled: false,
    jumpPortIpv6Interface: ""
  });
  usersText.value = "";
}

function resetManualNodeForm() {
  Object.assign(manualNodeForm, {
    serverId: readyServers.value[0]?.id || "",
    protocol: monitorProtocolOptions.value[0]?.id || "shadowsocks",
    name: "",
    group: "",
    endpoint: "",
    domain: "",
    listenPort: 443,
    service: "sing-box.service",
    serviceProtocol: monitorProtocolOptions.value[0]?.serviceProtocol || "tcp"
  });
}

function openManualNodeModal() {
  if (!manualNodeForm.serverId && readyServers.value.length) {
    manualNodeForm.serverId = readyServers.value[0].id;
  }
  if (!monitorProtocolMap.value[manualNodeForm.protocol] && monitorProtocolOptions.value.length) {
    manualNodeForm.protocol = monitorProtocolOptions.value[0].id;
  }
  manualNodeModalOpen.value = true;
}

function startEditNode(node) {
  if (!isDeployableNode(node)) {
    toast.value = "这个节点是监控登记节点，只能刷新状态或移除监控记录。";
    return;
  }
  editingNodeId.value = node.id;
  editingNodeName.value = node.name;
  deployServerId.value = node.serverId;
  deployProtocol.value = node.protocol;
  Object.assign(deployNode, {
    name: node.name || "",
    group: node.group || "",
    domain: node.domain || "",
    listenPort: node.listenPort || 443,
    masqueradeUrl: node.masqueradeUrl || "https://www.bing.com/",
    tlsMode: node.tlsMode || "acme-http",
    acmeEmail: node.acmeEmail || "",
    dnsProvider: node.dnsProvider || "cloudflare",
    dnsToken: node.dnsToken || "",
    dnsOverrideDomain: node.dnsOverrideDomain || "",
    dnsUser: node.dnsUser || "",
    dnsServer: node.dnsServer || "api.name.com",
    selfSignedDomain: node.selfSignedDomain || "bing.com",
    selfSignedIpMode: node.selfSignedIpMode || "ipv4",
    selfSignedHost: node.selfSignedHost || "",
    certPath: node.certPath || "",
    keyPath: node.keyPath || "",
    ignoreClientBandwidth: Boolean(node.ignoreClientBandwidth),
    obfsEnabled: Boolean(node.obfsEnabled),
    obfsPassword: node.obfsPassword || "",
    sniffEnabled: Boolean(node.sniffEnabled),
    portHoppingEnabled: Boolean(node.portHoppingEnabled),
    jumpPortStart: node.jumpPortStart || 20000,
    jumpPortEnd: node.jumpPortEnd || 20010,
    jumpPortInterface: node.jumpPortInterface || "eth0",
    jumpPortIpv6Enabled: Boolean(node.jumpPortIpv6Enabled),
    jumpPortIpv6Interface: node.jumpPortIpv6Interface || ""
  });
  usersText.value = "";
  window.location.hash = "deploy";
}

async function submitManualNode() {
  busy.value = true;
  try {
    await api.createMonitorNode({
      serverId: manualNodeForm.serverId,
      node: {
        protocol: manualNodeForm.protocol,
        name: manualNodeForm.name,
        group: manualNodeForm.group,
        endpoint: manualNodeForm.endpoint,
        domain: manualNodeForm.domain,
        listenPort: manualNodeForm.listenPort,
        service: manualNodeForm.service,
        serviceProtocol: manualNodeForm.serviceProtocol || currentManualProtocol.value?.serviceProtocol,
        configPath: ""
      }
    });
    manualNodeModalOpen.value = false;
    resetManualNodeForm();
    await load();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function submitDeployment() {
  if (editingNodeId.value) return updateNode();
  return deploy();
}

async function deploy() {
  busy.value = true;
  try {
    const result = await api.deploy({
      serverId: deployServerId.value,
      node: {
        ...deployNode,
        protocol: deployProtocol.value,
        listenPort: deployProtocol.value === "trojan" ? 443 : deployNode.listenPort,
        name: deployNode.name || `${deployProtocol.value === "hysteria2" ? "HY2" : "Trojan"} ${serverName(deployServerId.value)}`,
        tlsMode: deployProtocol.value === "trojan" ? "acme-http" : deployNode.tlsMode
      },
      users: parseUsers(usersText.value, deployProtocol.value)
    });
    watchJob(result.job, { feedbackPage: "deploy" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function updateNode() {
  busy.value = true;
  try {
    const result = await api.updateNode(editingNodeId.value, {
      node: {
        ...deployNode,
        id: editingNodeId.value,
        protocol: deployProtocol.value,
        listenPort: deployProtocol.value === "trojan" ? 443 : deployNode.listenPort,
        name: deployNode.name || editingNodeName.value,
        tlsMode: deployProtocol.value === "trojan" ? "acme-http" : deployNode.tlsMode
      },
      users: parseUsers(usersText.value, deployProtocol.value)
    });
    resetDeployForm();
    watchJob(result.job, { feedbackPage: "deploy" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function refreshNode(node) {
  busy.value = true;
  try {
    const result = await api.refreshStatus({ serverId: node.serverId, nodeId: node.id });
    watchJob(result.job, { feedbackPage: "nodes" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function serviceNode(node, action) {
  busy.value = true;
  try {
    const result = await api.service({ serverId: node.serverId, nodeId: node.id, action });
    watchJob(result.job, { feedbackPage: "nodes" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function deleteNode(node) {
  if (!window.confirm(`卸载并删除节点 ${node.name}？该动作会清理目标服务器上的 ${node.protocol} 服务和 SimpleUI 管理的配置，但会保留服务器 hook。`)) return;
  busy.value = true;
  try {
    const result = await api.deleteNode(node.id);
    watchJob(result.job, { feedbackPage: "nodes" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function forceClearNode(node) {
  const message = node.monitorOnly
    ? `移除 ${node.name} 的本地监控记录？该动作不会连接服务器，也不会改动远端服务。`
    : `强制清除节点 ${node.name}？该动作只删除本地记录，不会连接服务器，也不会清理远端服务。`;
  if (!window.confirm(message)) return;
  busy.value = true;
  try {
    await api.forceClearNode(node.id);
    if (editingNodeId.value === node.id) resetDeployForm();
    selectedNodes.value = selectedNodes.value.filter((id) => id !== node.id);
    await load();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}

async function runBan() {
  busy.value = true;
  try {
    const result = await api.blockSourceIp({
      targetIp: sourceIp.value,
      nodeIds: selectedNodes.value
    });
    watchJobs(result.jobs, `批量封禁客户端 IP ${sourceIp.value}`, { feedbackPage: "connections" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

function blacklistUnbanRequests(records = []) {
  const buckets = new Map();
  for (const record of records) {
    const key = blacklistTargetKey(record.target);
    if (!key || !record.nodeId) continue;
    const bucket = buckets.get(key) || { target: record.target, nodeIds: new Set() };
    bucket.nodeIds.add(record.nodeId);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).map((bucket) => ({
    target: bucket.target,
    nodeIds: Array.from(bucket.nodeIds)
  }));
}

function blacklistRecordConfirmText(record) {
  return `解封 ${record.target} 在节点 ${record.nodeLabel} 上的黑名单记录？`;
}

function blacklistRecordJobTitle(record) {
  return `解封 ${record.target} / ${record.nodeLabel}`;
}

async function runBlacklistUnbanRecords(records, title) {
  const requests = blacklistUnbanRequests(records);
  if (!requests.length) return;
  busy.value = true;
  const jobs = [];
  try {
    for (const request of requests) {
      const result = await api.unblockSourceIp({
        targetIp: request.target,
        nodeIds: request.nodeIds
      });
      jobs.push(...(result.jobs || []));
    }
    selectedBlacklistRecords.value = [];
    if (jobs.length) {
      watchJobs(jobs, title, { feedbackPage: "connections" });
    } else {
      busy.value = false;
      await load();
    }
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function runBlacklistRecordUnban(record) {
  if (!record) return;
  if (!window.confirm(blacklistRecordConfirmText(record))) return;
  await runBlacklistUnbanRecords([record], blacklistRecordJobTitle(record));
}

async function runSelectedUnban() {
  const records = selectedBlacklistRows.value;
  if (!records.length) return;
  if (!window.confirm(`解封选中的 ${records.length} 条节点黑名单记录？`)) return;
  await runBlacklistUnbanRecords(records, `解封选中的 ${records.length} 条黑名单记录`);
}

async function runOptimize() {
  busy.value = true;
  try {
    const result = await api.optimize({
      serverId: toolServerId.value,
      action: optimizeAction.value
    });
    watchJob(result.job, { feedbackScope: "tools" });
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function runIpQuality() {
  busy.value = true;
  try {
    const result = await api.ipQuality({
      serverId: toolServerId.value,
      ...ipQualityForm
    });
    if (result.jobs?.length) {
      watchJobs(result.jobs, `IPQuality ${serverName(toolServerId.value)} IPv4 + IPv6`, { feedbackScope: "tools" });
    } else {
      watchJob(result.job, { feedbackScope: "tools" });
    }
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function runTerminalCommand() {
  const serverId = terminalServerId.value;
  const session = ensureTerminalSession(serverId);
  const command = session?.command.trim();
  if (!command || !serverId || terminalSessionRunning(session)) return;
  const isCd = isSimpleCdCommand(command);
  const remoteCommand = isCd ? `cd ${shellQuote(cdTarget(command))} && pwd` : command;
  let hiddenOutput = "";
  closeTerminalSubscription(serverId);
  session.running = true;
  session.job = {
    id: "pending",
    title: `Terminal ${serverName(serverId)}`,
    status: "queued",
    createdAt: new Date().toISOString()
  };
  appendTerminalOutput(serverId, `${terminalPrompt(session)} ${command}\n`);
  session.command = "";
  try {
    const result = await api.runCommand({
      serverId,
      command: remoteCommand,
      cwd: session.cwd || "/root",
      timeoutSeconds: session.timeoutSeconds || 600
    });
    session.job = result.job;
    const unsubscribe = subscribeJob(result.job.id, {
      onLog: (line) => {
        if (isCd) hiddenOutput += line;
        else appendTerminalOutput(serverId, line);
      },
      onDone: (done) => {
        session.job = { ...session.job, ...done };
        session.running = false;
        terminalSubscriptions.delete(serverId);
        if (isCd && done.status === "success" && done.result?.exitCode === 0) {
          const nextCwd = hiddenOutput.trim().split(/\r?\n/).filter(Boolean).at(-1);
          if (nextCwd) session.cwd = nextCwd;
        } else if (isCd) {
          appendTerminalOutput(serverId, hiddenOutput);
        }
        appendTerminalOutput(serverId, done.status === "success" ? "" : `\n[${statusLabel(done.status)}]\n`);
        focusTerminalInput();
        load().catch(showError);
      },
      onError: () => {
        session.running = false;
        terminalSubscriptions.delete(serverId);
        appendTerminalOutput(serverId, "\n[任务订阅中断，请到任务日志确认最终状态]\n");
        focusTerminalInput();
      }
    });
    terminalSubscriptions.set(serverId, unsubscribe);
  } catch (error) {
    session.running = false;
    session.job = { ...session.job, status: "failed", error: error?.message };
    appendTerminalOutput(serverId, `\n[请求失败] ${error?.message || String(error)}\n`);
    focusTerminalInput();
    showError(error);
  }
}

function clearTerminal() {
  const session = ensureTerminalSession(terminalServerId.value);
  if (session) session.output = "";
  focusTerminalInput();
}

watch(
  () => [deployProtocol.value, deployNode.portHoppingEnabled],
  ([protocol]) => {
    if (protocol === "trojan") deployNode.listenPort = 443;
  }
);

watch(
  () => manualNodeForm.protocol,
  (protocol) => {
    manualNodeForm.serviceProtocol = monitorProtocolMap.value[protocol]?.serviceProtocol || "tcp";
  }
);

watch(
  () => terminalServerId.value,
  () => focusTerminalInput()
);

function setActivePage(page) {
  activePage.value = normalizePageId(page);
}

function startApp() {
  checkSession()
    .then(async () => {
      if (!auth.authenticated) return;
      await load();
      startRefresh();
    })
    .catch((error) => {
      loading.value = false;
      showError(error);
    });
}

function stopApp() {
  stopRefresh();
  closeTerminalSubscription();
}


  return {
    state,
    loading,
    busy,
    toast,
    auth,
    authBusy,
    loginForm,
    passwordForm,
    refreshTimer,
    pageDefinitions,
    pageMap,
    activePage,
    pageMeta,
    projectInfo,
    releaseTargets,
    selectedNodes,
    selectedBlacklistRecords,
    blacklistGroupMode,
    collapsedBlacklistGroups,
    serversGrouped,
    nodesGrouped,
    banNodeModalOpen,
    manualNodeModalOpen,
    banNodeSearch,
    banNodeGroupFilter,
    banNodesGrouped,
    jobLogs,
    activeJob,
    toolFeedback,
    toolFeedbackLogExpanded,
    pageTaskFeedback,
    ipQualityModal,
    taskPanelCollapsed,
    taskSearch,
    taskStatusFilter,
    taskTypeFilter,
    connectionStatsCollapsed,
    connectionStatsGrouped,
    connectionSearch,
    connectionNodeFilter,
    connectionProtocolFilter,
    connectionFamilyFilter,
    connectionSortKey,
    connectionSortDirection,
    editingServerId,
    editingNodeId,
    editingNodeName,
    serverForm,
    serverEditForm,
    serverCredential,
    deployServerId,
    deployProtocol,
    deployNode,
    usersText,
    manualNodeForm,
    sourceIp,
    toolServerId,
    terminalServerId,
    terminalSessions,
    terminalSubscriptions,
    terminalOutputRef,
    terminalCommandInputRef,
    optimizeAction,
    ipQualityForm,
    optimizeActions,
    rebootOptimizeActions,
    taskStatusOptions,
    serverPageTaskTypes,
    pageTaskFeedbackConfig,
    connectionSortOptions,
    blacklistGroupModes,
    emptyTerminalSession,
    currentProvider,
    monitorProtocolMap,
    monitorProtocolOptions,
    currentManualProtocol,
    isHy2,
    isPasswordAuthProtocol,
    hasFixedListenPort,
    readyServers,
    readyServerIds,
    activeTerminalSession,
    serverRows,
    nodeRows,
    nodeGroupOptions,
    filteredBanNodes,
    banNodeRows,
    selectedNodePreview,
    totalTraffic,
    totalTrafficBytes,
    onlineNodeCount,
    fleetOnlinePercent,
    avgServerMetrics,
    fleetHealth,
    overviewServers,
    maxServerTraffic,
    topTrafficNodes,
    maxNodeTraffic,
    topRemoteTraffic,
    latestSyncAt,
    latestIpQualityJob,
    latestIpQualityResult,
    latestOptimizeJob,
    latestOptimizeResult,
    visibleJobs,
    activePageTaskFeedback,
    activePageTask,
    activePageTaskCards,
    taskTypeOptions,
    filteredJobs,
    connectionNodeOptions,
    connectionProtocolOptions,
    filteredRemoteTraffic,
    filteredConnections,
    sortedRemoteTraffic,
    sortedConnections,
    remoteTrafficRows,
    connectionRows,
    activeBlacklistEntries,
    blacklistRecordRows,
    blacklistTargetRows,
    nodeBlacklistRows,
    nodeGroupBlacklistRows,
    blacklistRows,
    selectedBlacklistRows,
    blacklistActiveModeLabel,
    fmtBytes,
    fmtPercent,
    fmtRate,
    trafficClientIp,
    trafficTotal,
    latestTime,
    blacklistTargetKey,
    blacklistRecordKey,
    blacklistEntryActive,
    expandBlacklistEntry,
    blacklistRecordRow,
    blacklistRowLatest,
    connectionSortValue,
    compareSortValues,
    sortConnectionItems,
    averageMetric,
    clampPercent,
    percentStyle,
    fmtTime,
    statusLabel,
    jobSummary,
    jobKindLabel,
    jobTime,
    canOpenJobResult,
    openJobResult,
    toolFeedbackReports,
    canOpenToolFeedbackResult,
    openToolFeedbackResult,
    openToolReport,
    toolFeedbackSummary,
    toolFeedbackLogText,
    taskLogText,
    taskHasLogs,
    ensureTerminalSession,
    appendTerminalOutput,
    scrollTerminalToBottom,
    focusTerminalInput,
    closeTerminalSubscription,
    terminalSessionRunning,
    terminalPrompt,
    isSimpleCdCommand,
    cdTarget,
    shellQuote,
    serverName,
    nodeName,
    nodeProtocolLabel,
    nodeSourceLabel,
    isDeployableNode,
    canControlNodeService,
    nodeGroupById,
    groupKey,
    groupLabel,
    uniqueGroups,
    groupedRows,
    normalizePageId,
    syncPageFromHash,
    parseUsers,
    stopRefresh,
    startRefresh,
    clearRuntimeState,
    handleAuthError,
    checkSession,
    login,
    logout,
    changeWebPassword,
    load,
    syncNow,
    showError,
    startToolFeedback,
    appendToolFeedbackLog,
    updateToolFeedback,
    clearToolFeedback,
    startPageTaskFeedback,
    appendPageTaskFeedbackLog,
    updatePageTaskFeedback,
    clearPageTaskFeedback,
    watchJob,
    watchJobs,
    clearJobs,
    toggleNode,
    selectFilteredBanNodes,
    clearSelectedNodes,
    toggleBlacklistRecord,
    toggleBlacklistGroup,
    blacklistGroupSelectedCount,
    blacklistGroupAllSelected,
    blacklistGroupCollapsed,
    toggleBlacklistCollapse,
    selectAllBlacklistRecords,
    clearSelectedBlacklistRecords,
    prepareHookUpgrade,
    resetServerForm,
    startEditServer,
    cancelEditServer,
    saveServer,
    installServer,
    upgradeHook,
    trustHookCertificate,
    deleteServer,
    forceClearServer,
    rebootServer,
    resetDeployForm,
    resetManualNodeForm,
    openManualNodeModal,
    startEditNode,
    submitManualNode,
    submitDeployment,
    deploy,
    updateNode,
    refreshNode,
    serviceNode,
    deleteNode,
    forceClearNode,
    runBan,
    blacklistUnbanRequests,
    blacklistRecordConfirmText,
    blacklistRecordJobTitle,
    runBlacklistUnbanRecords,
    runBlacklistRecordUnban,
    runSelectedUnban,
    runOptimize,
    runIpQuality,
    runTerminalCommand,
    clearTerminal,
    setActivePage,
    startApp,
    stopApp
  };
});
