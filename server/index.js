import path from "node:path";
import fs from "node:fs";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import {
  AUTH_COOKIE,
  authenticateRequest,
  changePassword,
  clearSessionCookie,
  ensureAuthInitialized,
  loginWithPassword,
  logoutSession,
  parseCookies,
  setSessionCookie
} from "./lib/auth.js";
import { appendAudit, loadDb, mutateDb, publicServer, publicState, stamp } from "./lib/db.js";
import { DEFAULT_HOOK_PORT, createHookToken } from "./lib/hook-agent.js";
import {
  createJob,
  removeNodeState,
  removeServerState,
  runDeleteNodeJob,
  runDeleteServerJob,
  runDeployJob,
  runInstallHookJob,
  runRemoteAction,
  runServerAction,
  syncServerAndNodes,
  subscribeJob
} from "./lib/jobs.js";
import { providerList } from "./lib/providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const clientDist = path.join(rootDir, "dist/client");

const app = express();
const port = Number(process.env.PORT || process.env.SIMPLEUI_PORT || 8787);
const host = process.env.SIMPLEUI_HOST || "127.0.0.1";
const isDesktop = process.env.SIMPLEUI_DESKTOP === "1";
const isProduction = process.env.NODE_ENV === "production" || isDesktop;
const authRequired = process.env.SIMPLEUI_AUTH_DISABLED !== "1" && process.env.NODE_ENV === "production" && !isDesktop;
const syncIntervalMs = Number(process.env.SIMPLEUI_SYNC_INTERVAL_MS || 15_000);
let syncInFlight = false;

if (authRequired) {
  const authInit = await ensureAuthInitialized();
  if (authInit.created) {
    console.log("SimpleUI initial WebUI password:");
    console.log(authInit.initialPassword);
    console.log("Use this UUID password to sign in, then change it from the WebUI.");
  }
}

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

const credentialSchema = z.object({
  username: z.string().min(1),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional()
});

const serverSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  sshUserHint: z.string().optional(),
  location: z.string().optional(),
  group: z.string().optional(),
  labels: z.array(z.string()).optional(),
  provider: z.string().optional()
});

const serverUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  hookPort: z.coerce.number().int().min(1).max(65535).optional(),
  location: z.string().optional(),
  group: z.string().optional(),
  labels: z.array(z.string()).optional(),
  provider: z.string().optional()
});

const userSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const optimizeActionSchema = z.enum([
  "status",
  "bbr-fq",
  "bbr-fq-pie",
  "bbr-cake",
  "bbrplus-fq",
  "ecn-on",
  "ecn-off",
  "adaptive-system",
  "anti-cc",
  "ipv6-off",
  "ipv6-on",
  "xanmod-main",
  "xanmod-lts",
  "xanmod-edge",
  "xanmod-rt",
  "official-stable-kernel",
  "official-latest-kernel",
  "show-kernels"
]);

const ipQualitySchema = z.object({
  serverId: z.string(),
  mode: z.enum(["dual", "ipv4", "ipv6"]).default("dual"),
  language: z.enum(["cn", "en", "jp", "es", "de", "fr", "ru", "pt"]).default("cn"),
  interface: z.string().optional().default(""),
  proxy: z.string().optional().default(""),
  fullIp: z.coerce.boolean().optional().default(false),
  privacy: z.coerce.boolean().optional().default(false)
});

const loginSchema = z.object({
  password: z.string().min(1)
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(256)
});

function normalizeHost(host) {
  const value = String(host || "").trim();
  if (value.startsWith("[") && value.includes("]")) {
    return value.slice(1, value.indexOf("]"));
  }
  return value;
}

function hostForUrl(host) {
  const clean = normalizeHost(host);
  return isIP(clean) === 6 ? `[${clean}]` : clean;
}

