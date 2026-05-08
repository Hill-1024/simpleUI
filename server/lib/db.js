import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";
import { sanitizeNodeSecrets } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const dataDir = process.env.SIMPLEUI_DATA_DIR || path.join(rootDir, "data");
const dataFile = path.join(dataDir, "state.json");
let writeQueue = Promise.resolve();

const now = () => new Date().toISOString();

const seed = () => ({
  meta: {
    version: 1,
    createdAt: now(),
    updatedAt: now()
  },
  servers: [],
  nodes: [],
  users: [],
  connections: [],
  remoteTraffic: [],
  bans: [],
  jobs: [],
  audit: [
    {
      id: uuid(),
      type: "system.init",
      message: "State initialized. Install a server hook to begin.",
      createdAt: now()
    }
  ]
});

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(seed(), null, 2));
  }
}

export async function loadDb() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const backup = path.join(dataDir, `state.corrupt-${Date.now()}.json`);
    await fs.writeFile(backup, raw);
    const fresh = seed();
    await saveDb(fresh);
    return fresh;
  }
}

export async function saveDb(nextState) {
  nextState.meta = {
    ...(nextState.meta || {}),
    updatedAt: now()
  };
  await fs.mkdir(dataDir, { recursive: true });
  const tmpFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(nextState, null, 2));
  await fs.rename(tmpFile, dataFile);
  return nextState;
}

export async function mutateDb(mutator) {
  const run = async () => {
    const state = await loadDb();
    const result = await mutator(state);
    await saveDb(state);
    return result ?? state;
  };
  const next = writeQueue.then(run, run);
  writeQueue = next.catch(() => {});
  return next;
}

export function stamp(entity, isNew = false) {
  const timestamp = now();
  return {
    ...entity,
    id: entity.id || uuid(),
    createdAt: entity.createdAt || (isNew ? timestamp : undefined),
    updatedAt: timestamp
  };
}

export function publicState(state) {
  return {
    servers: (state.servers || []).map(publicServer),
    nodes: (state.nodes || []).map(sanitizeNodeSecrets),
    users: state.users || [],
    connections: state.connections || [],
    remoteTraffic: state.remoteTraffic || [],
    bans: state.bans || [],
    jobs: (state.jobs || []).slice(-25).reverse(),
    audit: (state.audit || []).slice(-50).reverse()
  };
}

export function publicServer(server) {
  const { hookToken, ...safe } = server;
  return {
    ...safe,
    hookInstalled: Boolean(server.hookUrl && server.hookStatus === "online")
  };
}

export function appendAudit(state, type, message, extra = {}) {
  state.audit = state.audit || [];
  state.audit.push({
    id: uuid(),
    type,
    message,
    ...extra,
    createdAt: now()
  });
}
