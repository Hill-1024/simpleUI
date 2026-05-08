import { EventEmitter } from "node:events";
import { isIP } from "node:net";
import { v4 as uuid } from "uuid";
import { appendAudit, mutateDb, stamp } from "./db.js";
import { callHookAgent, checkHookHealth, installHookAgent } from "./hook-agent.js";
import { providers } from "./providers.js";

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
    SIMPLEUI_PROTOCOL: node.protocol,
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
    .find((item) => item.startsWith(marker));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(marker.length));
  } catch {
    return null;
  }
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
      savedNode.lastCheckedAt = timestamp;
      savedNode.updatedAt = timestamp;
    }

    state.connections = (state.connections || []).filter((item) => item.nodeId !== node.id);
    for (const connection of status.connections || []) {
      state.connections.push(stamp({
        nodeId: node.id,
        serverId: server.id,
        protocol: connection.protocol || node.protocol,
        sourceIp: connection.sourceIp,
        ipFamily: connection.ipFamily,
        remote: connection.remote,
        local: connection.local,
        state: connection.state,
        lastSeenAt: timestamp
      }, true));
    }

    state.remoteTraffic = (state.remoteTraffic || []).filter((item) => item.nodeId !== node.id);
    for (const item of status.remoteTraffic || []) {
      const rx = Number(item.rx || 0);
      const tx = Number(item.tx || 0);
      state.remoteTraffic.push(stamp({
        nodeId: node.id,
        serverId: server.id,
        remoteIp: item.remoteIp,
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
  if (!status) return;
  const timestamp = new Date().toISOString();
  await mutateDb((state) => {
    const savedServer = state.servers.find((item) => item.id === server.id);
    if (!savedServer) return;
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
  const secrets = [credential?.password, token];
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

    await patchJob(job.id, { status: "success", result: { ...result, hookUrl } });
    await logJob(job.id, "Hook agent installed and reachable.\n", secrets);
    getStream(job.id).emit("done", { status: "success", result: { ...result, hookUrl } });
  } catch (error) {
    await mutateDb((state) => {
      const savedServer = state.servers.find((item) => item.id === server.id);
      if (savedServer) {
        savedServer.status = "failed";
        savedServer.hookStatus = "failed";
        savedServer.updatedAt = new Date().toISOString();
      }
      appendAudit(state, "hook.install.failed", `${server.name} hook install failed`, { serverId: server.id, jobId: job.id });
    });
    await patchJob(job.id, { status: "failed", error: error.message });
    await logJob(job.id, `Hook install failed: ${error.message}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: error.message });
  }
}

export async function runDeployJob(job, { server, node, users }) {
  const secrets = [(users || []).map((user) => user.password), server?.hookToken].flat();
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
      const nextNode = stamp({
        ...(savedNode || {}),
        ...node,
        serverId: server.id,
        status: "online",
        endpoint,
        capability: providers[node.protocol]?.capabilities || []
      }, !savedNode);
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
    await patchJob(job.id, { status: "failed", error: error.message });
    await logJob(job.id, `Deployment failed: ${error.message}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: error.message });
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
    await patchJob(job.id, { status: "failed", error: error.message });
    await logJob(job.id, `Delete failed: ${error.message}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: error.message });
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
    await patchJob(job.id, { status: "failed", error: error.message });
    await logJob(job.id, `Node delete failed: ${error.message}\n`, secrets);
    getStream(job.id).emit("done", { status: "failed", error: error.message });
  }
}

export async function runRemoteAction({ type, title, server, node, extra = {} }) {
  const job = await createJob({ type, title, payload: { server, node } });
  const secrets = [extra?.target, extra?.SIMPLEUI_BAN_IP, server?.hookToken];
  queueMicrotask(async () => {
    await patchJob(job.id, { status: "running" });
    try {
      const result = await callHookAgent({
        server,
        action: type,
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
      }
      await patchJob(job.id, { status: "success", result: parsed });
      getStream(job.id).emit("done", { status: "success", result: parsed });
    } catch (error) {
      await patchJob(job.id, { status: "failed", error: error.message });
      await logJob(job.id, `${type} failed: ${error.message}\n`, secrets);
      getStream(job.id).emit("done", { status: "failed", error: error.message });
    }
  });
  return job;
}

export async function runServerAction({ type, title, server, extra = {}, secrets = [], timeoutMs = 180_000 }) {
  const job = await createJob({ type, title, payload: { server } });
  const secretValues = [server?.hookToken, ...secrets].flat();
  queueMicrotask(async () => {
    await patchJob(job.id, { status: "running" });
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
        : (result.output || "");
      await logJob(job.id, visibleOutput, secretValues);
      await mutateDb((state) => {
        const savedServer = state.servers.find((item) => item.id === server.id);
        if (savedServer) {
          savedServer.status = "online";
          savedServer.hookStatus = "online";
          savedServer.updatedAt = new Date().toISOString();
        }
        appendAudit(state, `${type}.complete`, `${title} completed`, { serverId: server.id, jobId: job.id });
      });
      await patchJob(job.id, { status: "success", result: parsed });
      getStream(job.id).emit("done", { status: "success", result: parsed });
    } catch (error) {
      await mutateDb((state) => {
        const savedServer = state.servers.find((item) => item.id === server.id);
        if (savedServer) {
          savedServer.status = "warning";
          savedServer.updatedAt = new Date().toISOString();
        }
        appendAudit(state, `${type}.failed`, `${title} failed`, { serverId: server.id, jobId: job.id });
      });
      await patchJob(job.id, { status: "failed", error: error.message });
      await logJob(job.id, `${type} failed: ${error.message}\n`, secretValues);
      getStream(job.id).emit("done", { status: "failed", error: error.message });
    }
  });
  return job;
}
