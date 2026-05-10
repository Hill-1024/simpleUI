import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { v4 as uuid } from "uuid";
import { sanitizeNodeSecrets } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const legacyDataFileName = "state.json";
const sqliteFileName = "state.sqlite";
const collections = ["servers", "nodes", "users", "connections", "remoteTraffic", "bans", "jobs", "audit"];
const retentionLimits = {
  audit: Number(process.env.SIMPLEUI_AUDIT_LIMIT || 1000),
  jobs: Number(process.env.SIMPLEUI_JOBS_LIMIT || 200),
  connections: Number(process.env.SIMPLEUI_CONNECTION_LIMIT || 5000),
  remoteTraffic: Number(process.env.SIMPLEUI_REMOTE_TRAFFIC_LIMIT || 5000)
};

let writeQueue = Promise.resolve();
let dbHandle = null;
let dbHandlePath = "";

const now = () => new Date().toISOString();

function dataDir() {
  return process.env.SIMPLEUI_DATA_DIR || path.join(rootDir, "data");
}

function legacyDataFile() {
  return path.join(dataDir(), legacyDataFileName);
}

export function sqliteDataFile() {
  return process.env.SIMPLEUI_DB_PATH || path.join(dataDir(), sqliteFileName);
}

const seed = () => ({
  meta: {
    version: 2,
    storage: "sqlite",
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

function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? limit : 0;
}

function applyRetention(state) {
  const next = { ...state };
  for (const [collection, limit] of Object.entries(retentionLimits)) {
    const normalizedLimit = normalizeLimit(limit);
    if (!normalizedLimit || !Array.isArray(next[collection])) continue;
    next[collection] = next[collection].slice(-normalizedLimit);
  }
  return next;
}

function normalizeState(nextState) {
  const timestamp = now();
  const state = applyRetention({
    ...nextState,
    meta: {
      ...(nextState.meta || {}),
      version: Math.max(2, Number(nextState.meta?.version || 0)),
      storage: "sqlite",
      updatedAt: timestamp
    }
  });

  for (const collection of collections) {
    state[collection] = Array.isArray(state[collection]) ? state[collection] : [];
  }
  state.meta.createdAt = state.meta.createdAt || timestamp;
  return state;
}

function openDb() {
  const filename = sqliteDataFile();
  if (dbHandle && dbHandlePath === filename) return dbHandle;
  if (dbHandle) dbHandle.close();
  fsSync.mkdirSync(path.dirname(filename), { recursive: true });
  dbHandle = new Database(filename);
  dbHandlePath = filename;
  dbHandle.pragma("journal_mode = WAL");
  dbHandle.pragma("foreign_keys = ON");
  dbHandle.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      position INTEGER NOT NULL,
      json TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_records_collection_position
      ON records(collection, position);
  `);
  return dbHandle;
}

function migrationApplied(db, version) {
  return Boolean(db.prepare("SELECT version FROM migrations WHERE version = ?").get(version));
}

function readFullState(db) {
  const metaRow = db.prepare("SELECT value FROM kv WHERE key = 'meta'").get();
  const state = {
    meta: metaRow ? JSON.parse(metaRow.value) : {},
    servers: [],
    nodes: [],
    users: [],
    connections: [],
    remoteTraffic: [],
    bans: [],
    jobs: [],
    audit: []
  };

  const rows = db.prepare(`
    SELECT collection, json
    FROM records
    ORDER BY collection, position ASC
  `).all();
  for (const row of rows) {
    if (!collections.includes(row.collection)) continue;
    state[row.collection].push(JSON.parse(row.json));
  }
  return normalizeState(state);
}

function writeFullState(db, nextState) {
  const state = normalizeState(nextState);
  const insertMeta = db.prepare(`
    INSERT INTO kv (key, value, updated_at)
    VALUES ('meta', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const deleteRecords = db.prepare("DELETE FROM records");
  const insertRecord = db.prepare(`
    INSERT INTO records (collection, id, position, json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const transaction = db.transaction((value) => {
    insertMeta.run(JSON.stringify(value.meta), value.meta.updatedAt || now());
    deleteRecords.run();
    for (const collection of collections) {
      let position = 0;
      for (const item of value[collection] || []) {
        const id = item.id || uuid();
        const record = { ...item, id };
        insertRecord.run(
          collection,
          id,
          position,
          JSON.stringify(record),
          record.createdAt || null,
          record.updatedAt || record.createdAt || null
        );
        position += 1;
      }
    }
  });
  transaction(state);
  return state;
}

async function backupLegacyJson(raw, suffix) {
  const archiveDir = path.join(dataDir(), "archive");
  await fs.mkdir(archiveDir, { recursive: true });
  const backup = path.join(archiveDir, `state-json-${suffix}-${Date.now()}.json`);
  await fs.writeFile(backup, raw);
  return backup;
}

async function readInitialState() {
  try {
    const raw = await fs.readFile(legacyDataFile(), "utf8");
    try {
      const parsed = JSON.parse(raw);
      await backupLegacyJson(raw, "imported");
      return parsed;
    } catch {
      await backupLegacyJson(raw, "corrupt");
      return seed();
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return seed();
  }
}

async function ensureStore() {
  await fs.mkdir(dataDir(), { recursive: true });
  const db = openDb();
  if (migrationApplied(db, 1)) return db;
  const initialState = await readInitialState();
  const transaction = db.transaction((state) => {
    writeFullState(db, state);
    db.prepare("INSERT INTO migrations (version, applied_at) VALUES (?, ?)").run(1, now());
  });
  transaction(initialState);
  return db;
}

export async function loadDb() {
  const db = await ensureStore();
  return readFullState(db);
}

export async function saveDb(nextState) {
  const db = await ensureStore();
  return writeFullState(db, nextState);
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
  const { hookToken, hookCertFingerprint, ...safe } = server;
  const hasHook = Boolean(server.hookUrl);
  const isHttps = hasHook && String(server.hookUrl).startsWith("https://");
  const pinned = Boolean(hookCertFingerprint);
  const mismatch = server.hookTlsError === "fingerprint-mismatch" ||
    /fingerprint mismatch/i.test(server.metrics?.lastSyncError || "");
  return {
    ...safe,
    hookInstalled: Boolean(server.hookUrl && server.hookStatus === "online"),
    hookSecurity: {
      transport: !hasHook ? "none" : (isHttps ? "https" : "http"),
      pinned,
      mismatch,
      legacy: hasHook && (!isHttps || !pinned),
      upgradeRequired: hasHook && (!isHttps || !pinned || mismatch)
    }
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

export function closeDbForTests() {
  if (dbHandle) dbHandle.close();
  dbHandle = null;
  dbHandlePath = "";
  writeQueue = Promise.resolve();
}

export const closeDb = closeDbForTests;