function normalizeIpTarget(value) {
  let raw = String(value || "").trim();
  if (raw.startsWith("[") && raw.includes("]")) {
    const host = raw.slice(1, raw.indexOf("]"));
    const suffix = raw.slice(raw.indexOf("]") + 1);
    raw = suffix.startsWith("/") ? `${host}${suffix}` : host;
  } else if (raw.includes(".") && raw.split(":").length === 2) {
    raw = raw.split(":")[0];
  }
  let [address, prefix] = raw.split("/");
  let family = isIP(address);
  if (!family) return null;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) {
    const mapped = address.slice(7);
    if (isIP(mapped) === 4) {
      address = mapped;
      family = 4;
      if (prefix !== undefined) {
        const mappedPrefix = Number(prefix);
        if (!Number.isInteger(mappedPrefix) || mappedPrefix < 96 || mappedPrefix > 128) return null;
        prefix = String(mappedPrefix - 96);
      }
    }
  }
  if (prefix !== undefined) {
    if (!/^\d+$/.test(prefix)) return null;
    const length = Number(prefix);
    if ((family === 4 && length > 32) || (family === 6 && length > 128)) return null;
    raw = `${address}/${length}`;
  } else {
    raw = address;
  }
  return { value: raw, family };
}

const nodeSchema = z.object({
  id: z.string().optional(),
  protocol: z.enum(["hysteria2", "trojan"]),
  name: z.string().min(1),
  group: z.string().optional(),
  domain: z.string().optional().default(""),
  listenPort: z.coerce.number().int().min(1).max(65535).default(443),
  masqueradeUrl: z.string().optional(),
  tlsMode: z.enum(["self-signed", "acme-http", "acme-dns", "acme-dns-cloudflare", "manual-cert"]).default("acme-http"),
  acmeEmail: z.string().optional(),
  dnsProvider: z.string().optional(),
  dnsToken: z.string().optional(),
  dnsOverrideDomain: z.string().optional(),
  dnsUser: z.string().optional(),
  dnsServer: z.string().optional(),
  selfSignedDomain: z.string().optional(),
  selfSignedIpMode: z.enum(["ipv4", "ipv6"]).optional(),
  selfSignedHost: z.string().optional(),
  certPath: z.string().optional(),
  keyPath: z.string().optional(),
  ignoreClientBandwidth: z.coerce.boolean().optional(),
  obfsEnabled: z.coerce.boolean().optional(),
  obfsPassword: z.string().optional(),
  sniffEnabled: z.coerce.boolean().optional(),
  portHoppingEnabled: z.coerce.boolean().optional(),
  jumpPortStart: z.coerce.number().int().min(1).max(65535).optional(),
  jumpPortEnd: z.coerce.number().int().min(1).max(65535).optional(),
  jumpPortInterface: z.string().optional(),
  jumpPortIpv6Enabled: z.coerce.boolean().optional(),
  jumpPortIpv6Interface: z.string().optional()
}).superRefine((node, ctx) => {
  if (!(node.protocol === "hysteria2" && node.tlsMode === "self-signed") && !node.domain?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["domain"], message: "Domain or endpoint is required" });
  }
  if (node.protocol !== "hysteria2") return;
  if ((node.tlsMode === "acme-dns" || node.tlsMode === "acme-dns-cloudflare") && !node.dnsToken?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dnsToken"], message: "ACME DNS requires provider token" });
  }
  if (node.tlsMode === "manual-cert") {
    if (!node.certPath?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["certPath"], message: "Certificate path is required" });
    if (!node.keyPath?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["keyPath"], message: "Private key path is required" });
  }
  if (node.obfsEnabled && !node.obfsPassword?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["obfsPassword"], message: "Obfs password is required" });
  }
  if (node.portHoppingEnabled) {
    if (!node.jumpPortInterface?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortInterface"], message: "Network interface is required" });
    if (!node.jumpPortStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortStart"], message: "Start port is required" });
    if (!node.jumpPortEnd) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortEnd"], message: "End port is required" });
    if (node.jumpPortStart && node.jumpPortEnd && node.jumpPortStart > node.jumpPortEnd) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortStart"], message: "Start port must be less than or equal to end port" });
    }
    if (node.jumpPortIpv6Enabled && !node.jumpPortIpv6Interface?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortIpv6Interface"], message: "IPv6 network interface is required" });
    }
  }
});

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

