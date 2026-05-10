import { Client } from "ssh2";

const DEFAULT_TIMEOUT_MS = 90_000;
const activeConnections = new Set();
const SECRET_MARKER_PREFIX = "__SIMPLEUI_SECRET_";

function shellQuote(value) {
  if (value === undefined || value === null) return "''";
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function envPrelude(env = {}) {
  return Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join("\n");
}

function normalizeSshHost(host) {
  const value = String(host || "");
  if (value.startsWith("[") && value.includes("]")) {
    return value.slice(1, value.indexOf("]"));
  }
  return value;
}

export function runSshScript({ credential, script, env, onLog, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    activeConnections.add(conn);
    let output = "";
    let logBuffer = "";
    let settled = false;
    const forwardLog = (text) => {
      logBuffer += text;
      const lines = logBuffer.split(/\r?\n/);
      logBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith(SECRET_MARKER_PREFIX)) onLog?.(`${line}\n`);
      }
    };
    const flushLog = () => {
      if (logBuffer && !logBuffer.startsWith(SECRET_MARKER_PREFIX)) onLog?.(logBuffer);
      logBuffer = "";
    };
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        conn.end();
        reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeConnections.delete(conn);
      conn.end();
      if (error) reject(error);
      else resolve(result);
    };

    conn
      .on("ready", () => {
        conn.exec("bash -se", (err, stream) => {
          if (err) {
            finish(err);
            return;
          }
          stream
            .on("close", (code, signal) => {
              flushLog();
              if (code === 0) {
                finish(null, { code, signal, output });
              } else {
                finish(new Error(`Remote hook exited with code ${code}${signal ? ` (${signal})` : ""}`));
              }
            })
            .on("data", (chunk) => {
              const text = chunk.toString();
              output += text;
              forwardLog(text);
            })
            .stderr.on("data", (chunk) => {
              const text = chunk.toString();
              output += text;
              forwardLog(text);
            });
          stream.end(`${envPrelude(env)}\n${script}\n`);
        });
      })
      .on("error", (error) => finish(error))
      .connect({
        host: normalizeSshHost(credential.host),
        port: Number(credential.port || 22),
        username: credential.username,
        password: credential.password || undefined,
        privateKey: credential.privateKey || undefined,
        passphrase: credential.passphrase || undefined,
        readyTimeout: 20_000,
        keepaliveInterval: 15_000
      });
  });
}

export function closeSshConnections() {
  for (const conn of activeConnections) {
    try {
      conn.end();
      conn.destroy();
    } catch {
      // Best-effort shutdown.
    }
  }
  activeConnections.clear();
}
