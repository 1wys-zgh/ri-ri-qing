const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, session, Tray } = require("electron");
const path = require("node:path");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setAppUserModelId("com.dayclear.ririqing");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let hasShownTrayNotice = false;

function launchExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function getAutoStart() {
  return app.getLoginItemSettings({
    path: launchExecutablePath(),
    args: ["--hidden"],
  }).openAtLogin;
}

function setAutoStart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: launchExecutablePath(),
    args: ["--hidden"],
  });
  return getAutoStart();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "打开日日清",
      click: showMainWindow,
    },
    { type: "separator" },
    {
      label: "开机自动启动",
      type: "checkbox",
      checked: getAutoStart(),
      click: (item) => {
        setAutoStart(item.checked);
        updateTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "退出日日清",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function showTrayNotice() {
  if (hasShownTrayNotice || !Notification.isSupported()) return;
  hasShownTrayNotice = true;
  const notice = new Notification({
    title: "日日清仍在后台运行",
    body: "到点会继续提醒并播放你选择的音乐。双击托盘图标可以重新打开。",
    icon: path.join(__dirname, "assets", "icon.png"),
    silent: true,
  });
  notice.on("click", showMainWindow);
  notice.show();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f4f0e7",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "dist-renderer", "index.html"));
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    showTrayNotice();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (!process.argv.includes("--hidden")) {
    mainWindow.once("ready-to-show", showMainWindow);
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "icon.ico"));
  tray = new Tray(icon);
  tray.setToolTip("日日清 · 每日打卡提醒");
  tray.on("double-click", showMainWindow);
  updateTrayMenu();
}

ipcMain.handle("desktop:get-auto-start", () => getAutoStart());
ipcMain.handle("desktop:set-auto-start", (_event, enabled) => {
  const result = setAutoStart(Boolean(enabled));
  updateTrayMenu();
  return result;
});

app.on("second-instance", () => showMainWindow());

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === "notifications");
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "notifications");
  });
  createWindow();
  createTray();
});

app.on("activate", showMainWindow);
app.on("window-all-closed", () => {
  // Keep running in the Windows notification area until the user chooses Exit.
});
app.on("before-quit", () => {
  isQuitting = true;
});
