const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dayclearDesktop", {
  isDesktop: true,
  getAutoStart: () => ipcRenderer.invoke("desktop:get-auto-start"),
  setAutoStart: (enabled) => ipcRenderer.invoke("desktop:set-auto-start", Boolean(enabled)),
});
