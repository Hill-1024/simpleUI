const { app, BrowserWindow, Menu, dialog } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const appIcon = path.join(root, "build/icon.png");

app.setName("SimpleUI");

const menuLabels = {
  en: {
    file: "File",
    close: "Close Window",
    about: (name) => `About ${name}`,
    services: "Services",
    hide: (name) => `Hide ${name}`,
    hideOthers: "Hide Others",
    showAll: "Show All",
    quit: (name) => `Quit ${name}`,
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    pasteAndMatchStyle: "Paste and Match Style",
    delete: "Delete",
    selectAll: "Select All",
    view: "View",
    reload: "Reload",
    forceReload: "Force Reload",
    toggleDevTools: "Toggle Developer Tools",
    actualSize: "Actual Size",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    toggleFullScreen: "Toggle Full Screen",
    window: "Window",
    minimize: "Minimize",
    zoom: "Zoom",
    bringAllToFront: "Bring All to Front"
  },
  zh: {
    file: "文件",
    close: "关闭窗口",
    about: (name) => `关于 ${name}`,
    services: "服务",
    hide: (name) => `隐藏 ${name}`,
    hideOthers: "隐藏其他",
    showAll: "全部显示",
    quit: (name) => `退出 ${name}`,
    edit: "编辑",
    undo: "撤销",
    redo: "重做",
    cut: "剪切",
    copy: "复制",
    paste: "粘贴",
    pasteAndMatchStyle: "粘贴并匹配样式",
    delete: "删除",
    selectAll: "全选",
    view: "显示",
    reload: "重新载入",
    forceReload: "强制重新载入",
    toggleDevTools: "切换开发者工具",
    actualSize: "实际大小",
    zoomIn: "放大",
    zoomOut: "缩小",
    toggleFullScreen: "切换全屏",
    window: "窗口",
    minimize: "最小化",
    zoom: "缩放",
    bringAllToFront: "全部置于顶层"
  }
};

function getMenuLabels() {
  const systemLanguages = typeof app.getPreferredSystemLanguages === "function" ? app.getPreferredSystemLanguages() : [];
  const locale = systemLanguages[0] || app.getLocale() || "en";
  return /^zh([_-]|$)/i.test(locale) ? menuLabels.zh : menuLabels.en;
}

function installApplicationMenu() {
  const labels = getMenuLabels();
  const appName = app.name || "SimpleUI";
  const appMenu = process.platform === "darwin"
    ? [{
        label: appName,
        submenu: [
          { label: labels.about(appName), role: "about" },
          { type: "separator" },
          { label: labels.services, role: "services", submenu: [] },
          { type: "separator" },
          { label: labels.hide(appName), role: "hide" },
          { label: labels.hideOthers, role: "hideOthers" },
          { label: labels.showAll, role: "unhide" },
          { type: "separator" },
          { label: labels.quit(appName), role: "quit" }
        ]
      }]
    : [{
        label: labels.file,
        submenu: [
          { label: labels.close, role: "close" },
          { type: "separator" },
          { label: labels.quit(appName), role: "quit" }
        ]
      }];
  const windowMenu = process.platform === "darwin"
    ? [
        { label: labels.minimize, role: "minimize" },
        { label: labels.zoom, role: "zoom" },
        { type: "separator" },
        { label: labels.bringAllToFront, role: "front" }
      ]
    : [
        { label: labels.minimize, role: "minimize" },
        { label: labels.close, role: "close" }
      ];

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...appMenu,
    {
      label: labels.edit,
      submenu: [
        { label: labels.undo, role: "undo" },
        { label: labels.redo, role: "redo" },
        { type: "separator" },
        { label: labels.cut, role: "cut" },
        { label: labels.copy, role: "copy" },
        { label: labels.paste, role: "paste" },
        { label: labels.pasteAndMatchStyle, role: "pasteAndMatchStyle" },
        { label: labels.delete, role: "delete" },
        { type: "separator" },
        { label: labels.selectAll, role: "selectAll" }
      ]
    },
    {
      label: labels.view,
      submenu: [
        { label: labels.reload, role: "reload" },
        { label: labels.forceReload, role: "forceReload" },
        { label: labels.toggleDevTools, role: "toggleDevTools" },
        { type: "separator" },
        { label: labels.actualSize, role: "resetZoom" },
        { label: labels.zoomIn, role: "zoomIn" },
        { label: labels.zoomOut, role: "zoomOut" },
        { type: "separator" },
        { label: labels.toggleFullScreen, role: "togglefullscreen" }
      ]
    },
    {
      label: labels.window,
      submenu: windowMenu
    }
  ]));
}

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
  if (process.platform === "darwin") app.dock?.setIcon(appIcon);
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1120,
    minHeight: 760,
    icon: appIcon,
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

app.whenReady().then(async () => {
  installApplicationMenu();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});
