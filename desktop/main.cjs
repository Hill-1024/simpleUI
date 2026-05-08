const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

function pickPort(start = 8787) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(start, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", () => resolve(pickPort(start + 1)));
  });
}

async function startApi() {
  const port = await pickPort(Number(process.env.SIMPLEUI_PORT || 8787));
  const serverEntry = path.join(root, "server/index.js");
  process.env.NODE_ENV = "production";
  process.env.SIMPLEUI_DESKTOP = "1";
  process.env.SIMPLEUI_PORT = String(port);
  try {
    await import(pathToFileURL(serverEntry).href);
  } catch (error) {
    dialog.showErrorBox("SimpleUI API failed", error.message);
    throw error;
  }

  return `http://127.0.0.1:${port}`;
}

async function createWindow() {
  const baseUrl = process.env.SIMPLEUI_DESKTOP_DEV === "1" ? "http://127.0.0.1:5173" : await startApi();
  const allowedOrigin = new URL(baseUrl).origin;
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1120,
    minHeight: 760,
    title: "SimpleUI Node Console",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== allowedOrigin) event.preventDefault();
  });
  await win.loadURL(baseUrl);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});
