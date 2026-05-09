import { EventEmitter } from "node:events";
import { isIP } from "node:net";
import { v4 as uuid } from "uuid";
import { appendAudit, mutateDb, stamp } from "./db.js";
import { buildHookUpgradeBundleB64, callHookAgent, checkHookHealth, installHookAgent } from "./hook-agent.js";
import { isDeployableProtocol, monitorProtocols, providers } from "./providers.js";
import { collectNodeSecrets, sanitizeNodeSecrets } from "./security.js";

const streams = new Map();

function getStream(jobId) {
  if (!streams.has(jobId)) streams.set(jobId, new EventEmitter());
  return streams.get(jobId);
}

function redact(text, secrets = []) {
  let safe = text;
  for (const secret of secrets.filter(Boolean)) {
    safe = safe.split(secret).join("******");
  }
  return safe;
}

async function patchJob(jobId, patch) {
  await mutateDb((state) => {
    const job = (state.jobs || []).find((item) => item.id === jobId);
    if (job) Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  });
}

async function logJob(jobId, text, secrets = []) {
  const message = redact(text, secrets);
  getStream(jobId).emit("log", message);
  await mutateDb((state) => {
    const job = (state.jobs || []).find((item) => item.id === jobId);
    if (!job) return;
    job.logs = [...(job.logs || []), message].slice(-600);
    job.updatedAt = new Date().toISOString();
  });
}

function usersToEnv(users = []) {
  return users
    .map((user) => `${user.username}:${user.password}`)
    .filter((line) => line.length > 1)
    .join("|");
}

function nodeEnv({ node, users, action, extra = {} }) {
  return {
    SIMPLEUI_ACTION: action,
    SIMPLEUI_NODE_ID: node.id,
    SIMPLEUI_REMOTE_KEY: node.remoteKey,
    SIMPLEUI_PROTOCOL: node.protocol,
    SIMPLEUI_SERVICE: node.service,
    SIMPLEUI_SERVICE_PROTO: node.serviceProtocol,
    SIMPLEUI_CONFIG: node.configPath,
    SIMPLEUI_MONITOR_ONLY: node.monitorOnly ? "1" : "0",
    SIMPLEUI_NODE_NAME: node.name,
    SIMPLEUI_DOMAIN: node.domain,
    SIMPLEUI_PORT: node.listenPort || node.port || 443,
    SIMPLEUI_MASQUERADE_URL: node.masqueradeUrl || "https://www.bing.com/",
    SIMPLEUI_TLS_MODE: node.tlsMode || "self-signed",
    SIMPLEUI_ACME_EMAIL: node.acmeEmail,
    SIMPLEUI_DNS_PROVIDER: node.dnsProvider,
    SIMPLEUI_DNS_TOKEN: node.dnsToken,
    SIMPLEUI_DNS_OVERRIDE_DOMAIN: node.dnsOverrideDomain,
    SIMPLEUI_DNS_USER: node.dnsUser,
    SIMPLEUI_DNS_SERVER: node.dnsServer,
    SIMPLEUI_SELF_SIGNED_DOMAIN: node.selfSignedDomain,
    SIMPLEUI_SELF_SIGNED_IP_MODE: node.selfSignedIpMode,
    SIMPLEUI_SELF_SIGNED_HOST: node.selfSignedHost,
    SIMPLEUI_CERT_PATH: node.certPath,
    SIMPLEUI_KEY_PATH: node.keyPath,
    SIMPLEUI_BRUTAL: node.ignoreClientBandwidth ? "true" : "false",
    SIMPLEUI_OBFS_ENABLED: node.obfsEnabled ? "1" : "0",
    SIMPLEUI_OBFS_PASSWORD: node.obfsPassword,
    SIMPLEUI_SNIFF_ENABLED: node.sniffEnabled ? "1" : "0",
    SIMPLEUI_JUMP_PORT_ENABLED: node.portHoppingEnabled ? "1" : "0",
    SIMPLEUI_JUMP_PORT_START: node.jumpPortStart,
    SIMPLEUI_JUMP_PORT_END: node.jumpPortEnd,
    SIMPLEUI_JUMP_PORT_INTERFACE: node.jumpPortInterface,
    SIMPLEUI_JUMP_PORT_IPV6_ENABLED: node.jumpPortIpv6Enabled ? "1" : "0",
    SIMPLEUI_JUMP_PORT_IPV6_INTERFACE: node.jumpPortIpv6Interface,
    SIMPLEUI_USERS: usersToEnv(users),
    ...extra
  };
}

function serverEnv({ action, extra = {} }) {
  return {
    SIMPLEUI_ACTION: action,
    ...extra
  };
}

function parseMarker(output, marker) {
  const line = output
    .split(/\r?\n/)
    .reverse()
    .find((item) => item.startsWith(marker));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(marker.length));
  } catch {
    return null;
  }
}

