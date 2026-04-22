const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nativeFileDialog', {
  pickHtmlFile: () => ipcRenderer.invoke('pick-html-file'),
})