function normalizeUsers(users) {
  return users.map((user) => ({
    username: user.username.trim(),
    password: user.password
  }));
}

async function requireReadyServer(serverId, res) {
  const state = await loadDb();
  const server = state.servers.find((item) => item.id === serverId);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return null;
  }
  if (server.hookStatus !== "online") {
    res.status(409).json({ error: "Server hook is not ready" });
    return null;
  }
  return server;
}

async function syncAllStatuses() {
  if (syncInFlight) return { ok: false, skipped: true };
  syncInFlight = true;
  try {
    const state = await loadDb();
    const syncableStatuses = new Set(["online", "rebooting", "unreachable", "warning"]);
    const servers = (state.servers || []).filter((server) =>
      server.hookUrl && server.hookToken && syncableStatuses.has(server.hookStatus || server.status)
    );
    const results = await Promise.allSettled(
      servers.map((server) =>
        syncServerAndNodes({
          server,
          nodes: (state.nodes || []).filter((node) => node.serverId === server.id && node.status !== "deleting")
        })
      )
    );
    return {
      ok: true,
      servers: servers.length,
      failed: results.filter((item) => item.status === "rejected" || item.value?.ok === false).length
    };
  } finally {
    syncInFlight = false;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: isProduction ? "production" : "development" });
});

app.get("/api/auth/session", async (req, res) => {
  if (!authRequired) {
    res.json({ authenticated: true, authRequired: false });
    return;
  }
  const auth = await authenticateRequest(req);
  res.json({ authenticated: Boolean(auth), authRequired: true });
});

app.post("/api/auth/login", async (req, res) => {
  if (!authRequired) {
    res.json({ ok: true });
    return;
  }
  const data = parseBody(loginSchema, req, res);
  if (!data) return;
  const result = await loginWithPassword(data.password);
  if (!result.ok) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  setSessionCookie(res, result.token, req);
  res.json({ ok: true });
});

