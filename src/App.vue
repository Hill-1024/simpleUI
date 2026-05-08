<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  Activity,
  Ban,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CloudLightning,
  Cpu,
  Eraser,
  ExternalLink,
  Gauge,
  HardDrive,
  Info,
  Loader2,
  Network,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCw,
  Save,
  Search,
  SearchCheck,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  Wifi,
  X
} from "lucide-vue-next";
import { api, subscribeJob } from "./api.js";

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
  { id: "connections", title: "连接统计与封禁", description: "按客户端 IP 查看连接到节点的流量，并在弹窗中选择要应用封禁的节点。" },
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
  connections: { title: "封禁任务反馈", types: new Set(["ban", "batch"]) }
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
const readyServers = computed(() => state.servers.filter((server) => server.hookStatus === "online" || server.hookInstalled));
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

onMounted(() => {
  syncPageFromHash();
  window.addEventListener("hashchange", syncPageFromHash);
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
});

onUnmounted(() => {
  window.removeEventListener("hashchange", syncPageFromHash);
  stopRefresh();
  closeTerminalSubscription();
});
</script>

<template>
  <div v-if="!auth.checked" class="auth-shell">
    <section class="auth-panel">
      <div class="auth-mark">S</div>
      <h1>SimpleUI</h1>
      <p>正在检查登录状态...</p>
    </section>
  </div>

  <div v-else-if="!auth.authenticated" class="auth-shell">
    <form class="auth-panel" @submit.prevent="login">
      <div class="auth-mark">S</div>
      <h1>SimpleUI</h1>
      <p>输入首次启动时在 CLI 输出的 UUID 初始密码。</p>
      <p v-if="toast" class="auth-error">{{ toast }}</p>
      <label>
        <span>WebUI 密码</span>
        <input v-model="loginForm.password" type="password" autocomplete="current-password" autofocus required />
      </label>
      <button class="primary-button" type="submit" :disabled="authBusy || !loginForm.password">
        <Loader2 v-if="authBusy" class="spin" :size="16" />
        <ShieldCheck v-else :size="16" />
        登录
      </button>
    </form>
  </div>

  <div v-else class="app">
    <aside class="sidebar">
      <div class="brand">
        <strong>SimpleUI</strong>
        <span>Persistent Hooks</span>
      </div>
      <nav>
        <a href="#overview" :class="{ active: activePage === 'overview' }"><Gauge :size="17" />概览</a>
        <a href="#servers" :class="{ active: activePage === 'servers' }"><Server :size="17" />服务器</a>
        <a href="#deploy" :class="{ active: activePage === 'deploy' }"><CloudLightning :size="17" />部署</a>
        <a href="#nodes" :class="{ active: activePage === 'nodes' }"><Wifi :size="17" />节点</a>
        <a href="#connections" :class="{ active: activePage === 'connections' }"><Ban :size="17" />连接封禁</a>
        <a href="#tools" :class="{ active: activePage === 'tools' }"><Gauge :size="17" />工具</a>
        <a href="#terminal" :class="{ active: activePage === 'terminal' }"><Terminal :size="17" />终端</a>
        <a href="#logs" :class="{ active: activePage === 'logs' }"><Terminal :size="17" />日志</a>
        <a href="#about" :class="{ active: activePage === 'about' }"><Info :size="17" />关于</a>
      </nav>
    </aside>

    <main>
      <header class="topbar">
        <div>
          <h1>{{ pageMeta.title }}</h1>
          <p>{{ pageMeta.description }}</p>
        </div>
        <div class="topbar-actions">
          <button type="button" @click="syncNow" :disabled="loading">
            <Loader2 v-if="loading" class="spin" :size="16" />
            <RefreshCcw v-else :size="16" />
            同步
          </button>
          <button type="button" @click="logout" :disabled="authBusy">
            <X :size="16" />
            退出
          </button>
        </div>
      </header>

      <div v-if="toast" class="toast" @click="toast = ''">
        <CircleAlert :size="16" />
        {{ toast }}
      </div>

      <div v-if="ipQualityModal" class="modal-backdrop" @click.self="ipQualityModal = null">
        <div class="report-modal">
          <div class="modal-head">
            <div>
              <h2>IPQuality 检测报告</h2>
              <span>{{ ipQualityModal.reports ? "IPv4 / IPv6 分别检测完成" : (ipQualityModal.reportPath || ipQualityModal.logPath || "远端报告") }}</span>
            </div>
            <button type="button" title="关闭" @click="ipQualityModal = null"><X :size="18" /></button>
          </div>
          <div v-if="ipQualityModal.reports" class="report-list">
            <article v-for="report in ipQualityModal.reports" :key="`${report.mode}-${report.reportPath || report.reportUrl}`" class="report-card">
              <strong>{{ report.title || (report.mode === "ipv6" ? "IPv6 报告" : "IPv4 报告") }}</strong>
              <a v-if="report.reportUrl" :href="report.reportUrl" target="_blank" rel="noreferrer">
                {{ report.reportUrl }}
                <ExternalLink :size="15" />
              </a>
              <pre v-else>{{ report.rawOutput || "没有生成在线报告。关闭隐私模式后，IPQuality 会返回 Report.Check.Place 链接。" }}</pre>
            </article>
          </div>
          <template v-else>
            <div v-if="ipQualityModal.reportUrl" class="report-link">
              <span>在线报告</span>
              <a :href="ipQualityModal.reportUrl" target="_blank" rel="noreferrer">
                {{ ipQualityModal.reportUrl }}
                <ExternalLink :size="15" />
              </a>
            </div>
            <iframe v-if="ipQualityModal.reportUrl" class="report-frame" :src="ipQualityModal.reportUrl" title="IPQuality Report"></iframe>
            <pre v-else class="ansi-report">{{ ipQualityModal.rawOutput || "没有生成在线报告。关闭隐私模式后，IPQuality 会返回 Report.Check.Place 链接。" }}</pre>
          </template>
        </div>
      </div>

      <div v-if="banNodeModalOpen" class="modal-backdrop" @click.self="banNodeModalOpen = false">
        <div class="node-select-modal">
          <div class="modal-head">
            <div>
              <h2>选择封禁应用节点</h2>
              <span>已选 {{ selectedNodes.length }} 个节点；封禁会下发到这些节点所在服务器的 hook。</span>
            </div>
            <button type="button" title="关闭" @click="banNodeModalOpen = false"><X :size="18" /></button>
          </div>
          <div class="node-select-controls">
            <label class="task-search-field">
              <span>搜索</span>
              <div class="input-with-icon">
                <Search :size="15" />
                <input v-model="banNodeSearch" placeholder="节点、服务器、入口、协议" />
              </div>
            </label>
            <label>
              <span>节点分组</span>
              <select v-model="banNodeGroupFilter">
                <option value="all">全部分组</option>
                <option v-for="option in nodeGroupOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label class="toggle-row compact-toggle">
              <input v-model="banNodesGrouped" type="checkbox" />
              <span>按分组展示</span>
            </label>
          </div>
          <div v-if="!state.nodes.length" class="empty-state modal-empty">还没有节点可以选择。</div>
          <div v-else-if="!filteredBanNodes.length" class="empty-state modal-empty">没有符合当前筛选条件的节点。</div>
          <div v-else class="table-wrap compact-table node-select-table">
            <table>
              <thead>
                <tr><th>选择</th><th>节点</th><th>分组</th><th>服务器</th><th>入口</th><th>状态</th></tr>
              </thead>
              <tbody>
                <template v-for="row in banNodeRows" :key="row.key">
                  <tr v-if="row.type === 'group'" class="group-row">
                    <td colspan="6"><strong>{{ row.label }}</strong><span>{{ row.count }} 个节点</span></td>
                  </tr>
                  <tr v-else>
                    <td><input type="checkbox" :checked="selectedNodes.includes(row.node.id)" @change="toggleNode(row.node.id, $event.target.checked)" /></td>
                    <td><strong>{{ row.node.name }}</strong><small>{{ nodeProtocolLabel(row.node.protocol) }}</small></td>
                    <td><span class="group-badge">{{ groupLabel(row.node.group) }}</span></td>
                    <td>{{ serverName(row.node.serverId) }}</td>
                    <td>{{ row.node.endpoint || "-" }}</td>
                    <td><span :class="`pill status-${row.node.status || 'unknown'}`">{{ statusLabel(row.node.status) }}</span></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary-button" @click="selectFilteredBanNodes">全选当前筛选</button>
            <button type="button" class="secondary-button danger-text" @click="clearSelectedNodes">清空选择</button>
            <button type="button" class="primary-button" @click="banNodeModalOpen = false">完成</button>
          </div>
        </div>
      </div>

      <div v-if="manualNodeModalOpen" class="modal-backdrop" @click.self="manualNodeModalOpen = false">
        <form class="node-select-modal manual-node-modal" @submit.prevent="submitManualNode">
          <div class="modal-head">
            <div>
              <h2>手动添加监控节点</h2>
              <span>只登记已有节点的监听信息，不执行安装、证书申请或配置写入。</span>
            </div>
            <button type="button" title="关闭" @click="manualNodeModalOpen = false"><X :size="18" /></button>
          </div>
          <div class="manual-node-form">
            <label>
              <span>目标服务器</span>
              <select v-model="manualNodeForm.serverId" required>
                <option value="" disabled>选择 hook 已就绪的服务器</option>
                <option v-for="server in readyServers" :key="server.id" :value="server.id">{{ server.name }}</option>
              </select>
            </label>
            <label>
              <span>协议</span>
              <select v-model="manualNodeForm.protocol" required>
                <option v-for="protocol in monitorProtocolOptions" :key="protocol.id" :value="protocol.id">{{ protocol.name }}</option>
              </select>
            </label>
            <label><span>节点名</span><input v-model="manualNodeForm.name" required placeholder="如 JP VLESS 443" /></label>
            <label><span>节点分组</span><input v-model="manualNodeForm.group" placeholder="可选" /></label>
            <label><span>入口地址</span><input v-model="manualNodeForm.endpoint" placeholder="留空使用服务器主机 + 端口" /></label>
            <label><span>域名 / 连接主机</span><input v-model="manualNodeForm.domain" placeholder="可选" /></label>
            <label><span>监听端口</span><input v-model.number="manualNodeForm.listenPort" type="number" min="1" max="65535" required /></label>
            <label>
              <span>传输</span>
              <select v-model="manualNodeForm.serviceProtocol" required>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="tcp,udp">TCP + UDP</option>
              </select>
            </label>
            <label class="span-2"><span>systemd 服务</span><input v-model="manualNodeForm.service" placeholder="如 sing-box.service；留空则只能刷新端口连接" /></label>
          </div>
          <p class="form-note manual-node-note">自动发现会优先读取 sing-box 配置；只有配置路径不标准、节点不是 sing-box 承载，或需要先手工纳入监控时才需要这里。</p>
          <div class="modal-actions">
            <button type="button" class="secondary-button" @click="manualNodeModalOpen = false">取消</button>
            <button type="submit" class="primary-button" :disabled="busy || !manualNodeForm.serverId || !manualNodeForm.name || !manualNodeForm.listenPort">
              <Loader2 v-if="busy" class="spin" :size="16" />
              <Plus v-else :size="16" />
              添加监控
            </button>
          </div>
        </form>
      </div>

      <section v-if="activePageTaskFeedback && activePageTaskCards.length" class="panel page-task-panel">
        <div class="page-task-title">
          <div>
            <Terminal :size="17" />
            <h3>{{ activePageTaskFeedback.title }}</h3>
          </div>
          <div class="page-task-actions">
            <span class="task-count">{{ statusLabel(activePageTask.status) }}</span>
            <button type="button" title="清除反馈" @click="clearPageTaskFeedback()"><X :size="15" /></button>
          </div>
        </div>
        <div class="page-task-list">
          <article v-for="job in activePageTaskCards" :key="job.id" class="page-task-item">
            <div class="page-task-main">
              <div class="task-main">
                <Loader2 v-if="['queued', 'running'].includes(job.status)" class="spin" :size="16" />
                <CircleAlert v-else-if="job.status === 'failed'" :size="16" />
                <ShieldCheck v-else :size="16" />
                <div>
                  <strong>{{ job.title }}</strong>
                  <small>{{ jobKindLabel(job.type) }} · {{ jobTime(job) }}</small>
                </div>
              </div>
              <span :class="`pill status-${job.status || 'unknown'}`">{{ statusLabel(job.status) }}</span>
            </div>
            <p>{{ jobSummary(job) }}</p>
            <details v-if="taskHasLogs(job)" class="page-task-log" :open="['running', 'failed'].includes(job.status)">
              <summary>Hook 输出</summary>
              <pre>{{ taskLogText(job) }}</pre>
            </details>
          </article>
        </div>
      </section>

      <section v-if="activePage === 'overview'" class="overview-page">
        <div class="overview-hero">
          <div class="overview-hero-copy">
            <div :class="`fleet-state state-${fleetHealth.tone}`">
              <Activity :size="16" />
              {{ fleetHealth.label }}
            </div>
            <h2>SimpleUI Fleet</h2>
            <p>{{ fleetHealth.summary }}</p>
            <div class="hero-actions">
              <a class="primary-link" href="#servers">服务器管理</a>
              <a href="#nodes">查看节点</a>
            </div>
          </div>
          <div class="fleet-visual">
            <div class="fleet-ring" :style="{ '--online-angle': `${fleetOnlinePercent * 3.6}deg` }">
              <strong>{{ fleetOnlinePercent }}%</strong>
              <span>Hook 在线率</span>
            </div>
            <div class="fleet-visual-meta">
              <span>{{ readyServers.length }} / {{ state.servers.length }} 服务器</span>
              <span>{{ onlineNodeCount }} / {{ state.nodes.length }} 节点在线</span>
              <span>同步 {{ fmtTime(latestSyncAt) }}</span>
            </div>
          </div>
        </div>

        <div class="overview-metrics">
          <article>
            <Server :size="18" />
            <span>服务器</span>
            <strong>{{ state.servers.length }}</strong>
            <small>{{ readyServers.length }} 台 Hook 就绪</small>
          </article>
          <article>
            <Wifi :size="18" />
            <span>节点</span>
            <strong>{{ state.nodes.length }}</strong>
            <small>{{ onlineNodeCount }} 个在线</small>
          </article>
          <article>
            <Network :size="18" />
            <span>连接来源</span>
            <strong>{{ state.connections.length }}</strong>
            <small>{{ state.remoteTraffic.length }} 个客户端 IP</small>
          </article>
          <article>
            <Gauge :size="18" />
            <span>累计流量</span>
            <strong>{{ fmtBytes(totalTrafficBytes) }}</strong>
            <small>RX {{ fmtBytes(totalTraffic.rx) }} / TX {{ fmtBytes(totalTraffic.tx) }}</small>
          </article>
        </div>

        <div class="overview-grid">
          <section class="overview-panel server-health-panel">
            <div class="overview-panel-head">
              <div><Cpu :size="17" /><h3>服务器资源</h3></div>
              <small>平均 CPU {{ fmtPercent(avgServerMetrics.cpu) }} · 内存 {{ fmtPercent(avgServerMetrics.memory) }} · 磁盘 {{ fmtPercent(avgServerMetrics.disk) }}</small>
            </div>
            <div v-if="!overviewServers.length" class="empty-state">还没有服务器运行数据。</div>
            <div v-else class="server-health-list">
              <article v-for="item in overviewServers" :key="item.server.id" class="server-health-row">
                <div>
                  <strong>{{ item.server.name }}</strong>
                  <small>{{ item.server.location || groupLabel(item.server.group) }} · {{ item.nodes.length }} 节点 · {{ item.activeConnections }} 连接</small>
                </div>
                <div class="resource-bars">
                  <div><span>CPU</span><i><b :style="percentStyle(item.server.metrics?.cpu?.usagePercent)" /></i><em>{{ fmtPercent(item.server.metrics?.cpu?.usagePercent) }}</em></div>
                  <div><span>Mem</span><i><b :style="percentStyle(item.server.metrics?.memory?.usedPercent)" /></i><em>{{ fmtPercent(item.server.metrics?.memory?.usedPercent) }}</em></div>
                  <div><span>Disk</span><i><b :style="percentStyle(item.server.metrics?.disk?.usedPercent)" /></i><em>{{ fmtPercent(item.server.metrics?.disk?.usedPercent) }}</em></div>
                </div>
                <div class="traffic-mini">
                  <small>↓ {{ fmtRate(item.server.metrics?.network?.rxRate || 0) }}</small>
                  <small>↑ {{ fmtRate(item.server.metrics?.network?.txRate || 0) }}</small>
                  <div><span :style="percentStyle(item.traffic, maxServerTraffic)" /></div>
                </div>
              </article>
            </div>
          </section>

          <section class="overview-panel node-traffic-panel">
            <div class="overview-panel-head">
              <div><Wifi :size="17" /><h3>节点流量</h3></div>
              <small>Top {{ topTrafficNodes.length }}</small>
            </div>
            <div v-if="!topTrafficNodes.length" class="empty-state">还没有节点流量数据。</div>
            <div v-else class="rank-list">
              <article v-for="item in topTrafficNodes" :key="item.node.id" class="rank-row">
                <div>
                  <strong>{{ item.node.name }}</strong>
                  <small>{{ nodeProtocolLabel(item.node.protocol) }} · {{ serverName(item.node.serverId) }}</small>
                </div>
                <span>{{ fmtBytes(item.traffic) }}</span>
                <i><b :style="percentStyle(item.traffic, maxNodeTraffic)" /></i>
              </article>
            </div>
          </section>

          <section class="overview-panel remote-panel">
            <div class="overview-panel-head">
              <div><Network :size="17" /><h3>客户端 IP</h3></div>
              <small>{{ state.remoteTraffic.length }} 个来源</small>
            </div>
            <div v-if="!topRemoteTraffic.length" class="empty-state">还没有客户端流量统计。</div>
            <div v-else class="remote-list">
              <article v-for="item in topRemoteTraffic" :key="item.id">
                <strong>{{ trafficClientIp(item) }}</strong>
                <small>IPv{{ item.ipFamily || "-" }} · {{ nodeName(item.nodeId) }}</small>
                <span>{{ fmtBytes(item.total || ((item.rx || 0) + (item.tx || 0))) }}</span>
              </article>
            </div>
          </section>
        </div>
      </section>

      <section v-if="activePage === 'overview' && visibleJobs.length" class="panel task-feedback">
        <div class="section-title">
          <div>
            <Terminal :size="18" />
            <h2>任务执行情况</h2>
            <span class="task-count">{{ filteredJobs.length }} / {{ visibleJobs.length }}</span>
          </div>
          <div class="section-actions">
            <button class="collapse-button" type="button" :aria-expanded="!taskPanelCollapsed" @click="taskPanelCollapsed = !taskPanelCollapsed">
              <ChevronRight v-if="taskPanelCollapsed" :size="16" />
              <ChevronDown v-else :size="16" />
              {{ taskPanelCollapsed ? "展开" : "折叠" }}
            </button>
            <button class="collapse-button danger-text" type="button" @click="clearJobs">
              <Eraser :size="15" />
              清空
            </button>
          </div>
        </div>
        <div v-if="taskPanelCollapsed" class="task-collapsed">
          最近任务已收起，当前过滤结果 {{ filteredJobs.length }} 条。
        </div>
        <template v-else>
          <div class="task-controls">
            <label class="task-search-field">
              <span>搜索</span>
              <div class="input-with-icon">
                <Search :size="15" />
                <input v-model="taskSearch" placeholder="任务名、结果、报告链接" />
              </div>
            </label>
            <label>
              <span>状态</span>
              <select v-model="taskStatusFilter">
                <option v-for="option in taskStatusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>类型</span>
              <select v-model="taskTypeFilter">
                <option value="all">全部类型</option>
                <option v-for="option in taskTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>
          <div v-if="!filteredJobs.length" class="empty-state task-empty">没有符合当前筛选条件的任务。</div>
          <div v-else class="task-list">
            <article v-for="job in filteredJobs" :key="job.id" class="task-item">
              <div class="task-main">
                <span :class="`pill status-${job.status || 'unknown'}`">{{ statusLabel(job.status) }}</span>
                <div>
                  <strong>{{ job.title || jobKindLabel(job.type) }}</strong>
                  <small>{{ jobKindLabel(job.type) }} · {{ jobTime(job) }}</small>
                </div>
              </div>
              <p>{{ jobSummary(job) }}</p>
              <button v-if="canOpenJobResult(job)" type="button" @click="openJobResult(job)">
                <ExternalLink :size="14" />
                打开报告
              </button>
            </article>
          </div>
        </template>
      </section>

      <section v-if="activePage === 'about'" class="about-page">
        <section class="about-hero panel">
          <div class="about-mark">S</div>
          <div>
            <h2>{{ projectInfo.name }}</h2>
            <p>多服务器 Hysteria2 / Trojan 节点控制台，面向持久化 Hook、快速部署、连接观测与跨节点封禁。</p>
          </div>
        </section>
        <div class="about-grid">
          <section class="panel about-card">
            <div class="section-title">
              <div><Info :size="18" /><h2>项目信息</h2></div>
            </div>
            <dl class="info-list">
              <div><dt>作者</dt><dd>{{ projectInfo.author }}</dd></div>
              <div><dt>当前版本</dt><dd>{{ projectInfo.version }}</dd></div>
              <div><dt>发布日期</dt><dd>{{ projectInfo.releaseDate }}</dd></div>
              <div>
                <dt>项目主页</dt>
                <dd>
                  <a :href="projectInfo.homepage" target="_blank" rel="noreferrer">
                    {{ projectInfo.homepage }}
                    <ExternalLink :size="14" />
                  </a>
                </dd>
              </div>
            </dl>
          </section>
          <section class="panel about-card">
            <div class="section-title">
              <div><PackageCheck :size="18" /><h2>Release 目标</h2></div>
            </div>
            <div class="release-targets">
              <article v-for="target in releaseTargets" :key="`${target.platform}-${target.arch}`">
                <strong>{{ target.platform }}</strong>
                <span>{{ target.arch }}</span>
                <small>{{ target.packages }}</small>
              </article>
            </div>
            <p class="form-note">Release 包命名：SimpleUI_版本_系统平台_硬件架构.扩展名。</p>
          </section>
          <section class="panel about-card account-card">
            <div class="section-title">
              <div><ShieldCheck :size="18" /><h2>访问安全</h2></div>
            </div>
            <form class="account-form" @submit.prevent="changeWebPassword">
              <label>
                <span>当前密码</span>
                <input v-model="passwordForm.currentPassword" type="password" autocomplete="current-password" required />
              </label>
              <label>
                <span>新密码</span>
                <input v-model="passwordForm.newPassword" type="password" minlength="8" autocomplete="new-password" required />
              </label>
              <label>
                <span>确认新密码</span>
                <input v-model="passwordForm.confirmPassword" type="password" minlength="8" autocomplete="new-password" required />
              </label>
              <button class="primary-button" type="submit" :disabled="authBusy || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword">
                <Loader2 v-if="authBusy" class="spin" :size="16" />
                <Save v-else :size="16" />
                修改登录密码
              </button>
            </form>
          </section>
        </div>
      </section>

      <section v-if="activePage === 'servers'" id="servers" class="panel">
        <div class="section-title">
          <div><Server :size="18" /><h2>服务器 hooks</h2></div>
        </div>
        <form class="server-install" @submit.prevent="installServer">
          <p v-if="serverForm.id" class="form-note warning-note">正在通过 SSH 重装 {{ serverForm.name }} 的持久化 hook；只有首次接入、hook 离线或旧 hook 不支持在线升级时才需要这条路径。</p>
          <div class="form-grid server-grid">
            <label><span>服务器名</span><input v-model="serverForm.name" required /></label>
            <label><span>服务器分组</span><input v-model="serverForm.group" placeholder="可选，如 Osaka / HK" /></label>
            <label><span>SSH 主机</span><input v-model="serverForm.host" placeholder="IPv4、域名或 [IPv6]" required /></label>
            <label><span>SSH 端口</span><input v-model.number="serverForm.port" type="number" /></label>
            <label><span>SSH 用户</span><input v-model="serverCredential.username" required /></label>
            <label><span>SSH 密码</span><input v-model="serverCredential.password" type="password" /></label>
            <label><span>Hook 端口</span><input v-model.number="serverForm.hookPort" type="number" /></label>
            <label><span>地区</span><input v-model="serverForm.location" placeholder="可选" /></label>
          </div>
          <p class="form-note">SSH 凭据只用于 bootstrap 或离线恢复；hook 在线后可直接在服务器列表中执行在线升级。</p>
          <button class="primary-button" type="submit" :disabled="busy">
            <Loader2 v-if="busy" class="spin" :size="16" />
            <ShieldCheck v-else :size="16" />
            {{ serverForm.id ? "通过 SSH 重装 hook" : "添加服务器并安装 hook" }}
          </button>
          <button v-if="serverForm.id" class="secondary-button" type="button" :disabled="busy" @click="resetServerForm">
            <X :size="15" />
            取消升级
          </button>
        </form>
        <div v-if="!state.servers.length" class="empty-state">还没有服务器。先添加服务器并等待 hook 安装完成。</div>
        <template v-else>
          <div class="list-toolbar">
            <label class="toggle-row compact-toggle">
              <input v-model="serversGrouped" type="checkbox" />
              <span>按分组展示</span>
            </label>
          </div>
        <div class="table-wrap server-table">
          <table>
            <thead>
              <tr><th>服务器</th><th>分组</th><th>主机</th><th>资源</th><th>网络</th><th>状态</th><th>地区</th><th>同步</th><th>操作</th></tr>
            </thead>
            <tbody>
              <template v-for="row in serverRows" :key="row.key">
                <tr v-if="row.type === 'group'" class="group-row">
                  <td colspan="9"><strong>{{ row.label }}</strong><span>{{ row.count }} 台服务器</span></td>
                </tr>
                <tr v-else>
                  <td v-if="editingServerId === row.server.id">
                    <input v-model="serverEditForm.name" class="inline-input" required />
                    <small>{{ row.server.sshUserHint || "root" }}@{{ row.server.host }}</small>
                  </td>
                  <td v-else><strong>{{ row.server.name }}</strong><small>{{ row.server.sshUserHint || "root" }}@{{ row.server.host }}</small></td>
                  <td v-if="editingServerId === row.server.id"><input v-model="serverEditForm.group" class="inline-input short-input" placeholder="可选" /></td>
                  <td v-else><span class="group-badge">{{ groupLabel(row.server.group) }}</span></td>
                  <td v-if="editingServerId === row.server.id" class="inline-fields">
                    <input v-model="serverEditForm.host" class="inline-input" required />
                    <input v-model.number="serverEditForm.port" class="inline-input short-input" type="number" />
                  </td>
                  <td v-else>{{ row.server.host }}:{{ row.server.port || 22 }}</td>
                  <td class="metric-cell">
                    <strong>CPU {{ fmtPercent(row.server.metrics?.cpu?.usagePercent) }}</strong>
                    <small>Mem {{ fmtPercent(row.server.metrics?.memory?.usedPercent) }} · Disk {{ fmtPercent(row.server.metrics?.disk?.usedPercent) }}</small>
                    <small>Load {{ row.server.metrics?.cpu?.load1 ?? "-" }} / {{ row.server.metrics?.cpu?.cores || "-" }} 核</small>
                  </td>
                  <td class="metric-cell">
                    <strong>↓ {{ fmtRate(row.server.metrics?.network?.rxRate || 0) }}</strong>
                    <small>↑ {{ fmtRate(row.server.metrics?.network?.txRate || 0) }}</small>
                    <small>{{ fmtBytes(row.server.metrics?.network?.rx || 0) }} / {{ fmtBytes(row.server.metrics?.network?.tx || 0) }}</small>
                  </td>
                  <td><span :class="`pill status-${row.server.hookStatus || row.server.status || 'unknown'}`">{{ statusLabel(row.server.hookStatus || row.server.status) }}</span></td>
                  <td v-if="editingServerId === row.server.id"><input v-model="serverEditForm.location" class="inline-input short-input" /></td>
                  <td v-else>{{ row.server.location || "-" }}</td>
                  <td v-if="editingServerId === row.server.id">
                    <input v-model.number="serverEditForm.hookPort" class="inline-input short-input" type="number" />
                    <small>{{ row.server.hookUrl || "未安装" }}</small>
                  </td>
                  <td v-else class="metric-cell">
                    <small>{{ fmtTime(row.server.metrics?.updatedAt) }}</small>
                    <small v-if="row.server.metrics?.lastSyncError" class="error-text">{{ row.server.metrics.lastSyncError }}</small>
                    <small v-else>{{ row.server.hookUrl || "未安装" }}</small>
                  </td>
                  <td>
                    <div class="row-actions">
                      <template v-if="editingServerId === row.server.id">
                        <button type="button" title="保存服务器信息" :disabled="busy" @click="saveServer(row.server)"><Save :size="15" /></button>
                        <button type="button" title="取消编辑" :disabled="busy" @click="cancelEditServer"><X :size="15" /></button>
                      </template>
                      <template v-else>
                        <button type="button" title="在线升级 hook" :disabled="busy || row.server.hookStatus !== 'online'" @click="upgradeHook(row.server)"><ShieldCheck :size="15" /></button>
                        <button type="button" title="通过 SSH 重装 hook" :disabled="busy" @click="prepareHookUpgrade(row.server)"><RefreshCcw :size="15" /></button>
                        <button type="button" title="编辑服务器信息" :disabled="busy" @click="startEditServer(row.server)"><Pencil :size="15" /></button>
                        <button class="icon-warning" type="button" title="重启服务器" :disabled="busy || row.server.hookStatus !== 'online'" @click="rebootServer(row.server)"><RotateCw :size="15" /></button>
                        <button class="icon-danger" type="button" title="卸载 hook 并删除服务器" :disabled="busy || row.server.hookStatus === 'deleting'" @click="deleteServer(row.server)">
                          <Trash2 :size="15" />
                        </button>
                        <button class="icon-danger" type="button" title="强制清除本地服务器记录" :disabled="busy" @click="forceClearServer(row.server)">
                          <Eraser :size="15" />
                        </button>
                      </template>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        </template>
      </section>

      <section v-if="activePage === 'deploy'" id="deploy" class="panel">
        <div class="section-title">
          <div><CloudLightning :size="18" /><h2>{{ editingNodeId ? "修改节点参数" : "快速部署节点" }}</h2></div>
          <button v-if="editingNodeId" class="secondary-button" type="button" @click="resetDeployForm">
            <X :size="15" />
            取消编辑
          </button>
        </div>
        <form class="deploy-panel" @submit.prevent="submitDeployment">
          <p v-if="editingNodeId" class="form-note warning-note">正在修改 {{ editingNodeName }}。保存后会通过目标服务器 hook 重新部署该节点；节点密码、DNS Token 和混淆密码不会保存在面板中，需要重新输入。</p>
          <div class="form-grid">
            <label>
              <span>目标服务器</span>
              <select v-model="deployServerId" :disabled="!!editingNodeId" required>
                <option value="" disabled>选择 hook 已就绪的服务器</option>
                <option v-for="server in readyServers" :key="server.id" :value="server.id">{{ server.name }}</option>
              </select>
            </label>
            <label>
              <span>协议</span>
              <select v-model="deployProtocol" :disabled="!!editingNodeId">
                <option v-for="provider in state.providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
              </select>
            </label>
            <label><span>节点名</span><input v-model="deployNode.name" placeholder="自动生成" /></label>
            <label><span>节点分组</span><input v-model="deployNode.group" placeholder="可选，如 Game / Streaming" /></label>
            <label>
              <span>域名 / 连接地址</span>
              <input v-model="deployNode.domain" :required="!(isHy2 && deployNode.tlsMode === 'self-signed')" :placeholder="isHy2 && deployNode.tlsMode === 'self-signed' ? '留空按 IP 模式自动获取' : ''" />
            </label>
            <label>
              <span>监听端口</span>
              <input v-model.number="deployNode.listenPort" type="number" :disabled="hasFixedListenPort" />
            </label>
            <label>
              <span>证书模式</span>
              <select v-model="deployNode.tlsMode" :disabled="deployProtocol === 'trojan'">
                <option v-for="mode in currentProvider?.certificateModes || []" :key="mode.id" :value="mode.id">{{ mode.label }}</option>
              </select>
            </label>
            <label v-if="deployProtocol === 'trojan' || (isHy2 && ['acme-http', 'acme-dns'].includes(deployNode.tlsMode))">
              <span>ACME 邮箱</span>
              <input v-model="deployNode.acmeEmail" placeholder="admin@example.com" />
            </label>
            <label v-if="isHy2 && deployNode.tlsMode === 'acme-dns'">
              <span>DNS 提供商</span>
              <select v-model="deployNode.dnsProvider">
                <option value="cloudflare">Cloudflare</option>
                <option value="duckdns">Duck DNS</option>
                <option value="gandi">Gandi.net</option>
                <option value="godaddy">Godaddy</option>
                <option value="namedotcom">Name.com</option>
                <option value="vultr">Vultr</option>
              </select>
            </label>
            <label v-if="isHy2 && deployNode.tlsMode === 'acme-dns'">
              <span>DNS Token / API Key</span>
              <input v-model="deployNode.dnsToken" type="password" required />
            </label>
            <label v-if="isHy2 && deployNode.tlsMode === 'acme-dns' && deployNode.dnsProvider === 'duckdns'">
              <span>Duck DNS override_domain</span>
              <input v-model="deployNode.dnsOverrideDomain" />
            </label>
            <template v-if="isHy2 && deployNode.tlsMode === 'acme-dns' && deployNode.dnsProvider === 'namedotcom'">
              <label><span>Name.com 用户</span><input v-model="deployNode.dnsUser" /></label>
              <label><span>Name.com 服务器</span><input v-model="deployNode.dnsServer" /></label>
            </template>
            <template v-if="isHy2 && deployNode.tlsMode === 'self-signed'">
              <label><span>自签证书域名/SNI</span><input v-model="deployNode.selfSignedDomain" placeholder="bing.com" required /></label>
              <label>
                <span>自签连接 IP 模式</span>
                <select v-model="deployNode.selfSignedIpMode">
                  <option value="ipv4">IPv4</option>
                  <option value="ipv6">IPv6</option>
                </select>
              </label>
              <label><span>连接地址覆盖</span><input v-model="deployNode.selfSignedHost" placeholder="留空使用上方地址" /></label>
            </template>
            <template v-if="isHy2 && deployNode.tlsMode === 'manual-cert'">
              <label class="span-2"><span>证书路径</span><input v-model="deployNode.certPath" placeholder="/etc/ssl/fullchain.pem" required /></label>
              <label><span>私钥路径</span><input v-model="deployNode.keyPath" placeholder="/etc/ssl/private.key" required /></label>
            </template>
            <template v-if="isHy2">
              <label><span>伪装站点</span><input v-model="deployNode.masqueradeUrl" /></label>
              <div class="span-3 hy2-options">
                <div class="option-group">
                  <div class="option-heading">传输</div>
                  <div class="toggle-stack">
                    <label class="toggle-row">
                      <input v-model="deployNode.ignoreClientBandwidth" type="checkbox" />
                      <span>Brutal ignoreClientBandwidth</span>
                    </label>
                    <label class="toggle-row">
                      <input v-model="deployNode.obfsEnabled" type="checkbox" />
                      <span>Salamander 混淆</span>
                    </label>
                    <label class="toggle-row">
                      <input v-model="deployNode.sniffEnabled" type="checkbox" />
                      <span>协议嗅探 Sniff</span>
                    </label>
                  </div>
                  <label v-if="deployNode.obfsEnabled" class="compact-field">
                    <span>混淆密码</span>
                    <input v-model="deployNode.obfsPassword" type="password" required />
                  </label>
                </div>

                <div class="option-group port-hop-group">
                  <div class="option-heading">端口跳跃</div>
                  <label class="toggle-row toggle-row-primary">
                    <input v-model="deployNode.portHoppingEnabled" type="checkbox" />
                    <span>启用端口跳跃</span>
                  </label>
                  <div v-if="deployNode.portHoppingEnabled" class="port-hop-fields">
                    <label><span>v4 网络接口</span><input v-model="deployNode.jumpPortInterface" placeholder="eth0" required /></label>
                    <label><span>起始端口</span><input v-model.number="deployNode.jumpPortStart" type="number" required /></label>
                    <label><span>结束端口</span><input v-model.number="deployNode.jumpPortEnd" type="number" required /></label>
                    <label class="toggle-row ipv6-toggle">
                      <input v-model="deployNode.jumpPortIpv6Enabled" type="checkbox" />
                      <span>启用 IPv6 跳跃</span>
                    </label>
                    <label v-if="deployNode.jumpPortIpv6Enabled"><span>v6 网络接口</span><input v-model="deployNode.jumpPortIpv6Interface" placeholder="eth0" required /></label>
                  </div>
                </div>
              </div>
            </template>
            <label class="span-2">
              <span>{{ isPasswordAuthProtocol ? `${deployProtocol === "trojan" ? "Trojan" : "HY2"} 节点密码` : "节点账号 username:password" }}</span>
              <textarea v-model="usersText" rows="4" :placeholder="isPasswordAuthProtocol ? 'strong-password（或 name:strong-password，部署使用密码部分）' : 'alice:strong-password'" required />
            </label>
          </div>
          <p v-if="isPasswordAuthProtocol" class="form-note">{{ deployProtocol === "trojan" ? "Trojan" : "HY2" }} 按上游脚本写入 password auth，仅第一行密码用于本次节点鉴权。</p>
          <p class="form-note">部署动作由目标服务器上的持久化 hook 执行，不再需要重新输入 SSH 凭据。</p>
          <button class="primary-button" type="submit" :disabled="busy || !deployServerId || !readyServers.length">
            <Loader2 v-if="busy" class="spin" :size="16" />
            <CloudLightning v-else :size="16" />
            {{ editingNodeId ? "保存并重新部署节点" : "部署节点" }}
          </button>
        </form>
      </section>

      <section v-if="activePage === 'tools'" id="tools" class="panel">
        <div class="section-title">
          <div><Gauge :size="18" /><h2>服务器工具</h2></div>
        </div>
        <div class="tool-target">
          <label>
            <span>目标服务器</span>
            <select v-model="toolServerId" required>
              <option value="" disabled>选择 hook 已就绪的服务器</option>
              <option v-for="server in readyServers" :key="server.id" :value="server.id">{{ server.name }}</option>
            </select>
          </label>
        </div>
        <div v-if="toolFeedback" class="tool-feedback">
          <div class="tool-feedback-head">
            <div class="tool-feedback-title">
              <span>
                <Loader2 v-if="['queued', 'running'].includes(toolFeedback.status)" class="spin" :size="15" />
                <CircleAlert v-else-if="toolFeedback.status === 'failed'" :size="15" />
                <PackageCheck v-else :size="15" />
                工具反馈
              </span>
              <strong>{{ toolFeedback.title }}</strong>
              <small>{{ jobTime(toolFeedback) }}</small>
            </div>
            <div class="tool-feedback-actions">
              <span :class="`pill status-${toolFeedback.status || 'unknown'}`">{{ statusLabel(toolFeedback.status) }}</span>
              <button v-if="canOpenToolFeedbackResult(toolFeedback)" type="button" @click="openToolFeedbackResult(toolFeedback)">
                <ExternalLink :size="15" />查看报告
              </button>
              <button type="button" @click="toolFeedbackLogExpanded = !toolFeedbackLogExpanded">
                <Terminal :size="15" />{{ toolFeedbackLogExpanded ? "收起输出" : "展开输出" }}
              </button>
              <button type="button" title="清除反馈" @click="clearToolFeedback"><X :size="15" /></button>
            </div>
          </div>
          <p>{{ toolFeedbackSummary(toolFeedback) }}</p>
          <div v-if="toolFeedback.type === 'optimize' && toolFeedback.result && typeof toolFeedback.result === 'object'" class="tool-result-grid">
            <span><small>内核</small><strong>{{ toolFeedback.result.kernel || "-" }}</strong></span>
            <span><small>拥塞控制</small><strong>{{ toolFeedback.result.congestionControl || "-" }}</strong></span>
            <span><small>队列</small><strong>{{ toolFeedback.result.queueDiscipline || "-" }}</strong></span>
            <span><small>ECN</small><strong>{{ toolFeedback.result.ecn ?? "-" }}</strong></span>
          </div>
          <div v-if="toolFeedbackReports(toolFeedback).length" class="tool-report-strip">
            <button v-for="report in toolFeedbackReports(toolFeedback)" :key="report.title || report.mode || report.reportUrl || report.reportPath" type="button" @click="openToolReport(report)">
              <SearchCheck :size="15" />{{ report.title || report.mode || "IPQuality 报告" }}
            </button>
          </div>
          <pre v-if="toolFeedbackLogExpanded" class="tool-feedback-log">{{ toolFeedbackLogText(toolFeedback) }}</pre>
        </div>
        <div class="tools-layout">
          <form class="tool-block" @submit.prevent="runOptimize">
            <div class="tool-heading"><Gauge :size="17" /><h3>HY2 同源性能优化</h3></div>
            <label>
              <span>优化动作</span>
              <select v-model="optimizeAction">
                <option v-for="action in optimizeActions" :key="action.value" :value="action.value">{{ action.label }}</option>
              </select>
            </label>
            <p v-if="rebootOptimizeActions.has(optimizeAction)" class="form-note warning-note">该动作会改动系统级内核或网络参数，通常需要重启服务器后完全生效。</p>
            <p v-else class="form-note">执行入口与 HY2 Python 上游脚本一致，远端 hook 会拉取并运行 Linux-NetSpeed tcpx.sh。</p>
            <button class="primary-button" type="submit" :disabled="busy || !toolServerId || !readyServers.length">
              <Loader2 v-if="busy" class="spin" :size="16" />
              <Gauge v-else :size="16" />
              执行优化动作
            </button>
          </form>

          <form class="tool-block" @submit.prevent="runIpQuality">
            <div class="tool-heading"><SearchCheck :size="17" /><h3>IPQuality 体检</h3></div>
            <div class="tool-grid">
              <label>
                <span>检测模式</span>
                <select v-model="ipQualityForm.mode">
                  <option value="dual">IPv4 + IPv6</option>
                  <option value="ipv4">仅 IPv4</option>
                  <option value="ipv6">仅 IPv6</option>
                </select>
              </label>
              <label>
                <span>语言</span>
                <select v-model="ipQualityForm.language">
                  <option value="cn">中文</option>
                  <option value="en">English</option>
                  <option value="jp">日本語</option>
                  <option value="es">Español</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                  <option value="ru">Русский</option>
                  <option value="pt">Português</option>
                </select>
              </label>
              <label><span>网卡 / 出口 IP</span><input v-model="ipQualityForm.interface" placeholder="可选，如 eth0 或 203.0.113.10" /></label>
              <label><span>HTTP/SOCKS 代理</span><input v-model="ipQualityForm.proxy" type="password" placeholder="可选" /></label>
            </div>
            <div class="tool-toggles">
              <label class="toggle-row">
                <input v-model="ipQualityForm.privacy" type="checkbox" />
                <span>隐私模式（不生成报告链接）</span>
              </label>
              <label class="toggle-row">
                <input v-model="ipQualityForm.fullIp" type="checkbox" />
                <span>报告显示完整 IP</span>
              </label>
            </div>
            <button class="primary-button" type="submit" :disabled="busy || !toolServerId || !readyServers.length">
              <Loader2 v-if="busy" class="spin" :size="16" />
              <SearchCheck v-else :size="16" />
              运行 IPQuality
            </button>
          </form>
        </div>
      </section>

      <section v-if="activePage === 'nodes'" id="nodes" class="panel">
        <div class="section-title">
          <div><Wifi :size="18" /><h2>节点</h2></div>
          <button class="secondary-button" type="button" :disabled="busy || !readyServers.length" @click="openManualNodeModal">
            <Plus :size="15" />
            添加监控
          </button>
        </div>
        <div v-if="!state.nodes.length" class="empty-state">还没有节点。可以先部署节点，或把已有 sing-box 节点手动加入监控。</div>
        <template v-else>
          <div class="list-toolbar">
            <label class="toggle-row compact-toggle">
              <input v-model="nodesGrouped" type="checkbox" />
              <span>按分组展示</span>
            </label>
          </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>节点</th><th>分组</th><th>服务器</th><th>入口</th><th>流量</th><th>在线</th><th>状态</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in nodeRows" :key="row.key">
                <tr v-if="row.type === 'group'" class="group-row">
                  <td colspan="8"><strong>{{ row.label }}</strong><span>{{ row.count }} 个节点</span></td>
                </tr>
                <tr v-else>
                  <td><strong>{{ row.node.name }}</strong><small>{{ nodeProtocolLabel(row.node.protocol) }} · {{ nodeSourceLabel(row.node) }}</small></td>
                  <td><span class="group-badge">{{ groupLabel(row.node.group) }}</span></td>
                  <td>{{ serverName(row.node.serverId) }}</td>
                  <td>{{ row.node.endpoint }}</td>
                  <td>{{ fmtBytes((row.node.traffic?.tx || 0) + (row.node.traffic?.rx || 0)) }}</td>
                  <td>{{ row.node.onlineUsers || 0 }}</td>
                  <td class="metric-cell">
                    <span :class="`pill status-${row.node.status || 'unknown'}`">{{ statusLabel(row.node.status) }}</span>
                    <small>{{ fmtTime(row.node.lastCheckedAt) }}</small>
                    <small v-if="row.node.lastSyncError" class="error-text">{{ row.node.lastSyncError }}</small>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button v-if="isDeployableNode(row.node)" type="button" title="修改节点参数" :disabled="busy || !readyServerIds.has(row.node.serverId)" @click="startEditNode(row.node)"><Pencil :size="15" /></button>
                      <button type="button" title="刷新状态" :disabled="!readyServerIds.has(row.node.serverId)" @click="refreshNode(row.node)"><RefreshCcw :size="15" /></button>
                      <button type="button" title="重启服务" :disabled="!canControlNodeService(row.node)" @click="serviceNode(row.node, 'restart')"><RotateCw :size="15" /></button>
                      <button v-if="isDeployableNode(row.node)" class="icon-danger" type="button" title="卸载并删除节点" :disabled="busy || !readyServerIds.has(row.node.serverId) || row.node.status === 'deleting'" @click="deleteNode(row.node)"><Trash2 :size="15" /></button>
                      <button class="icon-danger" type="button" :title="row.node.monitorOnly ? '移除监控记录' : '强制清除本地节点记录'" :disabled="busy" @click="forceClearNode(row.node)"><Eraser :size="15" /></button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        </template>
      </section>

      <section v-if="activePage === 'connections'" id="connections" class="panel">
        <div class="section-title">
          <div><Ban :size="18" /><h2>客户端流量与封禁</h2></div>
        </div>
        <div class="ban-panel">
          <input v-model="sourceIp" placeholder="客户端 IP/CIDR，如 203.0.113.10 或 2001:db8::/64" />
          <button type="button" class="secondary-button" @click="banNodeModalOpen = true">
            <Wifi :size="16" />选择节点（{{ selectedNodes.length }}）
          </button>
          <button type="button" class="danger-button" :disabled="!sourceIp || !selectedNodes.length" @click="runBan">
            <Ban :size="16" />在选中节点封禁
          </button>
          <small>当前应用节点：{{ selectedNodePreview }}。该动作通过各服务器的持久化 hook 写入防火墙 DROP 规则，不是 WebUI 访问控制。</small>
        </div>

        <div class="stats-title-row">
          <div>
            <h3 class="subsection-title">连接统计列表</h3>
            <span class="filter-count">客户端 IP {{ filteredRemoteTraffic.length }} / {{ state.remoteTraffic.length }}，实时连接 {{ filteredConnections.length }} / {{ state.connections.length }}</span>
          </div>
          <button class="collapse-button" type="button" :aria-expanded="!connectionStatsCollapsed" @click="connectionStatsCollapsed = !connectionStatsCollapsed">
            <ChevronRight v-if="connectionStatsCollapsed" :size="16" />
            <ChevronDown v-else :size="16" />
            {{ connectionStatsCollapsed ? "展开" : "折叠" }}
          </button>
        </div>

        <div v-if="connectionStatsCollapsed" class="stats-collapsed">
          统计列表已收起，当前过滤命中 {{ filteredRemoteTraffic.length + filteredConnections.length }} 条。
        </div>
        <template v-else>
          <div class="connection-controls">
            <label class="task-search-field">
              <span>搜索</span>
              <div class="input-with-icon">
                <Search :size="15" />
                <input v-model="connectionSearch" placeholder="客户端 IP、节点、协议、本地地址" />
              </div>
            </label>
            <label>
              <span>节点</span>
              <select v-model="connectionNodeFilter">
                <option value="all">全部节点</option>
                <option v-for="option in connectionNodeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>协议</span>
              <select v-model="connectionProtocolFilter">
                <option value="all">全部协议</option>
                <option v-for="protocol in connectionProtocolOptions" :key="protocol" :value="protocol">{{ protocol }}</option>
              </select>
            </label>
            <label>
              <span>IP 版本</span>
              <select v-model="connectionFamilyFilter">
                <option value="all">IPv4 + IPv6</option>
                <option value="4">IPv4</option>
                <option value="6">IPv6</option>
              </select>
            </label>
          </div>
          <div class="connection-sort-row">
            <label>
              <span>排序参考</span>
              <select v-model="connectionSortKey">
                <option v-for="option in connectionSortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>顺序</span>
              <select v-model="connectionSortDirection">
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </label>
            <label class="toggle-row compact-toggle">
              <input v-model="connectionStatsGrouped" type="checkbox" />
              <span>按节点分组展示</span>
            </label>
            <span class="connection-sort-hint">统计口径：仅统计连接到节点监听端口的客户端入站与回程流量。</span>
          </div>

          <h3 class="subsection-title">客户端流量统计</h3>
          <div v-if="!state.remoteTraffic.length" class="empty-state">刷新节点状态后，这里会按客户端 IP 统计 RX/TX 流量。</div>
          <div v-else-if="!filteredRemoteTraffic.length" class="empty-state">没有符合当前筛选条件的客户端流量记录。</div>
          <div v-else class="table-wrap compact-table stats-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>客户端 IP</th><th>节点</th><th>RX</th><th>TX</th><th>总计</th><th>连接</th><th>协议</th><th>刷新时间</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in remoteTrafficRows" :key="row.key">
                  <tr v-if="row.type === 'group'" class="group-row">
                    <td colspan="9"><strong>{{ row.label }}</strong><span>{{ row.count }} 条客户端 IP</span></td>
                  </tr>
                  <tr v-else>
                    <td><strong>{{ trafficClientIp(row.traffic) }}</strong><small v-if="row.traffic.ipFamily">IPv{{ row.traffic.ipFamily }}</small></td>
                    <td>{{ nodeName(row.traffic.nodeId) }}</td>
                    <td>{{ fmtBytes(row.traffic.rx) }}</td>
                    <td>{{ fmtBytes(row.traffic.tx) }}</td>
                    <td>{{ fmtBytes(row.traffic.total || ((row.traffic.rx || 0) + (row.traffic.tx || 0))) }}</td>
                    <td>{{ row.traffic.connections || 0 }}</td>
                    <td>{{ (row.traffic.protocols || []).join(", ") || "-" }}</td>
                    <td>{{ fmtTime(row.traffic.lastSeenAt) }}</td>
                    <td><button type="button" @click="sourceIp = trafficClientIp(row.traffic)">填入封禁</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <h3 class="subsection-title">实时客户端连接</h3>
          <div v-if="!state.connections.length" class="empty-state">刷新节点状态后，这里会显示可封禁的客户端来源 IP。</div>
          <div v-else-if="!filteredConnections.length" class="empty-state">没有符合当前筛选条件的实时连接。</div>
          <div v-else class="table-wrap compact-table stats-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>客户端 IP</th><th>节点</th><th>客户端端点</th><th>节点监听</th><th>协议</th><th>流量</th><th>连接</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in connectionRows" :key="row.key">
                  <tr v-if="row.type === 'group'" class="group-row">
                    <td colspan="8"><strong>{{ row.label }}</strong><span>{{ row.count }} 个客户端</span></td>
                  </tr>
                  <tr v-else>
                    <td><strong>{{ row.connection.sourceIp }}</strong><small v-if="row.connection.ipFamily">IPv{{ row.connection.ipFamily }}</small></td>
                    <td>{{ nodeName(row.connection.nodeId) }}</td>
                    <td>{{ row.connection.remote || "-" }}</td>
                    <td>{{ row.connection.local || "-" }}</td>
                    <td>{{ (row.connection.protocols || [row.connection.protocol]).filter(Boolean).join(", ") || "-" }}</td>
                    <td>{{ fmtBytes(row.connection.total || ((row.connection.rx || 0) + (row.connection.tx || 0))) }}</td>
                    <td>{{ row.connection.connections || 1 }}</td>
                    <td><button type="button" @click="sourceIp = row.connection.sourceIp">填入</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <section v-if="activePage === 'terminal'" id="terminal" class="panel terminal-page">
        <div class="section-title">
          <div><Terminal :size="18" /><h2>服务器终端</h2></div>
          <div class="job-state">{{ activeTerminalSession.job?.status || "idle" }}</div>
        </div>
        <div class="terminal-controls">
          <label>
            <span>目标服务器</span>
            <select v-model="terminalServerId" required>
              <option value="" disabled>选择 hook 已就绪的服务器</option>
              <option v-for="server in readyServers" :key="server.id" :value="server.id">{{ server.name }}</option>
            </select>
          </label>
          <label>
            <span>工作目录</span>
            <input v-model="activeTerminalSession.cwd" placeholder="/root" :disabled="!terminalServerId" />
          </label>
          <label>
            <span>超时秒数</span>
            <input v-model.number="activeTerminalSession.timeoutSeconds" type="number" min="1" max="3600" :disabled="!terminalServerId" />
          </label>
          <div class="terminal-actions">
            <button class="secondary-button" type="button" :disabled="!terminalServerId" @click="clearTerminal">
              <Eraser :size="15" />
              清屏
            </button>
          </div>
        </div>
        <div class="terminal-shell" @click="focusTerminalInput">
          <div class="terminal-shell-head">
            <span>{{ terminalServerId ? `${serverName(terminalServerId)} Terminal` : "Hook Terminal" }}</span>
            <small>{{ terminalSessionRunning(activeTerminalSession) ? "running" : "ready" }}</small>
          </div>
          <pre ref="terminalOutputRef" class="terminal-output">{{ activeTerminalSession.output || "在下方提示符输入命令并按 Enter。" }}</pre>
          <form class="terminal-input-line" @submit.prevent="runTerminalCommand">
            <span class="terminal-prompt">{{ terminalPrompt(activeTerminalSession) }}</span>
            <input
              ref="terminalCommandInputRef"
              v-model="activeTerminalSession.command"
              autocomplete="off"
              spellcheck="false"
              :disabled="!terminalServerId || terminalSessionRunning(activeTerminalSession)"
              @keydown.enter.exact.prevent="runTerminalCommand"
            />
            <Loader2 v-if="terminalSessionRunning(activeTerminalSession)" class="spin terminal-running-icon" :size="15" />
          </form>
        </div>
      </section>

      <section v-if="activePage === 'logs'" id="logs" class="panel">
        <div class="section-title">
          <div><Terminal :size="18" /><h2>任务日志</h2></div>
          <div class="job-state">{{ activeJob?.status || "idle" }}</div>
        </div>
        <div class="console">
          <div class="console-head"><Terminal :size="16" /><span>{{ activeJob ? activeJob.title : "Hook 输出" }}</span></div>
          <pre>{{ jobLogs.length ? jobLogs.join("") : "等待服务器 hook 安装、节点部署、状态刷新或封禁任务..." }}</pre>
        </div>
      </section>
    </main>
  </div>
</template>
