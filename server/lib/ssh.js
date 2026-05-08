import { Client } from "ssh2";

const DEFAULT_TIMEOUT_MS = 90_000;

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
    let output = "";
    let settled = false;
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
              if (code === 0) {
                finish(null, { code, signal, output });
              } else {
                finish(new Error(`Remote hook exited with code ${code}${signal ? ` (${signal})` : ""}`));
              }
            })
            .on("data", (chunk) => {
              const text = chunk.toString();
              output += text;
              onLog?.(text);
            })
            .stderr.on("data", (chunk) => {
              const text = chunk.toString();
              output += text;
              onLog?.(text);
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
