const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')

const DEV_URL = 'http://127.0.0.1:4001/'

// Start the render engine WebSocket server in the main process.
// All heavy work (offscreen BrowserWindow, FFmpeg) runs asynchronously.
require('../engine/server.cjs')

function createContextMenuTemplate() {
  return [
    { label: '撤销', role: 'undo' },
    { label: '重做', role: 'redo' },
    { type: 'separator' },
    { label: '剪切', role: 'cut' },
    { label: '复制', role: 'copy' },
    { label: '粘贴', role: 'paste' },
    { label: '全选', role: 'selectAll' },
    { type: 'separator' },
    { label: '关闭窗口', role: 'close' },
  ]
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false)
  Menu.setApplicationMenu(null)

  win.webContents.on('context-menu', (_event, params) => {
    const contextMenu = Menu.buildFromTemplate(createContextMenuTemplate())
    contextMenu.popup({
      window: win,
      x: params.x,
      y: params.y,
    })
  })

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  } else {
    win.loadURL(DEV_URL)
  }
}

ipcMain.handle('pick-html-file', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
    properties: ['openFile'],
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
  })
  if (canceled || !filePaths?.length) return null
  return filePaths[0]
})

ipcMain.handle('pick-output-dir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
    properties: ['openDirectory', 'createDirectory'],
  })
  if (canceled || !filePaths?.length) return null
  return filePaths[0]
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
