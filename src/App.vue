<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
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
  providers: []
});

const loading = ref(true);
const busy = ref(false);
const toast = ref("");
let refreshTimer = null;
const pageDefinitions = [
  { id: "overview", title: "舰队总览", description: "服务器、节点、连接来源与流量态势。" },
  { id: "servers", title: "服务器管理", description: "添加服务器、安装或升级持久化 Hook，并维护服务器名称、分组与连接信息。" },
  { id: "deploy", title: "节点部署", description: "在 Hook 已就绪的服务器上部署或重新部署 Hysteria2 / Trojan 节点。" },
  { id: "nodes", title: "节点管理", description: "查看节点状态、资源同步结果，并执行修改、重启、卸载或强制清理。" },
  { id: "connections", title: "连接统计与封禁", description: "按远程 IP 查看流量与连接来源，并在弹窗中选择要应用封禁的节点。" },
  { id: "tools", title: "服务器工具", description: "执行性能优化和 IPQuality 双栈检测等 Hook 侧任务。" },
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
  { platform: "macOS", arch: "x64 / arm64", packages: "dmg / zip" },
  { platform: "Linux", arch: "x64", packages: "deb / zip" }
];
const selectedNodes = ref([]);
const serversGrouped = ref(false);
const nodesGrouped = ref(false);
const banNodeModalOpen = ref(false);
const banNodeSearch = ref("");
const banNodeGroupFilter = ref("all");
const banNodesGrouped = ref(true);
const jobLogs = ref([]);
const activeJob = ref(null);
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
const sourceIp = ref("");
const toolServerId = ref("");
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

const currentProvider = computed(() => state.providers.find((item) => item.id === deployProtocol.value));
const isHy2 = computed(() => deployProtocol.value === "hysteria2");
const isPasswordAuthProtocol = computed(() => ["hysteria2", "trojan"].includes(deployProtocol.value));
const hasFixedListenPort = computed(() => deployProtocol.value === "trojan");
const readyServers = computed(() => state.servers.filter((server) => server.hookStatus === "online" || server.hookInstalled));
const readyServerIds = computed(() => new Set(readyServers.value.map((server) => server.id)));
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
    if (connection.protocol) protocols.add(connection.protocol);
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
      item.remoteIp,
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
    if (connectionProtocolFilter.value !== "all" && connection.protocol !== connectionProtocolFilter.value) return false;
    if (!query) return true;
    const haystack = [
      connection.sourceIp,
      nodeName(connection.nodeId),
      connection.remote,
      connection.local,
      connection.protocol,
      connection.state
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
});
const remoteTrafficRows = computed(() =>
  groupedRows(filteredRemoteTraffic.value, connectionStatsGrouped.value, "全部远程 IP", "traffic", (item) => nodeGroupById(item.nodeId))
);
const connectionRows = computed(() =>
  groupedRows(filteredConnections.value, connectionStatsGrouped.value, "全部连接", "connection", (item) => nodeGroupById(item.nodeId))
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
    return `连接 ${result.connections?.length || 0}，远程 IP ${result.remoteTraffic?.length || 0}`;
  }
  if (job.type === "deploy") return result?.endpoint ? `节点部署完成：${result.endpoint}` : "节点部署完成";
  if (job.type === "node-update") return result?.endpoint ? `节点更新完成：${result.endpoint}` : "节点更新完成";
  if (job.type === "ban") return "封禁规则已下发";
  if (job.type === "node-delete") return "节点清理完成";
  if (job.type === "server-delete") return "服务器清理完成";
  if (job.type === "hook-install") return result?.hookUrl ? `Hook 已就绪：${result.hookUrl}` : "Hook 安装完成";
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

function serverName(serverId) {
  return state.servers.find((server) => server.id === serverId)?.name || "未知服务器";
}

function nodeName(nodeId) {
  return state.nodes.find((node) => node.id === nodeId)?.name || "未知节点";
}

