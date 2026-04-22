'use strict'

const path = require('path')
const { pathToFileURL } = require('url')

/**
 * Render frames from an HTML file using Electron's offscreen BrowserWindow.
 * No external Chromium needed — reuses the bundled Electron browser engine.
 *
 * @param {object} job
 * @param {{ onFrame(i, total, buf): Promise<void>, onLog(level, msg): void, isCancelled(): boolean }} cbs
 */
async function renderFrames(job, { onFrame, onLog, isCancelled }) {
  // Lazy-require electron so this module can be linted outside Electron context
  const { app, BrowserWindow } = require('electron')
  const { width, height, fps, durationSec, initWaitMs, mode } = job
  const totalFrames = Math.max(1, Math.round(durationSec * fps))
  const frameMs = 1000 / fps

  if (!app.isReady()) await app.whenReady()

  // Pass config to preload via env (safe: only one job runs at a time)
  process.env.HTML2MP4_MODE = mode
  process.env.HTML2MP4_FRAME_MS = String(frameMs)

  onLog('info', `创建离屏渲染窗口 (${width}x${height}, mode=${mode})…`)

  const win = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: {
      offscreen: true,
      // contextIsolation off: preload can set window.* directly
      contextIsolation: false,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload-capture.cjs'),
    },
  })

  try {
    const sourcePath = job.sourcePath
    const pageUrl = /^https?:\/\//.test(sourcePath)
      ? sourcePath
      : pathToFileURL(sourcePath).href

    onLog('info', `加载页面: ${pageUrl}`)

    await new Promise((resolve, reject) => {
      win.webContents.once('did-finish-load', resolve)
      win.webContents.once('did-fail-load', (_ev, _code, desc) =>
        reject(new Error(`页面加载失败: ${desc}`)),
      )
      win.webContents.loadURL(pageUrl)
    })

    if (initWaitMs > 0) {
      onLog('info', `等待初始化 ${initWaitMs}ms…`)
      await new Promise((r) => setTimeout(r, initWaitMs))
    }

    // For fast mode, kick off one rAF tick so animations start
    if (mode === 'fast') {
      await win.webContents.executeJavaScript('void 0')
    }

    onLog('info', `开始捕获 ${totalFrames} 帧 (${fps} fps)…`)

    for (let i = 0; i < totalFrames; i++) {
      if (isCancelled()) {
        onLog('info', '捕获中断（已取消）')
        break
      }

      if (mode === 'precise') {
        await win.webContents.executeJavaScript(
          `window.__html2mp4_tick(${i})`,
        )
      } else if (i > 0) {
        // Fast mode: let real timers run at natural speed
        await new Promise((r) => setTimeout(r, frameMs))
      }

      const image = await win.webContents.capturePage()
      await onFrame(i, totalFrames, image.toPNG())
    }

    onLog('info', '所有帧捕获完毕')
  } finally {
    if (!win.isDestroyed()) win.destroy()
    onLog('info', '离屏窗口已关闭')
  }
}

module.exports = { renderFrames }