app.post("/api/auth/logout", async (req, res) => {
  if (authRequired) await logoutSession(parseCookies(req)[AUTH_COOKIE]);
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

app.use("/api", async (req, res, next) => {
  if (!authRequired) {
    next();
    return;
  }
  const auth = await authenticateRequest(req);
  if (!auth) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.auth = auth;
  next();
});

app.post("/api/auth/password", async (req, res) => {
  if (!authRequired) {
    res.status(409).json({ error: "Authentication is disabled in this runtime" });
    return;
  }
  const data = parseBody(passwordChangeSchema, req, res);
  if (!data) return;
  const result = await changePassword({
    tokenHash: req.auth.tokenHash,
    currentPassword: data.currentPassword,
    newPassword: data.newPassword
  });
  if (!result.ok) {
    res.status(400).json({ error: result.error || "Password change failed" });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/bootstrap", async (_req, res) => {
  const state = await loadDb();
  res.json({
    ...publicState(state),
    providers: providerList()
  });
});

app.post("/api/sync", async (_req, res) => {
  const result = await syncAllStatuses();
  res.status(result.skipped ? 202 : 200).json(result);
});

app.post("/api/servers", async (req, res) => {
  const schema = z.object({
    server: serverSchema.extend({
      hookPort: z.coerce.number().int().min(1).max(65535).default(DEFAULT_HOOK_PORT)
    }),
    credential: credentialSchema
  });
  const data = parseBody(schema, req, res);
  if (!data) return;
  const token = createHookToken();
  const hookPort = data.server.hookPort || DEFAULT_HOOK_PORT;
  const host = normalizeHost(data.server.host);
  const server = {
    ...data.server,
    host,
    id: data.server.id || uuid(),
    sshUserHint: data.credential.username,
    hookPort,
    hookUrl: `http://${hostForUrl(host)}:${hookPort}`,
    hookToken: token,
    hookStatus: "installing",
    status: "installing"
  };
  const saved = await mutateDb((state) => {
    const next = stamp(server, !data.server.id);
    const index = state.servers.findIndex((item) => item.id === next.id);
    if (index >= 0) state.servers[index] = { ...state.servers[index], ...next };
    else state.servers.push(next);
    appendAudit(state, "hook.install.start", `Installing hook on ${next.name}`, { serverId: next.id });
    return next;
  });
  const job = await createJob({
    type: "hook-install",
    title: `Install hook on ${saved.name}`,
    payload: { server: saved }
  });
  queueMicrotask(() => runInstallHookJob(job, { server: saved, credential: data.credential, hookPort, token }));
  res.status(202).json({ server: publicServer(saved), job });
});

app.patch("/api/servers/:id", async (req, res) => {
  const data = parseBody(serverUpdateSchema, req, res);
  if (!data) return;
  const updated = await mutateDb((state) => {
    const server = state.servers.find((item) => item.id === req.params.id);
    if (!server) return null;
    const host = data.host !== undefined ? normalizeHost(data.host) : server.host;
    const hookPort = data.hookPort !== undefined ? data.hookPort : server.hookPort;
    const shouldRefreshHookUrl = Boolean(server.hookUrl || data.host !== undefined || data.hookPort !== undefined);
    Object.assign(server, stamp({
      ...server,
      ...data,
      host,
      hookPort,
      hookUrl: shouldRefreshHookUrl ? `http://${hostForUrl(host)}:${hookPort || DEFAULT_HOOK_PORT}` : server.hookUrl
    }));
    appendAudit(state, "server.update", `${server.name} metadata updated`, { serverId: server.id });
    return server;
  });
  if (!updated) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  res.json({ server: publicServer(updated) });
});

app.delete("/api/servers/:id", async (req, res) => {
  const state = await loadDb();
  const server = state.servers.find((item) => item.id === req.params.id);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  if (req.query.force === "1" || req.query.force === "true") {
    await mutateDb((db) => {
      removeServerState(db, server.id);
      appendAudit(db, "server.force-clear", `${server.name} force-cleared from local state`, {
        serverId: server.id
      });
    });
    res.json({ ok: true, force: true });
    return;
  }
  const job = await createJob({
    type: "server-delete",
    title: `Delete ${server.name}`,
    payload: { server }
  });
  await mutateDb((db) => {
    const savedServer = db.servers.find((item) => item.id === req.params.id);
    if (savedServer) {
      savedServer.status = "deleting";
      savedServer.hookStatus = "deleting";
      savedServer.updatedAt = new Date().toISOString();
    }
    appendAudit(db, "server.delete.start", `Deleting ${server.name}: remote cleanup queued`, {
      serverId: server.id,
      jobId: job.id
    });
  });
  queueMicrotask(() => runDeleteServerJob(job, { server }));
  res.status(202).json({ job, server: publicServer({ ...server, status: "deleting", hookStatus: "deleting" }) });
});

app.post("/api/servers/:id/reboot", async (req, res) => {
  const server = await requireReadyServer(req.params.id, res);
  if (!server) return;

  const job = await runServerAction({
    type: "server-reboot",
    title: `Reboot ${server.name}`,
    server,
    extra: { SIMPLEUI_REBOOT_DELAY: "8" },
    timeoutMs: 30_000
  });
  res.status(202).json({ job });
});

app.post("/api/deployments", async (req, res) => {
  const schema = z.object({
    serverId: z.string(),
    node: nodeSchema,
    users: z.array(userSchema).min(1)
  });
  const data = parseBody(schema, req, res);
  if (!data) return;
  const state = await loadDb();
  const server = state.servers.find((item) => item.id === data.serverId);
  if (!server) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  if (server.hookStatus !== "online") {
    res.status(409).json({ error: "Server hook is not ready" });
    return;
  }

  const node = {
    ...data.node,
    listenPort: data.node.protocol === "trojan" ? 443 : data.node.listenPort,
    tlsMode: data.node.tlsMode === "acme-dns-cloudflare" ? "acme-dns" : data.node.tlsMode,
    dnsProvider: data.node.tlsMode === "acme-dns-cloudflare" ? "cloudflare" : data.node.dnsProvider,
    id: data.node.id || uuid(),
    serverId: server.id
  };
  const users = normalizeUsers(data.users);
  const effectiveUsers = ["hysteria2", "trojan"].includes(node.protocol) ? users.slice(0, 1) : users;

  const job = await createJob({
    type: "deploy",
    title: `Deploy ${node.protocol} on ${server.name}`,
    payload: { server, node }
  });

  queueMicrotask(() => runDeployJob(job, { server, node, users: effectiveUsers }));
  res.status(202).json({ job, server: publicServer(server), node });
});

app.patch("/api/nodes/:id", async (req, res) => {
  const schema = z.object({
    node: nodeSchema,
    users: z.array(userSchema).min(1)
  });
  const data = parseBody(schema, req, res);
  if (!data) return;
  const state = await loadDb();
  const existing = state.nodes.find((item) => item.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  if (data.node.protocol !== existing.protocol) {
    res.status(409).json({ error: "Changing a deployed node protocol is not supported; create a new node instead" });
    return;
  }
  const server = state.servers.find((item) => item.id === existing.serverId);
  if (!server) {
    res.status(404).json({ error: "Server for node not found" });
    return;
  }
  if (server.hookStatus !== "online") {
    res.status(409).json({ error: "Server hook is not ready" });
    return;
  }
  const node = {
    ...existing,
    ...data.node,
    id: existing.id,
    serverId: existing.serverId,
    protocol: existing.protocol,
    listenPort: existing.protocol === "trojan" ? 443 : data.node.listenPort,
    tlsMode: data.node.tlsMode === "acme-dns-cloudflare" ? "acme-dns" : data.node.tlsMode,
    dnsProvider: data.node.tlsMode === "acme-dns-cloudflare" ? "cloudflare" : data.node.dnsProvider
  };
  const users = normalizeUsers(data.users);
  const effectiveUsers = ["hysteria2", "trojan"].includes(node.protocol) ? users.slice(0, 1) : users;

  const job = await createJob({
    type: "node-update",
    title: `Update ${node.name} on ${server.name}`,
    payload: { server, node }
  });
  await mutateDb((db) => {
    const savedNode = db.nodes.find((item) => item.id === existing.id);
    if (savedNode) {
      savedNode.status = "updating";
      savedNode.updatedAt = new Date().toISOString();
    }
    appendAudit(db, "node.update.start", `Updating ${node.name}: redeploy queued`, {
      serverId: server.id,
      nodeId: node.id,
      jobId: job.id
    });
  });
  queueMicrotask(() => runDeployJob(job, { server, node, users: effectiveUsers }));
  res.status(202).json({ job, node: { ...node, status: "updating" } });
});

app.delete("/api/nodes/:id", async (req, res) => {
  const state = await loadDb();
  const node = state.nodes.find((item) => item.id === req.params.id);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  if (req.query.force === "1" || req.query.force === "true") {
    await mutateDb((db) => {
      removeNodeState(db, node.id);
      appendAudit(db, "node.force-clear", `${node.name} force-cleared from local state`, {
        serverId: node.serverId,
        nodeId: node.id
      });
    });
    res.json({ ok: true, force: true });
    return;
  }
  const server = state.servers.find((item) => item.id === node.serverId);
  if (!server) {
    res.status(404).json({ error: "Server for node not found" });
    return;
  }
  if (server.hookStatus !== "online") {
    res.status(409).json({ error: "Server hook is not ready" });
    return;
  }

  const job = await createJob({
    type: "node-delete",
    title: `Delete ${node.name}`,
    payload: { server, node }
  });
  await mutateDb((db) => {
    const savedNode = db.nodes.find((item) => item.id === req.params.id);
    if (savedNode) {
      savedNode.status = "deleting";
      savedNode.updatedAt = new Date().toISOString();
    }
    appendAudit(db, "node.delete.start", `Deleting ${node.name}: remote node cleanup queued`, {
      serverId: server.id,
      nodeId: node.id,
      jobId: job.id
    });
  });
  queueMicrotask(() => runDeleteNodeJob(job, { server, node }));
  res.status(202).json({ job, node: { ...node, status: "deleting" } });
});

app.get("/api/jobs/:id/events", async (req, res) => {
  const state = await loadDb();
  const job = state.jobs.find((item) => item.id === req.params.id);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  subscribeJob(req.params.id, res, job);
});

app.get("/api/jobs/:id", async (req, res) => {
  const state = await loadDb();
  const job = state.jobs.find((item) => item.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({ job });
});

app.delete("/api/jobs", async (_req, res) => {
  await mutateDb((state) => {
    state.jobs = [];
    appendAudit(state, "jobs.clear", "Task execution records cleared");
  });
  res.json({ ok: true });
});

app.post("/api/hooks/status", async (req, res) => {
  const schema = z.object({
    serverId: z.string(),
    nodeId: z.string()
  });
  const data = parseBody(schema, req, res);
  if (!data) return;
  const state = await loadDb();
  const server = state.servers.find((item) => item.id === data.serverId);
  const node = state.nodes.find((item) => item.id === data.nodeId);
  if (!server || !node) {
    res.status(404).json({ error: "Server or node not found" });
    return;
  }
  if (server.hookStatus !== "online") {
    res.status(409).json({ error: "Server hook is not ready" });
    return;
  }
  const job = await runRemoteAction({
    type: "status",
    title: `Refresh ${node.name}`,
    server,
    node
  });
  res.status(202).json({ job });
});

app.post("/api/hooks/service", async (req, res) => {
  const schema = z.object({
    serverId: z.string(),
    nodeId: z.string(),
    action: z.enum(["start", "stop", "restart"])
  });
  const data = parseBody(schema, req, res);
  if (!data) return;
  const state = await loadDb();
  const server = state.servers.find((item) => item.id === data.serverId);
  const node = state.nodes.find((item) => item.id === data.nodeId);
  if (!server || !node) {
    res.status(404).json({ error: "Server or node not found" });
    return;
  }
  if (server.hookStatus !== "online") {
    res.status(409).json({ error: "Server hook is not ready" });
    return;
  }
  const job = await runRemoteAction({
    type: "service",
    title: `${data.action} ${node.name}`,
    server,
    node,
    extra: { SIMPLEUI_SERVICE_ACTION: data.action }
  });
  res.status(202).json({ job });
});

app.post("/api/hooks/optimize", async (req, res) => {
  const schema = z.object({
    serverId: z.string(),
    action: optimizeActionSchema
  });
  const data = parseBody(schema, req, res);
  if (!data) return;
  const server = await requireReadyServer(data.serverId, res);
  if (!server) return;

  const job = await runServerAction({
    type: "optimize",
    title: `Optimize ${server.name}: ${data.action}`,
    server,
    extra: { SIMPLEUI_OPTIMIZE_ACTION: data.action },
    timeoutMs: 60 * 60_000
  });
  res.status(202).json({ job });
});

app.post("/api/hooks/ipquality", async (req, res) => {
  const data = parseBody(ipQualitySchema, req, res);
  if (!data) return;
  const server = await requireReadyServer(data.serverId, res);
  if (!server) return;

  const createIpQualityJob = (mode) => runServerAction({
    type: "ipquality",
    title: `IPQuality ${server.name} ${mode === "ipv6" ? "IPv6" : "IPv4"}`,
    server,
    extra: {
      SIMPLEUI_IPQUALITY_MODE: mode,
      SIMPLEUI_IPQUALITY_LANGUAGE: data.language,
      SIMPLEUI_IPQUALITY_INTERFACE: data.interface?.trim(),
      SIMPLEUI_IPQUALITY_PROXY: data.proxy?.trim(),
      SIMPLEUI_IPQUALITY_FULL_IP: data.fullIp ? "1" : "0",
      SIMPLEUI_IPQUALITY_PRIVACY: data.privacy ? "1" : "0"
    },
    secrets: [data.proxy],
    timeoutMs: 30 * 60_000
  });

  if (data.mode === "dual") {
    const jobs = [];
    jobs.push(await createIpQualityJob("ipv4"));
    jobs.push(await createIpQualityJob("ipv6"));
    res.status(202).json({ jobs });
    return;
  }

  const job = await runServerAction({
    type: "ipquality",
    title: `IPQuality ${server.name} ${data.mode === "ipv6" ? "IPv6" : "IPv4"}`,
    server,
    extra: {
      SIMPLEUI_IPQUALITY_MODE: data.mode,
      SIMPLEUI_IPQUALITY_LANGUAGE: data.language,
      SIMPLEUI_IPQUALITY_INTERFACE: data.interface?.trim(),
      SIMPLEUI_IPQUALITY_PROXY: data.proxy?.trim(),
      SIMPLEUI_IPQUALITY_FULL_IP: data.fullIp ? "1" : "0",
      SIMPLEUI_IPQUALITY_PRIVACY: data.privacy ? "1" : "0"
    },
    secrets: [data.proxy],
    timeoutMs: 30 * 60_000
  });
  res.status(202).json({ job });
});

app.post("/api/hooks/ban", async (req, res) => {
  const schema = z.object({
    targetIp: z.string().min(1),
    nodeIds: z.array(z.string()).min(1)
  });
  const data = parseBody(schema, req, res);
  if (!data) return;
  const normalizedTarget = normalizeIpTarget(data.targetIp);
  if (!normalizedTarget) {
    res.status(400).json({ error: "targetIp must be an IPv4, IPv6, IPv4 CIDR, or IPv6 CIDR target" });
    return;
  }
  data.targetIp = normalizedTarget.value;
  const state = await loadDb();
  const nodes = state.nodes.filter((node) => data.nodeIds.includes(node.id));
  if (!nodes.length) {
    res.status(404).json({ error: "No nodes selected" });
    return;
  }

  const jobs = [];
  for (const node of nodes) {
    const server = state.servers.find((item) => item.id === node.serverId);
    if (!server) {
      res.status(404).json({ error: `Server for node ${node.name} not found` });
      return;
    }
    if (server.hookStatus !== "online") {
      res.status(409).json({ error: `${server.name} hook is not ready` });
      return;
    }
    const job = await runRemoteAction({
      type: "ban",
      title: `Block source IP ${data.targetIp} on ${node.name}`,
      server,
      node,
      extra: {
        SIMPLEUI_BAN_IP: data.targetIp
      }
    });
    jobs.push(job);
  }

  await mutateDb((db) => {
    db.bans.push(stamp({
      targetKind: "source-ip",
      target: data.targetIp,
      ipFamily: normalizedTarget.family,
      nodeIds: data.nodeIds,
      status: "active"
    }, true));
    appendAudit(db, "ban.create", `Block source IP ${data.targetIp} on ${data.nodeIds.length} node(s)`);
  });
  res.status(202).json({ jobs });
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, host, () => {
  console.log(`SimpleUI API listening on http://${host}:${port}`);
  if (syncIntervalMs > 0) {
    setTimeout(() => syncAllStatuses().catch((error) => console.warn(`Initial status sync failed: ${error.message}`)), 1500);
    setInterval(() => syncAllStatuses().catch((error) => console.warn(`Status sync failed: ${error.message}`)), syncIntervalMs);
  }
});