function nodeProtocolLabel(protocol) {
  if (protocol === "hysteria2") return "HY2";
  if (protocol === "trojan") return "Trojan";
  return protocol || "-";
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

async function load() {
  const data = await api.bootstrap();
  Object.assign(state, data);
  const currentNodeIds = new Set((data.nodes || []).map((node) => node.id));
  selectedNodes.value = selectedNodes.value.filter((id) => currentNodeIds.has(id));
  if (!deployServerId.value && readyServers.value.length) {
    deployServerId.value = readyServers.value[0].id;
  }
  if (!toolServerId.value && readyServers.value.length) {
    toolServerId.value = readyServers.value[0].id;
  }
  loading.value = false;
}

async function syncNow() {
  loading.value = true;
  try {
    await api.sync();
  } catch (error) {
    showError(error);
  }
  await load().catch(showError);
}

function showError(error) {
  toast.value = error?.message || String(error);
}

function watchJob(job) {
  activeJob.value = job;
  jobLogs.value = [];
  subscribeJob(job.id, {
    onLog: (line) => jobLogs.value.push(line),
    onDone: (done) => {
      const completedJob = { ...activeJob.value, ...done };
      activeJob.value = completedJob;
      if (completedJob.type === "ipquality" && done?.result) {
        ipQualityModal.value = done.result;
      }
      busy.value = false;
      load().catch(showError);
    },
    onError: () => {
      busy.value = false;
    }
  });
}

function watchJobs(jobs, title) {
  const pending = new Set(jobs.map((job) => job.id));
  const ipQualityResults = [];
  let failed = 0;
  activeJob.value = { id: "batch", title, type: "batch", status: "running", createdAt: new Date().toISOString() };
  jobLogs.value = [];
  for (const job of jobs) {
    jobLogs.value.push(`--- ${job.title} ---\n`);
    subscribeJob(job.id, {
      onLog: (line) => jobLogs.value.push(line),
      onDone: (done) => {
        if (done?.status === "failed") failed += 1;
        if (job.type === "ipquality" && done?.result) {
          ipQualityResults.push({ ...done.result, title: job.title });
        }
        pending.delete(job.id);
        if (!pending.size) {
          busy.value = false;
          activeJob.value = {
            ...activeJob.value,
            status: failed ? "failed" : "success",
            updatedAt: new Date().toISOString(),
            error: failed ? `${failed} 个子任务失败` : ""
          };
          if (ipQualityResults.length) {
            ipQualityModal.value = { reports: ipQualityResults };
          }
          load().catch(showError);
        }
      },
      onError: () => {
        pending.delete(job.id);
        if (!pending.size) busy.value = false;
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
    watchJob(result.job);
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
    watchJob(result.job);
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

function startEditNode(node) {
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
    watchJob(result.job);
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
    watchJob(result.job);
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function refreshNode(node) {
  busy.value = true;
  try {
    const result = await api.refreshStatus({ serverId: node.serverId, nodeId: node.id });
    watchJob(result.job);
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function serviceNode(node, action) {
  busy.value = true;
  try {
    const result = await api.service({ serverId: node.serverId, nodeId: node.id, action });
    watchJob(result.job);
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
    watchJob(result.job);
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

async function forceClearNode(node) {
  if (!window.confirm(`强制清除节点 ${node.name}？该动作只删除本地记录，不会连接服务器，也不会清理远端服务。`)) return;
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
    watchJobs(result.jobs, `批量封禁来源 IP ${sourceIp.value}`);
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
    watchJob(result.job);
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
      watchJobs(result.jobs, `IPQuality ${serverName(toolServerId.value)} IPv4 + IPv6`);
    } else {
      watchJob(result.job);
    }
  } catch (error) {
    busy.value = false;
    showError(error);
  }
}

watch(
  () => [deployProtocol.value, deployNode.portHoppingEnabled],
  ([protocol]) => {
    if (protocol === "trojan") deployNode.listenPort = 443;
  }
);

onMounted(() => {
  syncPageFromHash();
  window.addEventListener("hashchange", syncPageFromHash);
  load().catch((error) => {
    loading.value = false;
    showError(error);
  });
  refreshTimer = window.setInterval(() => {
    load().catch(showError);
  }, 5000);
});

onUnmounted(() => {
  window.removeEventListener("hashchange", syncPageFromHash);
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <div class="app">
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
        <button type="button" @click="syncNow" :disabled="loading">
          <Loader2 v-if="loading" class="spin" :size="16" />
          <RefreshCcw v-else :size="16" />
          同步
        </button>
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
                    <td><strong>{{ row.node.name }}</strong><small>{{ row.node.protocol }}</small></td>
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
            <small>{{ state.remoteTraffic.length }} 个远程 IP</small>
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
              <div><Network :size="17" /><h3>远程 IP</h3></div>
              <small>{{ state.remoteTraffic.length }} 个来源</small>
            </div>
            <div v-if="!topRemoteTraffic.length" class="empty-state">还没有远程 IP 流量统计。</div>
            <div v-else class="remote-list">
              <article v-for="item in topRemoteTraffic" :key="item.id">
                <strong>{{ item.remoteIp }}</strong>
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
        </div>
      </section>

      <section v-if="activePage === 'servers'" id="servers" class="panel">
        <div class="section-title">
          <div><Server :size="18" /><h2>服务器 hooks</h2></div>
        </div>
        <form class="server-install" @submit.prevent="installServer">
          <p v-if="serverForm.id" class="form-note warning-note">正在升级/重装 {{ serverForm.name }} 的持久化 hook。SSH 凭据只用于这一次安装。</p>
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
          <p class="form-note">SSH 凭据只用于这一次安装；安装完成后面板只保存 hook URL 与访问 token。</p>
          <button class="primary-button" type="submit" :disabled="busy">
            <Loader2 v-if="busy" class="spin" :size="16" />
            <ShieldCheck v-else :size="16" />
            {{ serverForm.id ? "升级/重装 hook" : "添加服务器并安装 hook" }}
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
                        <button type="button" title="升级/重装 hook" :disabled="busy" @click="prepareHookUpgrade(row.server)"><ShieldCheck :size="15" /></button>
                        <button type="button" title="编辑服务器信息" :disabled="busy" @click="startEditServer(row.server)"><Pencil :size="15" /></button>
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
          <p v-if="editingNodeId" class="form-note warning-note">正在修改 {{ editingNodeName }}。保存后会通过目标服务器 hook 重新部署该节点；节点密码不会保存在面板中，需要重新输入。</p>
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
        </div>
        <div v-if="!state.nodes.length" class="empty-state">还没有节点。先在 hook 已就绪的服务器上部署节点。</div>
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
                  <td><strong>{{ row.node.name }}</strong><small>{{ row.node.protocol }}</small></td>
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
                      <button type="button" title="修改节点参数" :disabled="busy || !readyServerIds.has(row.node.serverId)" @click="startEditNode(row.node)"><Pencil :size="15" /></button>
                      <button type="button" title="刷新状态" :disabled="!readyServerIds.has(row.node.serverId)" @click="refreshNode(row.node)"><RefreshCcw :size="15" /></button>
                      <button type="button" title="重启服务" :disabled="!readyServerIds.has(row.node.serverId)" @click="serviceNode(row.node, 'restart')"><RotateCw :size="15" /></button>
                      <button class="icon-danger" type="button" title="卸载并删除节点" :disabled="busy || !readyServerIds.has(row.node.serverId) || row.node.status === 'deleting'" @click="deleteNode(row.node)"><Trash2 :size="15" /></button>
                      <button class="icon-danger" type="button" title="强制清除本地节点记录" :disabled="busy" @click="forceClearNode(row.node)"><Eraser :size="15" /></button>
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
          <div><Ban :size="18" /><h2>远程 IP 流量与封禁</h2></div>
        </div>
        <div class="ban-panel">
          <input v-model="sourceIp" placeholder="连接来源 IP/CIDR，如 203.0.113.10 或 2001:db8::/64" />
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
            <span class="filter-count">远程 IP {{ filteredRemoteTraffic.length }} / {{ state.remoteTraffic.length }}，实时连接 {{ filteredConnections.length }} / {{ state.connections.length }}</span>
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
                <input v-model="connectionSearch" placeholder="IP、节点、协议、远端地址" />
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
            <label class="toggle-row compact-toggle">
              <input v-model="connectionStatsGrouped" type="checkbox" />
              <span>按节点分组展示</span>
            </label>
          </div>

          <h3 class="subsection-title">远程 IP 流量统计</h3>
          <div v-if="!state.remoteTraffic.length" class="empty-state">刷新节点状态后，这里会按远程 IP 统计 RX/TX 流量。</div>
          <div v-else-if="!filteredRemoteTraffic.length" class="empty-state">没有符合当前筛选条件的远程 IP 流量记录。</div>
          <div v-else class="table-wrap compact-table stats-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>远程 IP</th><th>节点</th><th>RX</th><th>TX</th><th>总计</th><th>连接</th><th>协议</th><th>刷新时间</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in remoteTrafficRows" :key="row.key">
                  <tr v-if="row.type === 'group'" class="group-row">
                    <td colspan="9"><strong>{{ row.label }}</strong><span>{{ row.count }} 条远程 IP</span></td>
                  </tr>
                  <tr v-else>
                    <td><strong>{{ row.traffic.remoteIp }}</strong><small v-if="row.traffic.ipFamily">IPv{{ row.traffic.ipFamily }}</small></td>
                    <td>{{ nodeName(row.traffic.nodeId) }}</td>
                    <td>{{ fmtBytes(row.traffic.rx) }}</td>
                    <td>{{ fmtBytes(row.traffic.tx) }}</td>
                    <td>{{ fmtBytes(row.traffic.total || ((row.traffic.rx || 0) + (row.traffic.tx || 0))) }}</td>
                    <td>{{ row.traffic.connections || 0 }}</td>
                    <td>{{ (row.traffic.protocols || []).join(", ") || "-" }}</td>
                    <td>{{ fmtTime(row.traffic.lastSeenAt) }}</td>
                    <td><button type="button" @click="sourceIp = row.traffic.remoteIp">填入封禁</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <h3 class="subsection-title">实时连接来源</h3>
          <div v-if="!state.connections.length" class="empty-state">刷新节点状态后，这里会显示可封禁的连接来源 IP。</div>
          <div v-else-if="!filteredConnections.length" class="empty-state">没有符合当前筛选条件的实时连接。</div>
          <div v-else class="table-wrap compact-table stats-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>来源 IP</th><th>节点</th><th>远端</th><th>本地</th><th>协议</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in connectionRows" :key="row.key">
                  <tr v-if="row.type === 'group'" class="group-row">
                    <td colspan="6"><strong>{{ row.label }}</strong><span>{{ row.count }} 条连接</span></td>
                  </tr>
                  <tr v-else>
                    <td><strong>{{ row.connection.sourceIp }}</strong><small v-if="row.connection.ipFamily">IPv{{ row.connection.ipFamily }}</small></td>
                    <td>{{ nodeName(row.connection.nodeId) }}</td>
                    <td>{{ row.connection.remote }}</td>
                    <td>{{ row.connection.local }}</td>
                    <td>{{ row.connection.protocol }}</td>
                    <td><button type="button" @click="sourceIp = row.connection.sourceIp">填入</button></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>
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