function parseMarkerPayloads(output = "", marker) {
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith(marker))
    .map((line) => {
      try {
        return JSON.parse(line.slice(marker.length));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function removeLastMarkerLine(output = "", marker) {
  const lines = output.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith(marker)) {
      lines.splice(index, 1);
      break;
    }
  }
  return lines.join("\n");
}

function stripMarker(output = "", markers = []) {
  if (!markers.length) return output;
  let clean = output;
  for (const marker of markers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clean = clean.replace(new RegExp(`(^|\\r?\\n)${escaped}[^\\r\\n]*(?=\\r?\\n|$)`, "g"), "$1");
  }
  return clean.replace(/\n?$/, "\n");
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function callRemoteExec(server, command, { timeoutSeconds = 60, outputLimit = 200000 } = {}) {
  const result = await callHookAgent({
    server,
    action: "exec",
    env: serverEnv({
      action: "exec",
      extra: {
        SIMPLEUI_EXEC_COMMAND: command,
        SIMPLEUI_EXEC_CWD: "/root",
        SIMPLEUI_EXEC_TIMEOUT: String(timeoutSeconds),
        SIMPLEUI_EXEC_OUTPUT_LIMIT: String(outputLimit)
      }
    }),
    timeoutMs: timeoutSeconds * 1000 + 15_000
  });
  const parsed = parseMarker(result.output || "", "__SIMPLEUI_RESULT__");
  if (!parsed?.ok) {
    const cleanOutput = stripMarker(result.output || "", ["__SIMPLEUI_RESULT__"]).trim();
    const suffix = parsed?.exitCode ? ` (exit ${parsed.exitCode})` : "";
    throw new Error(parsed?.error || cleanOutput || `Remote exec failed${suffix}`);
  }
  return { result, parsed };
}

function hookUpgradeFromBundleFileCommand(remotePath) {
  const script = String.raw`import base64
import json
import os
import subprocess
import sys
import tempfile

ROOT = "/opt/simpleui-hook"
HOOK_DIR = os.path.join(ROOT, "hooks")
bundle_path = sys.argv[1]

def emit(payload):
    print("__SIMPLEUI_RESULT__" + json.dumps(payload, ensure_ascii=False))

try:
    with open(bundle_path, "r", encoding="utf-8") as handle:
        bundle_b64 = handle.read().strip()
except OSError as exc:
    print(f"[simpleui] Unable to read hook upgrade bundle file: {exc}")
    emit({"ok": False, "error": "Unable to read hook upgrade bundle file"})
    raise SystemExit(0)

if not bundle_b64:
    print("[simpleui] Missing hook upgrade bundle.")
    emit({"ok": False, "error": "Missing hook upgrade bundle"})
    raise SystemExit(0)

try:
    bundle = json.loads(base64.b64decode(bundle_b64).decode("utf-8"))
except Exception as exc:
    print(f"[simpleui] Invalid hook upgrade bundle: {exc}")
    emit({"ok": False, "error": "Invalid hook upgrade bundle"})
    raise SystemExit(0)

agent = bundle.get("agent")
hooks = bundle.get("hooks") or []
if not isinstance(agent, str) or not agent:
    print("[simpleui] Upgrade bundle does not contain agent.py.")
    emit({"ok": False, "error": "Missing agent"})
    raise SystemExit(0)
if not isinstance(hooks, list) or not hooks:
    print("[simpleui] Upgrade bundle does not contain hook scripts.")
    emit({"ok": False, "error": "Missing hooks"})
    raise SystemExit(0)

os.makedirs(HOOK_DIR, mode=0o700, exist_ok=True)

def atomic_write(path, content, mode):
    directory = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(prefix=".simpleui-", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
            if not content.endswith("\n"):
                handle.write("\n")
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

atomic_write(os.path.join(ROOT, "agent.py"), agent, 0o700)
written = []
for item in hooks:
    name = item.get("name") if isinstance(item, dict) else None
    content = item.get("content") if isinstance(item, dict) else None
    if not isinstance(name, str) or "/" in name or not name.endswith(".sh"):
        raise ValueError(f"invalid hook script name: {name!r}")
    if not isinstance(content, str):
        raise ValueError(f"invalid hook script content: {name}")
    atomic_write(os.path.join(HOOK_DIR, name), content, 0o700)
    written.append(name)

try:
    os.unlink(bundle_path)
except OSError:
    pass

subprocess.run(["systemctl", "daemon-reload"], check=False)
subprocess.Popen(
    ["sh", "-c", "sleep 1; systemctl restart simpleui-hook.service >/dev/null 2>&1"],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    start_new_session=True,
)

emit({
    "ok": True,
    "service": "simpleui-hook.service",
    "hooks": written,
    "restartScheduled": True,
    "transport": "exec-chunked",
})`;
  return `python3 - ${shQuote(remotePath)} <<'PY'\n${script}\nPY`;
}

function shouldFallbackHookUpgrade(error) {
  const message = String(error?.message || "");
  if (/unauthorized|hook is not installed/i.test(message)) return false;
  return /Missing hook upgrade bundle|request body too large|Argument list too long|unsupported action/i.test(message);
}

async function upgradeHookViaChunkedExec({ server, bundle, jobId, secrets }) {
  const remotePath = `/tmp/simpleui-upgrade-${uuid()}.b64`;
  const chunkSize = 48 * 1024;
  const totalChunks = Math.max(1, Math.ceil(bundle.length / chunkSize));

  await logJob(jobId, `Switching to chunked hook upgrade transport (${totalChunks} chunks).\n`, secrets);
  try {
    await callRemoteExec(server, `umask 077 && : > ${shQuote(remotePath)}`, {
      timeoutSeconds: 30,
      outputLimit: 4096
    });

    for (let offset = 0, index = 0; offset < bundle.length; offset += chunkSize, index += 1) {
      const chunk = bundle.slice(offset, offset + chunkSize);
      await callRemoteExec(
        server,
        `cat >> ${shQuote(remotePath)} <<'__SIMPLEUI_UPGRADE_CHUNK__'\n${chunk}\n__SIMPLEUI_UPGRADE_CHUNK__`,
        { timeoutSeconds: 30, outputLimit: 4096 }
      );
      const chunkNumber = index + 1;
      if (chunkNumber === 1 || chunkNumber === totalChunks || chunkNumber % 10 === 0) {
        await logJob(jobId, `Uploaded hook upgrade chunk ${chunkNumber}/${totalChunks}.\n`, secrets);
      }
    }

    const { result } = await callRemoteExec(server, hookUpgradeFromBundleFileCommand(remotePath), {
      timeoutSeconds: 120,
      outputLimit: 200000
    });
    const payloads = parseMarkerPayloads(result.output || "", "__SIMPLEUI_RESULT__");
    const upgradePayload = payloads.length > 1 ? payloads[payloads.length - 2] : payloads[0];
    if (upgradePayload?.ok === false) {
      throw new Error(upgradePayload.error || "Remote upgrade command rejected bundle");
    }
    return {
      ...result,
      output: removeLastMarkerLine(result.output || "", "__SIMPLEUI_RESULT__")
    };
  } catch (error) {
    throw new Error(`Chunked hook upgrade failed: ${error.message}`);
  } finally {
    try {
      await callRemoteExec(server, `rm -f ${shQuote(remotePath)}`, {
        timeoutSeconds: 15,
        outputLimit: 4096
      });
    } catch {
      // Best-effort cleanup; the upgrade command also removes the file on success.
    }
  }
}

function sumTraffic(traffic = {}) {
  return Object.values(traffic).reduce(
    (total, item) => ({
      tx: total.tx + Number(item?.tx || 0),
      rx: total.rx + Number(item?.rx || 0)
    }),
    { tx: 0, rx: 0 }
  );
}

function onlineCount(online = {}) {
  return Object.values(online).reduce((total, value) => total + Number(value || 0), 0);
}

function sumRemoteTraffic(remoteTraffic = []) {
  return remoteTraffic.reduce(
    (total, item) => ({
      tx: total.tx + Number(item?.tx || 0),
      rx: total.rx + Number(item?.rx || 0)
    }),
    { tx: 0, rx: 0 }
  );
}

function normalizeAddressHost(host) {
  const value = String(host || "").trim();
  if (value.startsWith("[") && value.includes("]")) {
    return value.slice(1, value.indexOf("]"));
  }
  return value;
}

function formatEndpointHost(host) {
  const clean = normalizeAddressHost(host);
  return isIP(clean) === 6 ? `[${clean}]` : clean;
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function discoveryEndpoint(server, discovered, listenPort) {
  const explicit = cleanText(discovered.endpoint);
  if (explicit) return explicit;
  const host = cleanText(discovered.connectHost) || cleanText(discovered.domain) || server.host;
  return `${formatEndpointHost(host)}:${listenPort || 443}`;
}

function discoveredUsernames(users = []) {
  const names = new Set();
  for (const item of Array.isArray(users) ? users : []) {
    const username = typeof item === "string" ? item : item?.username;
    const clean = cleanText(username);
    if (clean) names.add(clean);
  }
  return Array.from(names);
}

function discoveredRemoteKey(discovered, listenPort) {
  const explicit = cleanText(discovered.remoteKey);
  if (explicit) return explicit;
  return `${discovered.protocol}:${cleanText(discovered.configPath) || "managed"}:${listenPort || ""}`;
}

function findExistingDiscoveredNode(nodes, serverId, discovered, listenPort, remoteKey) {
  return nodes.find((node) => node.serverId === serverId && node.remoteKey === remoteKey)
    || nodes.find((node) =>
      node.serverId === serverId &&
      node.protocol === discovered.protocol &&
      Number(node.listenPort || node.port || 443) === Number(listenPort || 443)
    );
}

export function mergeDiscoveredNodes(state, server, discoveredNodes = [], { timestamp = new Date().toISOString(), jobId, audit = false } = {}) {
  state.nodes = state.nodes || [];
  state.users = state.users || [];

  const summary = { imported: 0, updated: 0, users: 0 };
  for (const discovered of Array.isArray(discoveredNodes) ? discoveredNodes : []) {
    if (!monitorProtocols[discovered?.protocol]) continue;
    const listenPort = optionalNumber(discovered.listenPort ?? discovered.port) || 443;
    const remoteKey = discoveredRemoteKey(discovered, listenPort);
    const existing = findExistingDiscoveredNode(state.nodes, server.id, discovered, listenPort, remoteKey);
    const provider = providers[discovered.protocol] || monitorProtocols[discovered.protocol];
    const isNew = !existing;
    const discoveredName = cleanText(discovered.name) || provider?.name || discovered.protocol;
    const active = cleanText(discovered.active);
    const managedBy = cleanText(discovered.managedBy)
      || (cleanText(discovered.managedEnvPath) ? "simpleui" : cleanText(existing?.managedBy));
    const monitorOnly = Boolean(discovered.monitorOnly || existing?.monitorOnly || managedBy !== "simpleui" || !isDeployableProtocol(discovered.protocol));
    const tlsMode = cleanText(discovered.tlsMode)
      || existing?.tlsMode
      || (discovered.protocol === "trojan" ? "acme-http" : "acme-http");
    const jumpPortStart = optionalNumber(discovered.jumpPortStart);
    const jumpPortEnd = optionalNumber(discovered.jumpPortEnd);
    const portHoppingEnabled = Boolean(discovered.portHoppingEnabled || (jumpPortStart && jumpPortEnd));
    const nextNode = stamp(sanitizeNodeSecrets({
      ...(existing || {}),
      protocol: discovered.protocol,
      serverId: server.id,
      name: existing?.name || `${discoveredName} ${server.name}`,
      group: existing?.group || "",
      remoteKey,
      importSource: cleanText(discovered.importSource) || existing?.importSource || "remote-discovery",
      managedBy,
      monitorOnly,
      remoteDiscoveredAt: timestamp,
      service: cleanText(discovered.service) || existing?.service,
      serviceProtocol: cleanText(discovered.serviceProtocol) || existing?.serviceProtocol || monitorProtocols[discovered.protocol]?.serviceProtocol || "tcp",
      configPath: cleanText(discovered.configPath) || existing?.configPath,
      domain: cleanText(discovered.domain) || existing?.domain || "",
      endpoint: discoveryEndpoint(server, discovered, listenPort),
      listenPort,
      tlsMode,
      selfSignedHost: cleanText(discovered.selfSignedHost) || existing?.selfSignedHost || "",
      certPath: cleanText(discovered.certPath) || existing?.certPath || "",
      keyPath: cleanText(discovered.keyPath) || existing?.keyPath || "",
      masqueradeUrl: existing?.masqueradeUrl || "https://www.bing.com/",
      portHoppingEnabled,
      jumpPortStart: jumpPortStart || existing?.jumpPortStart,
      jumpPortEnd: jumpPortEnd || existing?.jumpPortEnd,
      jumpPortInterface: cleanText(discovered.jumpPortInterface) || existing?.jumpPortInterface || "",
      jumpPortIpv6Enabled: Boolean(discovered.jumpPortIpv6Enabled || existing?.jumpPortIpv6Enabled),
      jumpPortIpv6Interface: cleanText(discovered.jumpPortIpv6Interface) || existing?.jumpPortIpv6Interface || "",
      status: active === "active" ? "online" : "warning",
      lastSyncError: "",
      lastCheckedAt: timestamp,
      capability: provider?.capabilities || []
    }), isNew);

    if (existing) {
      Object.assign(existing, nextNode);
      summary.updated += 1;
    } else {
      state.nodes.push(nextNode);
      summary.imported += 1;
    }

    for (const username of discoveredUsernames(discovered.users)) {
      const existingUser = state.users.find((user) => user.username === username);
      if (existingUser) {
        const nodeIds = new Set(existingUser.nodeIds || []);
        const beforeSize = nodeIds.size;
        nodeIds.add(nextNode.id);
        existingUser.nodeIds = Array.from(nodeIds);
        existingUser.status = "active";
        existingUser.updatedAt = timestamp;
        if (nodeIds.size !== beforeSize) summary.users += 1;
      } else {
        state.users.push(stamp({
          username,
          nodeIds: [nextNode.id],
          status: "active",
          tx: 0,
          rx: 0,
          lastSeenAt: null
        }, true));
        summary.users += 1;
      }
    }
  }

  if (audit && (summary.imported || summary.updated)) {
    appendAudit(
      state,
      "node.discovery",
      `${server.name} remote nodes discovered: ${summary.imported} imported, ${summary.updated} refreshed`,
      { serverId: server.id, jobId }
    );
  }
  return summary;
}

function blacklistNodeKey(serverId, nodeId, target) {
  return `${serverId}:${nodeId}:${String(target || "").trim().toLowerCase()}`;
}

function findNodeForBlacklist(state, serverId, record = {}) {
  const remoteKey = cleanText(record.remoteKey);
  if (remoteKey) {
    const matched = (state.nodes || []).find((node) => node.serverId === serverId && node.remoteKey === remoteKey);
    if (matched) return matched;
  }

  const listenPort = optionalNumber(record.listenPort ?? record.port);
  return (state.nodes || []).find((node) =>
    node.serverId === serverId &&
    (!record.protocol || node.protocol === record.protocol) &&
    (!listenPort || Number(node.listenPort || node.port || 443) === listenPort) &&
    (!record.configPath || cleanText(node.configPath) === cleanText(record.configPath))
  );
}

function isActiveBlacklistEntry(entry = {}) {
  return entry.status !== "removed" && entry.status !== "inactive";
}

function upsertBlacklistRecord(state, {
  server,
  node,
  target,
  ipFamily,
  remoteKey,
  source = "remote-sync",
  createdAt,
  timestamp = new Date().toISOString()
}) {
  if (!server?.id || !node?.id || !target) return null;
  state.bans = state.bans || [];
  const existing = state.bans.find((entry) =>
    entry.serverId === server.id &&
    entry.nodeId === node.id &&
    String(entry.target || "").trim().toLowerCase() === String(target).trim().toLowerCase()
  );
  const next = {
    targetKind: "source-ip",
    target,
    ipFamily: Number(ipFamily || 0) || undefined,
    serverId: server.id,
    nodeId: node.id,
    remoteKey: cleanText(remoteKey) || node.remoteKey || "",
    status: "active",
    source,
    remoteCreatedAt: createdAt || existing?.remoteCreatedAt || timestamp,
    lastSeenAt: timestamp,
    updatedAt: timestamp
  };
  if (existing) {
    Object.assign(existing, next);
    return existing;
  }
  const created = stamp({
    ...next,
    createdAt: createdAt || timestamp
  }, true);
  created.updatedAt = timestamp;
  state.bans.push(created);
  return created;
}

function markBlacklistRemoved(state, { server, node, target, timestamp = new Date().toISOString() }) {
  if (!server?.id || !node?.id || !target) return false;
  state.bans = state.bans || [];
  let changed = false;
  for (const entry of state.bans) {
    if (
      entry.serverId === server.id &&
      entry.nodeId === node.id &&
      String(entry.target || "").trim().toLowerCase() === String(target).trim().toLowerCase() &&
      isActiveBlacklistEntry(entry)
    ) {
      entry.status = "removed";
      entry.removedAt = timestamp;
      entry.updatedAt = timestamp;
      changed = true;
    }
  }
  return changed;
}

export function syncBlacklistRecords(state, server, records = [], { timestamp = new Date().toISOString(), audit = false, jobId } = {}) {
  if (!Array.isArray(records)) return { active: 0, removed: 0 };
  const seen = new Set();
  const serverNodeIds = new Set((state.nodes || []).filter((node) => node.serverId === server.id).map((node) => node.id));
  let active = 0;
  let removed = 0;

  for (const record of records) {
    const target = cleanText(record?.target);
    if (!target) continue;
    const node = findNodeForBlacklist(state, server.id, record);
    if (!node) continue;
    seen.add(blacklistNodeKey(server.id, node.id, target));
    upsertBlacklistRecord(state, {
      server,
      node,
      target,
      ipFamily: record.ipFamily,
      remoteKey: record.remoteKey,
      source: cleanText(record.source) || "remote-sync",
      createdAt: record.createdAt,
      timestamp
    });
    active += 1;
  }

  for (const entry of state.bans || []) {
    if (!isActiveBlacklistEntry(entry)) continue;
    const belongsToServer = entry.serverId === server.id || (entry.nodeId && serverNodeIds.has(entry.nodeId));
    if (!belongsToServer || !entry.nodeId || !entry.target) continue;
    if (seen.has(blacklistNodeKey(server.id, entry.nodeId, entry.target))) continue;
    entry.status = "removed";
    entry.removedAt = timestamp;
    entry.updatedAt = timestamp;
    removed += 1;
  }

  if (audit && (active || removed)) {
    appendAudit(
      state,
      "blacklist.sync",
      `${server.name} blacklist synced: ${active} active, ${removed} removed`,
      { serverId: server.id, jobId }
    );
  }
  return { active, removed };
}

export async function applyStatusResult({ server, node, status, jobId, audit = true }) {
  if (!status) return;
  const timestamp = new Date().toISOString();
  await mutateDb((state) => {
    const savedServer = state.servers.find((item) => item.id === server.id);
    if (savedServer) {
      savedServer.status = status.active === "active" ? "online" : "warning";
      savedServer.updatedAt = timestamp;
    }

    const savedNode = state.nodes.find((item) => item.id === node.id);
    if (savedNode) {
      const remoteTrafficTotal = Array.isArray(status.remoteTraffic) && status.remoteTraffic.length ? sumRemoteTraffic(status.remoteTraffic) : null;
      const uniqueRemoteIps = new Set((status.connections || []).map((item) => item.sourceIp).filter(Boolean));
      savedNode.status = status.active === "active" ? "online" : "warning";
      savedNode.traffic = remoteTrafficTotal || (status.traffic && Object.keys(status.traffic).length ? sumTraffic(status.traffic) : savedNode.traffic);
      savedNode.onlineUsers = status.online && Object.keys(status.online).length
        ? onlineCount(status.online)
        : (uniqueRemoteIps.size || (status.remoteTraffic || []).length || savedNode.onlineUsers);
      savedNode.lastSyncError = "";
      savedNode.lastCheckedAt = timestamp;
      savedNode.updatedAt = timestamp;
    }

    state.connections = (state.connections || []).filter((item) => item.nodeId !== node.id);
    for (const connection of status.connections || []) {
      state.connections.push(stamp({
        nodeId: node.id,
        serverId: server.id,
        protocol: connection.protocol || node.protocol,
        protocols: connection.protocols || (connection.protocol ? [connection.protocol] : [node.protocol]),
        sourceIp: connection.sourceIp,
        ipFamily: connection.ipFamily,
        remote: connection.remote,
        local: connection.local,
        state: connection.state,
        rx: Number(connection.rx || 0),
        tx: Number(connection.tx || 0),
        total: Number(connection.total || Number(connection.rx || 0) + Number(connection.tx || 0)),
        connections: Number(connection.connections || 1),
        lastSeenAt: timestamp
      }, true));
    }

    state.remoteTraffic = (state.remoteTraffic || []).filter((item) => item.nodeId !== node.id);
    for (const item of status.remoteTraffic || []) {
      const clientIp = item.clientIp || item.remoteIp;
      const rx = Number(item.rx || 0);
      const tx = Number(item.tx || 0);
      state.remoteTraffic.push(stamp({
        nodeId: node.id,
        serverId: server.id,
        remoteIp: clientIp,
        clientIp,
        ipFamily: item.ipFamily,
        rx,
        tx,
        total: Number(item.total || rx + tx),
        connections: Number(item.connections || 0),
        protocols: item.protocols || [],
        lastSeenAt: timestamp
      }, true));
    }

    for (const [username, traffic] of Object.entries(status.traffic || {})) {
      const existing = state.users.find((item) => item.username === username);
      if (!existing) continue;
      existing.tx = Number(traffic.tx || 0);
      existing.rx = Number(traffic.rx || 0);
      existing.lastSeenAt = timestamp;
      existing.updatedAt = timestamp;
      if (!existing.nodeIds?.includes(node.id)) {
        existing.nodeIds = [...(existing.nodeIds || []), node.id];
      }
    }

    if (audit) appendAudit(state, "status.refresh", `${node.name} status refreshed`, { jobId });
  });
}

function networkRates(previousMetrics, nextNetwork, timestamp) {
  const previousNetwork = previousMetrics?.network;
  const previousUpdatedAt = previousMetrics?.updatedAt;
  if (!previousNetwork || !previousUpdatedAt || !nextNetwork) {
    return { rxRate: 0, txRate: 0, sampleSeconds: 0 };
  }
  const seconds = Math.max(0, (new Date(timestamp).getTime() - new Date(previousUpdatedAt).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { rxRate: 0, txRate: 0, sampleSeconds: 0 };
  }
  const rxDelta = Number(nextNetwork.rx || 0) - Number(previousNetwork.rx || 0);
  const txDelta = Number(nextNetwork.tx || 0) - Number(previousNetwork.tx || 0);
  return {
    rxRate: rxDelta >= 0 ? Math.round(rxDelta / seconds) : 0,
    txRate: txDelta >= 0 ? Math.round(txDelta / seconds) : 0,
    sampleSeconds: Math.round(seconds)
  };
}

export async function applyServerStatusResult({ server, status, audit = false }) {
  if (!status) return { imported: 0, updated: 0, users: 0 };
  const timestamp = new Date().toISOString();
  return mutateDb((state) => {
    const savedServer = state.servers.find((item) => item.id === server.id);
    if (!savedServer) return { imported: 0, updated: 0, users: 0 };
    const rates = networkRates(savedServer.metrics, status.network, timestamp);
    savedServer.status = "online";
    savedServer.hookStatus = "online";
    savedServer.metrics = {
      ...status,
      network: {
        ...(status.network || {}),
        ...rates
      },
      updatedAt: timestamp,
      lastSyncError: ""
    };
    savedServer.updatedAt = timestamp;
    if (audit) appendAudit(state, "server.status.refresh", `${server.name} server status refreshed`, { serverId: server.id });
    const discovery = mergeDiscoveredNodes(state, savedServer, status.discoveredNodes || [], { timestamp, audit });
    const blacklists = Array.isArray(status.blacklists)
      ? syncBlacklistRecords(state, savedServer, status.blacklists, { timestamp, audit })
      : { active: 0, removed: 0 };
    return { ...discovery, blacklists };
  });
}

async function markServerSyncFailed(server, error, { keepOnline = false } = {}) {
  const timestamp = new Date().toISOString();
  await mutateDb((state) => {
    const savedServer = state.servers.find((item) => item.id === server.id);
    if (!savedServer) return;
    savedServer.status = keepOnline ? "online" : "warning";
    savedServer.hookStatus = keepOnline
      ? "online"
      : (savedServer.hookStatus === "deleting" ? savedServer.hookStatus : "unreachable");
    savedServer.metrics = {
      ...(savedServer.metrics || {}),
      lastSyncError: error.message,
      updatedAt: timestamp
    };
    savedServer.updatedAt = timestamp;
  });
}

async function markNodeSyncFailed(node, error) {
  const timestamp = new Date().toISOString();
  await mutateDb((state) => {
    const savedNode = state.nodes.find((item) => item.id === node.id);
    if (!savedNode) return;
    savedNode.status = savedNode.status === "deleting" ? savedNode.status : "warning";
    savedNode.lastSyncError = error.message;
    savedNode.updatedAt = timestamp;
  });
}

export async function syncServerAndNodes({ server, nodes = [] }) {
  const errors = [];
  try {
    const result = await callHookAgent({
      server,
      action: "server-status",
      env: serverEnv({ action: "server-status" }),
      timeoutMs: 30_000
    });
    const parsed = parseMarker(result.output || "", "__SIMPLEUI_SERVER_STATUS__");
    await applyServerStatusResult({ server, status: parsed });
  } catch (error) {
    errors.push(error);
    const unsupportedServerStatus = /unsupported action|server-status/i.test(error.message || "");
    await markServerSyncFailed(server, error, { keepOnline: unsupportedServerStatus });
    if (!unsupportedServerStatus) {
      return { ok: false, errors: errors.map((item) => item.message) };
    }
  }

  for (const node of nodes) {
    try {
      const result = await callHookAgent({
        server,
        action: "status",
        env: nodeEnv({ node, users: [], action: "status" }),
        timeoutMs: 60_000
      });
      const parsed =
        parseMarker(result.output || "", "__SIMPLEUI_STATUS__") ||
        parseMarker(result.output || "", "__SIMPLEUI_RESULT__");
      await applyStatusResult({ server, node, status: parsed, audit: false });
    } catch (error) {
      errors.push(error);
      await markNodeSyncFailed(node, error);
    }
  }

  return { ok: !errors.length, errors: errors.map((item) => item.message) };
}

export function removeServerState(state, serverId) {
  const removedNodeIds = new Set(
    (state.nodes || [])
      .filter((node) => node.serverId === serverId)
      .map((node) => node.id)
  );
  state.servers = (state.servers || []).filter((item) => item.id !== serverId);
  state.nodes = (state.nodes || []).filter((item) => item.serverId !== serverId);
  state.connections = (state.connections || []).filter((item) => !removedNodeIds.has(item.nodeId));
  state.remoteTraffic = (state.remoteTraffic || []).filter((item) => !removedNodeIds.has(item.nodeId));
  state.users = (state.users || [])
    .map((user) => ({
      ...user,
      nodeIds: (user.nodeIds || []).filter((nodeId) => !removedNodeIds.has(nodeId)),
      updatedAt: new Date().toISOString()
    }))
    .filter((user) => (user.nodeIds || []).length);
  state.bans = (state.bans || [])
    .filter((ban) => ban.serverId !== serverId && (!ban.nodeId || !removedNodeIds.has(ban.nodeId)))
    .map((ban) => ({
      ...ban,
      nodeIds: (ban.nodeIds || []).filter((nodeId) => !removedNodeIds.has(nodeId)),
      updatedAt: new Date().toISOString()
    }))
    .filter((ban) => !ban.nodeIds || ban.nodeIds.length);
}

export function removeNodeState(state, nodeId) {
  state.nodes = (state.nodes || []).filter((item) => item.id !== nodeId);
  state.connections = (state.connections || []).filter((item) => item.nodeId !== nodeId);
  state.remoteTraffic = (state.remoteTraffic || []).filter((item) => item.nodeId !== nodeId);
  state.users = (state.users || [])
    .map((user) => ({
      ...user,
      nodeIds: (user.nodeIds || []).filter((id) => id !== nodeId),
      updatedAt: new Date().toISOString()
    }))
    .filter((user) => (user.nodeIds || []).length);
  state.bans = (state.bans || [])
    .filter((ban) => ban.nodeId !== nodeId)
    .map((ban) => ({
      ...ban,
      nodeIds: (ban.nodeIds || []).filter((id) => id !== nodeId),
      updatedAt: new Date().toISOString()
    }))
    .filter((ban) => !ban.nodeIds || ban.nodeIds.length);
}

export async function createJob({ type, title, payload }) {
  const job = {
    id: uuid(),
    type,
    title,
    status: "queued",
    payload: {
      protocol: payload?.node?.protocol,
      serverId: payload?.server?.id || payload?.serverId,
      nodeId: payload?.node?.id || payload?.nodeId
    },
    logs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await mutateDb((state) => {
    state.jobs = state.jobs || [];
    state.jobs.push(job);
    appendAudit(state, `job.${type}`, `${title} queued`, { jobId: job.id });
  });
  return job;
}

export function subscribeJob(jobId, res, initialJob) {
  const stream = getStream(jobId);
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const onLog = (line) => send("log", line);
  const onDone = (data) => send("done", data);
  stream.on("log", onLog);
  stream.on("done", onDone);
  res.on("close", () => {
    stream.off("log", onLog);
    stream.off("done", onDone);
  });
  send("open", { jobId });
  for (const line of initialJob?.logs || []) {
    send("log", line);
  }
  if (["success", "failed"].includes(initialJob?.status)) {
    send("done", {
      status: initialJob.status,
      result: initialJob.result,
      error: initialJob.error
    });
  }
}

export async function runInstallHookJob(job, { server, credential, hookPort, token }) {
  const secrets = [credential?.password, credential?.privateKey, credential?.passphrase, token];
  await patchJob(job.id, { status: "running" });
  await logJob(job.id, `Installing persistent hook agent on ${server.name}\n`, secrets);

  try {
    const remote = await installHookAgent({
      server,
      credential,
      hookPort,
      token,
      onLog: (line) => logJob(job.id, line, secrets)
    });
    const result = parseMarker(remote.output, "__SIMPLEUI_RESULT__") || {};
    const hookUrl = `http://${formatEndpointHost(server.host)}:${Number(result.port || hookPort)}`;
    const nextServer = {
      ...server,
      hookUrl,
      hookPort: Number(result.port || hookPort),
      hookToken: token
    };
    const reachable = await checkHookHealth(nextServer);

    await mutateDb((state) => {
      const savedServer = state.servers.find((item) => item.id === server.id);
      if (savedServer) {
        Object.assign(savedServer, stamp({
          ...nextServer,
          status: reachable ? "online" : "warning",
          hookStatus: reachable ? "online" : "unreachable",
          hookInstalledAt: new Date().toISOString()
        }));
      }
      appendAudit(
        state,
        reachable ? "hook.install.complete" : "hook.install.unreachable",
        reachable ? `${server.name} hook installed` : `${server.name} hook installed but is not reachable from this panel`,
        { serverId: server.id, jobId: job.id }
      );
    });

    if (!reachable) {
      throw new Error(`Hook service installed, but ${hookUrl} is not reachable from this panel. Check firewall/security group for port ${hookPort}.`);
    }

    let discovery = { imported: 0, updated: 0, users: 0 };
    try {
      const statusResult = await callHookAgent({
        server: nextServer,
        action: "server-status",
        env: serverEnv({ action: "server-status" }),
        timeoutMs: 30_000
      });
      const parsedStatus = parseMarker(statusResult.output || "", "__SIMPLEUI_SERVER_STATUS__");
      discovery = await applyServerStatusResult({ server: nextServer, status: parsedStatus, audit: true });
      if (discovery.imported || discovery.updated) {
        await logJob(job.id, `Discovered remote nodes: ${discovery.imported} imported, ${discovery.updated} refreshed.\n`, secrets);
      } else {
        await logJob(job.id, "No existing SimpleUI-managed remote nodes discovered.\n", secrets);
      }
    } catch (error) {
      await logJob(job.id, `Hook is reachable, but remote node discovery failed: ${redact(error.message, secrets)}\n`, secrets);
    }

    const jobResult = { ...result, hookUrl, discovery };
    await patchJob(job.id, { status: "success", result: jobResult });
    await logJob(job.id, "Hook agent installed and reachable.\n", secrets);
    getStream(job.id).emit("done", { status: "success", result: jobResult });
  } catch (error) {
    const safeError = redact(error.message, secrets);
    await mutateDb((state) => {
      const savedServer = state.servers.find((item) => item.id === server.id);
      if (savedServer) {
        savedServer.status = "failed";
        savedServer.hookStatus = "failed";
        savedServer.updatedAt = new Date().toISOString();
      }
      appendAudit(state, "hook.install.failed", `${server.name} hook install failed`, { serverId: server.id, jobId: job.id });
    });
    await patchJob(job.id, { status: "failed", error: safeError });
    await logJob(job.id, `Hook install failed: ${safeError}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: safeError });
  }
}

export async function runHookUpgradeJob(job, { server }) {
  const secrets = [server?.hookToken];
  await patchJob(job.id, { status: "running" });
  await logJob(job.id, `Upgrading persistent hook agent on ${server.name}\n`, secrets);

  try {
    const bundle = await buildHookUpgradeBundleB64();
    let result;
    try {
      result = await callHookAgent({
        server,
        action: "upgrade-agent",
        env: serverEnv({ action: "upgrade-agent" }),
        payload: { bundleB64: bundle },
        timeoutMs: 120_000
      });
      const directParsed = parseMarker(result.output || "", "__SIMPLEUI_RESULT__");
      if (directParsed?.ok === false) {
        throw new Error(directParsed.error || "Hook agent rejected upgrade bundle");
      }
    } catch (error) {
      if (!shouldFallbackHookUpgrade(error)) throw error;
      await logJob(job.id, `Direct hook upgrade transport failed: ${redact(error.message, secrets)}\n`, secrets);
      result = await upgradeHookViaChunkedExec({ server, bundle, jobId: job.id, secrets });
    }
    await logJob(job.id, stripMarker(result.output || "", ["__SIMPLEUI_RESULT__"]), secrets);
    const parsed = parseMarker(result.output || "", "__SIMPLEUI_RESULT__") || { ok: true };
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const reachable = await checkHookHealth(server, 10_000);
    await mutateDb((state) => {
      const savedServer = state.servers.find((item) => item.id === server.id);
      if (savedServer) {
        savedServer.status = reachable ? "online" : "warning";
        savedServer.hookStatus = reachable ? "online" : "unreachable";
        savedServer.updatedAt = new Date().toISOString();
      }
      appendAudit(
        state,
        reachable ? "hook.upgrade.complete" : "hook.upgrade.unreachable",
        reachable ? `${server.name} hook upgraded` : `${server.name} hook upgrade completed but health check failed`,
        { serverId: server.id, jobId: job.id }
      );
    });
    const jobResult = { ...parsed, reachable };
    await patchJob(job.id, { status: reachable ? "success" : "failed", result: jobResult, error: reachable ? "" : "Hook upgraded but health check failed" });
    await logJob(job.id, reachable ? "Hook agent upgraded and reachable.\n" : "Hook upgraded, but health check failed after restart.\n", secrets);
    getStream(job.id).emit("done", reachable
      ? { status: "success", result: jobResult }
      : { status: "failed", result: jobResult, error: "Hook upgraded but health check failed" });
  } catch (error) {
    const safeError = redact(error.message, secrets);
    await mutateDb((state) => {
      appendAudit(state, "hook.upgrade.failed", `${server.name} hook upgrade failed`, { serverId: server.id, jobId: job.id });
    });
    await patchJob(job.id, { status: "failed", error: safeError });
    await logJob(job.id, `Hook upgrade failed: ${safeError}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: safeError });
  }
}

export async function runDeployJob(job, { server, node, users }) {
  const secrets = [(users || []).map((user) => user.password), collectNodeSecrets(node), server?.hookToken].flat();
  await patchJob(job.id, { status: "running" });
  await logJob(job.id, `Starting ${node.protocol} deployment for ${server.name}\n`, secrets);

  try {
    const provider = providers[node.protocol];
    if (!provider) throw new Error(`Unsupported provider: ${node.protocol}`);
    const remote = await callHookAgent({
      server,
      action: "deploy",
      env: nodeEnv({ node, users, action: "deploy" }),
      timeoutMs: 30 * 60_000
    });
    await logJob(job.id, remote.output || "", secrets);
    const result = parseMarker(remote.output, "__SIMPLEUI_RESULT__");
    if (result?.port) node.listenPort = Number(result.port);
    if (result?.jumpPortStart) node.jumpPortStart = Number(result.jumpPortStart);
    if (result?.jumpPortEnd) node.jumpPortEnd = Number(result.jumpPortEnd);
    const endpointHost = result?.connectHost || result?.domain || node.domain || server.host;
    const endpoint = `${formatEndpointHost(endpointHost)}:${node.listenPort || 443}`;

    await mutateDb((state) => {
      const savedServer = state.servers.find((item) => item.id === server.id);
      if (savedServer) Object.assign(savedServer, stamp({ ...server, status: "online" }));
      else state.servers.push(stamp({ ...server, status: "online" }, true));

      const savedNode = state.nodes.find((item) => item.id === node.id);
      const nextNode = stamp(sanitizeNodeSecrets({
        ...(savedNode || {}),
        ...node,
        serverId: server.id,
        managedBy: "simpleui",
        monitorOnly: false,
        serviceProtocol: monitorProtocols[node.protocol]?.serviceProtocol || node.serviceProtocol || (node.protocol === "trojan" ? "tcp" : "udp"),
        status: "online",
        endpoint,
        capability: providers[node.protocol]?.capabilities || []
      }), !savedNode);
      if (savedNode) Object.assign(savedNode, nextNode);
      else state.nodes.push(nextNode);

      for (const user of users || []) {
        const existing = state.users.find((item) => item.username === user.username);
        if (existing) {
          existing.nodeIds = Array.from(new Set([...(existing.nodeIds || []), node.id]));
          existing.status = "active";
          existing.updatedAt = new Date().toISOString();
        } else {
          state.users.push(stamp({
            username: user.username,
            nodeIds: [node.id],
            status: "active",
            tx: 0,
            rx: 0,
            lastSeenAt: null
          }, true));
        }
      }
      appendAudit(
        state,
        job.type === "node-update" ? "node.update.complete" : "deploy.complete",
        job.type === "node-update" ? `${node.name} updated on ${server.name}` : `${node.name} deployed on ${server.name}`,
        { jobId: job.id }
      );
    });
    const deploymentResult = {
      ok: true,
      nodeId: node.id,
      nodeName: node.name,
      protocol: node.protocol,
      serverName: server.name,
      endpoint,
      port: node.listenPort || 443,
      userCount: users?.length || 0
    };
    await patchJob(job.id, { status: "success", result: deploymentResult });
    await logJob(job.id, job.type === "node-update" ? "Node update completed.\n" : "Deployment completed.\n", secrets);
    getStream(job.id).emit("done", { status: "success", result: deploymentResult });
  } catch (error) {
    const safeError = redact(error.message, secrets);
    await patchJob(job.id, { status: "failed", error: safeError });
    await logJob(job.id, `Deployment failed: ${safeError}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: safeError });
  }
}

export async function runDeleteServerJob(job, { server }) {
  const secrets = [server?.hookToken];
  await patchJob(job.id, { status: "running" });
  await logJob(job.id, `Deleting ${server.name}: cleaning remote nodes and uninstalling hook agent\n`, secrets);

  try {
    if (server.hookUrl && server.hookToken) {
      const result = await callHookAgent({
        server,
        action: "uninstall",
        env: {},
        timeoutMs: 180_000
      });
      await logJob(job.id, result.output || "", secrets);
    } else {
      await logJob(job.id, "No hook agent is registered for this server; removing local state only.\n", secrets);
    }

    await mutateDb((state) => {
      removeServerState(state, server.id);
      appendAudit(state, "server.delete.complete", `${server.name} deleted and remote cleanup requested`, {
        serverId: server.id,
        jobId: job.id
      });
    });
    await patchJob(job.id, { status: "success", result: { ok: true } });
    await logJob(job.id, "Server deleted after remote cleanup.\n", secrets);
    getStream(job.id).emit("done", { status: "success", result: { ok: true } });
  } catch (error) {
    const safeError = redact(error.message, secrets);
    await mutateDb((state) => {
      const savedServer = state.servers.find((item) => item.id === server.id);
      if (savedServer) {
        savedServer.status = "failed";
        savedServer.hookStatus = "cleanup-failed";
        savedServer.updatedAt = new Date().toISOString();
      }
      appendAudit(state, "server.delete.failed", `${server.name} remote cleanup failed`, {
        serverId: server.id,
        jobId: job.id
      });
    });
    await patchJob(job.id, { status: "failed", error: safeError });
    await logJob(job.id, `Delete failed: ${safeError}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: safeError });
  }
}

export async function runDeleteNodeJob(job, { server, node }) {
  const secrets = [server?.hookToken];
  await patchJob(job.id, { status: "running" });
  await logJob(job.id, `Deleting ${node.name}: uninstalling remote ${node.protocol} node and keeping hook agent\n`, secrets);

  try {
    const result = await callHookAgent({
      server,
      action: "node-delete",
      env: nodeEnv({
        node,
        users: [],
        action: "node-delete",
        extra: { SIMPLEUI_UNINSTALL_SCOPE: "node" }
      }),
      timeoutMs: 180_000
    });
    await logJob(job.id, result.output || "", secrets);
    const parsed = parseMarker(result.output, "__SIMPLEUI_RESULT__") || { ok: true };

    await mutateDb((state) => {
      removeNodeState(state, node.id);
      const savedServer = state.servers.find((item) => item.id === server.id);
      if (savedServer) {
        savedServer.status = "online";
        savedServer.hookStatus = "online";
        savedServer.updatedAt = new Date().toISOString();
      }
      appendAudit(state, "node.delete.complete", `${node.name} deleted from ${server.name}`, {
        serverId: server.id,
        nodeId: node.id,
        jobId: job.id
      });
    });
    await patchJob(job.id, { status: "success", result: parsed });
    await logJob(job.id, "Node uninstalled and local state removed.\n", secrets);
    getStream(job.id).emit("done", { status: "success", result: parsed });
  } catch (error) {
    const safeError = redact(error.message, secrets);
    await mutateDb((state) => {
      const savedNode = state.nodes.find((item) => item.id === node.id);
      if (savedNode) {
        savedNode.status = "cleanup-failed";
        savedNode.updatedAt = new Date().toISOString();
      }
      appendAudit(state, "node.delete.failed", `${node.name} remote cleanup failed`, {
        serverId: server.id,
        nodeId: node.id,
        jobId: job.id
      });
    });
    await patchJob(job.id, { status: "failed", error: safeError });
    await logJob(job.id, `Node delete failed: ${safeError}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: safeError });
  }
}

export async function runRemoteAction({ type, title, server, node, extra = {}, remoteAction = type }) {
  const job = await createJob({ type, title, payload: { server, node } });
  const secrets = [extra?.target, extra?.SIMPLEUI_BAN_IP, server?.hookToken];
  queueMicrotask(async () => {
    await patchJob(job.id, { status: "running" });
    try {
      const result = await callHookAgent({
        server,
        action: remoteAction,
        env: nodeEnv({ node, users: [], action: type, extra }),
        timeoutMs: 120_000
      });
      await logJob(job.id, result.output || "", secrets);
      const parsed =
        parseMarker(result.output, "__SIMPLEUI_STATUS__") ||
        parseMarker(result.output, "__SIMPLEUI_RESULT__") ||
        result.output;
      if (type === "status") {
        await applyStatusResult({ server, node, status: parsed, jobId: job.id });
      } else if (type === "ban" && parsed && typeof parsed === "object") {
        await mutateDb((state) => {
          upsertBlacklistRecord(state, {
            server,
            node,
            target: parsed.target || extra.SIMPLEUI_BAN_IP,
            ipFamily: parsed.ipFamily,
            remoteKey: parsed.remoteKey || node.remoteKey,
            source: "remote-job",
            createdAt: parsed.createdAt,
            timestamp: new Date().toISOString()
          });
          appendAudit(state, "ban.create", `Block source IP ${parsed.target || extra.SIMPLEUI_BAN_IP} on ${node.name}`, {
            serverId: server.id,
            nodeId: node.id,
            jobId: job.id
          });
        });
      } else if (type === "unban" && parsed && typeof parsed === "object") {
        await mutateDb((state) => {
          markBlacklistRemoved(state, {
            server,
            node,
            target: parsed.target || extra.SIMPLEUI_BAN_IP,
            timestamp: new Date().toISOString()
          });
          appendAudit(state, "ban.remove", `Unblock source IP ${parsed.target || extra.SIMPLEUI_BAN_IP} on ${node.name}`, {
            serverId: server.id,
            nodeId: node.id,
            jobId: job.id
          });
        });
      }
      await patchJob(job.id, { status: "success", result: parsed });
      getStream(job.id).emit("done", { status: "success", result: parsed });
    } catch (error) {
      const safeError = redact(error.message, secrets);
      await patchJob(job.id, { status: "failed", error: safeError });
      await logJob(job.id, `${type} failed: ${safeError}\n`, secrets);
      getStream(job.id).emit("done", { status: "failed", error: safeError });
    }
  });
  return job;
}

export async function runServerAction({ type, title, server, extra = {}, secrets = [], timeoutMs = 180_000 }) {
  const job = await createJob({ type, title, payload: { server } });
  const secretValues = [server?.hookToken, ...secrets].flat();
  queueMicrotask(async () => {
    await patchJob(job.id, { status: "running" });
    if (type === "server-reboot") {
      await mutateDb((state) => {
        const savedServer = state.servers.find((item) => item.id === server.id);
        if (savedServer) {
          savedServer.status = "rebooting";
          savedServer.hookStatus = "rebooting";
          savedServer.updatedAt = new Date().toISOString();
        }
        appendAudit(state, "server-reboot.start", `${title} requested`, { serverId: server.id, jobId: job.id });
      });
    }
    try {
      const result = await callHookAgent({
        server,
        action: type,
        env: serverEnv({ action: type, extra }),
        timeoutMs
      });
      const parsed =
        parseMarker(result.output, "__SIMPLEUI_OPTIMIZE__") ||
        parseMarker(result.output, "__SIMPLEUI_IPQUALITY__") ||
        parseMarker(result.output, "__SIMPLEUI_RESULT__") ||
        result.output;
      const visibleOutput = type === "ipquality"
        ? stripMarker(result.output || "", ["__SIMPLEUI_IPQUALITY__"])
        : (type === "exec"
          ? stripMarker(result.output || "", ["__SIMPLEUI_RESULT__"])
          : (result.output || ""));
      await logJob(job.id, visibleOutput, secretValues);
      await mutateDb((state) => {
        const savedServer = state.servers.find((item) => item.id === server.id);
        if (savedServer) {
          savedServer.status = type === "server-reboot" ? "rebooting" : "online";
          savedServer.hookStatus = type === "server-reboot" ? "rebooting" : "online";
          savedServer.updatedAt = new Date().toISOString();
        }
        appendAudit(state, `${type}.complete`, `${title} completed`, { serverId: server.id, jobId: job.id });
      });
      await patchJob(job.id, { status: "success", result: parsed });
      getStream(job.id).emit("done", { status: "success", result: parsed });
    } catch (error) {
      const safeError = redact(error.message, secretValues);
      await mutateDb((state) => {
        const savedServer = state.servers.find((item) => item.id === server.id);
        if (savedServer) {
          savedServer.status = "warning";
          if (type === "server-reboot") {
            savedServer.hookStatus = "online";
          }
          savedServer.updatedAt = new Date().toISOString();
        }
        appendAudit(state, `${type}.failed`, `${title} failed`, { serverId: server.id, jobId: job.id });
      });
      await patchJob(job.id, { status: "failed", error: safeError });
      await logJob(job.id, `${type} failed: ${safeError}\n`, secretValues);
      getStream(job.id).emit("done", { status: "failed", error: safeError });
    }
  });
  return job;
}
