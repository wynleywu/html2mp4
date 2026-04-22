const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')

const DEV_URL = 'http://127.0.0.1:4001/'

// Start the render engine WebSocket server in the main process.
// All heavy work (offscreen BrowserWindow, FFmpeg) runs asynchronously.
require('../engine/server.cjs')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
