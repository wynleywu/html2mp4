/**
 * html2mp4 — Web UI ↔ 本地引擎 WebSocket 协议（可替换为 Electron/Tauri IPC，payload 形状保持一致）
 *
 * WebSocket 固定: ws://127.0.0.1:8765（改端口请编辑本文件常量 ENGINE_WS_PORT）
 * 本机绝对路径：用 npm run desktop:dev 打开 Electron 窗口，点「本机选择…」可调系统文件对话框。
 *
 * Client → Engine
 *   { type: 'start', job: { sourcePath, droppedFileName?, width, height, fps, durationSec, dpr, crf, initWaitMs, mode, outputDir, outputFile } }
 *   { type: 'cancel' }
 *
 * Engine → Client
 *   { type: 'progress', frame?, totalFrames?, percent? }
 *   { type: 'log', level: 'info'|'warn'|'error', message: string }
 *   { type: 'done', outputPath?: string }
 *   { type: 'error', message: string }
 */

const LOG_MAX_LINES = 200
const ENGINE_WS_PORT = 8765

const $ = (id) => document.getElementById(id)

const els = {
  dropzone: $('dropzone'),
  fileInput: $('file-input'),
  droppedName: $('dropped-name'),
  sourcePath: $('source-path'),
  width: $('width'),
  height: $('height'),
  fps: $('fps'),
  duration: $('duration'),
  dpr: $('dpr'),
  dprValue: $('dpr-value'),
  crf: $('crf'),
  crfValue: $('crf-value'),
  initWait: $('init-wait'),
  modeFast: $('mode-fast'),
  modePrecise: $('mode-precise'),
  outputDir: $('output-dir'),
  outputFile: $('output-file'),
  btnExportJob: $('btn-export-job'),
  btnStart: $('btn-start'),
  btnCancel: $('btn-cancel'),
  btnClearLog: $('btn-clear-log'),
  btnNativeFile: $('btn-native-file'),
  btnOutputHint: $('btn-output-hint'),
  monitorIdle: $('monitor-idle'),
  monitorActive: $('monitor-active'),
  progressDetail: $('progress-detail'),
  progressPct: $('progress-pct'),
  progressFill: $('progress-fill'),
  statsResolution: $('stats-resolution'),
  statsFps: $('stats-fps'),
  statsFrames: $('stats-frames'),
  statsElapsed: $('stats-elapsed'),
  statsEta: $('stats-eta'),
  logContainer: $('log-container'),
}

let ws = null
let currentMode = 'fast'
let droppedFileName = ''
let isRunning = false
let elapsedTimer = null
let jobStartedAt = 0
let lastTotalFrames = 0
let viewportScaleTimer = null

function resolveFileAbsolutePath(file) {
  if (!file || typeof file !== 'object') return ''
  const maybePath = typeof file.path === 'string' ? file.path.trim() : ''
  return maybePath
}

function syncSelectedFile(file, labelPrefix) {
  if (!file) {
    droppedFileName = ''
    els.droppedName.textContent = ''
    return
  }
  droppedFileName = file.name
  els.droppedName.textContent = `${labelPrefix}: ${file.name}`
  const absolutePath = resolveFileAbsolutePath(file)
  if (absolutePath) {
    els.sourcePath.value = absolutePath
    appendLog('info', `[INFO] 已自动填写源路径: ${absolutePath}`)
  } else if (!String(els.sourcePath.value).trim()) {
    appendLog('warn', '[WARN] 当前环境无法读取文件绝对路径，请手填路径或使用「本机选择…」。')
  }
}

function wsUrl() {
  return `ws://127.0.0.1:${ENGINE_WS_PORT}`
}

function formatHMS(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

function setMode(mode) {
  currentMode = mode === 'precise' ? 'precise' : 'fast'
  const active = 'bg-surface-container-lowest text-on-surface shadow-sm'
  const idle = 'text-on-surface-variant hover:text-on-surface'
  if (currentMode === 'fast') {
    els.modeFast.className = `mode-btn flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${active}`
    els.modePrecise.className = `mode-btn flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${idle}`
  } else {
    els.modeFast.className = `mode-btn flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${idle}`
    els.modePrecise.className = `mode-btn flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${active}`
  }
}

function clearLog() {
  els.logContainer.replaceChildren()
}

function appendLog(level, message) {
  const line = document.createElement('div')
  line.className = 'log-line'
  const colors = {
    info: 'text-slate-400',
    warn: 'text-amber-600',
    error: 'text-red-600',
    process: 'text-primary',
  }
  line.classList.add(colors[level] ?? colors.info)
  line.textContent = message
  els.logContainer.appendChild(line)
  while (els.logContainer.children.length > LOG_MAX_LINES) {
    els.logContainer.removeChild(els.logContainer.firstChild)
  }
  els.logContainer.scrollTop = els.logContainer.scrollHeight
}

function setFormDisabled(disabled) {
  const ids = [
    'source-path',
    'width',
    'height',
    'fps',
    'duration',
    'dpr',
    'crf',
    'init-wait',
    'output-dir',
    'output-file',
  ]
  for (const id of ids) {
    const el = $(id)
    if (el) el.disabled = disabled
  }
  els.dropzone.classList.toggle('pointer-events-none', disabled)
  els.dropzone.classList.toggle('opacity-60', disabled)
  els.fileInput.disabled = disabled
  els.modeFast.disabled = disabled
  els.modePrecise.disabled = disabled
  els.btnExportJob.disabled = disabled
  if (els.btnNativeFile) els.btnNativeFile.disabled = disabled
  els.btnStart.classList.toggle('hidden', disabled)
  els.btnCancel.classList.toggle('hidden', !disabled)
}

function showMonitorRunning(show) {
  els.monitorIdle.classList.toggle('hidden', show)
  els.monitorActive.classList.toggle('hidden', !show)
}

function resetProgressUI() {
  els.progressFill.style.width = '0%'
  els.progressPct.textContent = '0%'
  els.progressDetail.textContent = '—'
  els.statsEta.textContent = '—'
}

function buildJob() {
  const durationSec = Number.parseFloat(String(els.duration.value))
  const fps = Number.parseInt(String(els.fps.value), 10)
  const totalFrames = Math.max(1, Math.round(durationSec * fps))
  return {
    sourcePath: String(els.sourcePath.value).trim(),
    droppedFileName: droppedFileName || undefined,
    width: Number.parseInt(String(els.width.value), 10),
    height: Number.parseInt(String(els.height.value), 10),
    fps,
    durationSec,
    dpr: Number.parseInt(String(els.dpr.value), 10),
    crf: Number.parseInt(String(els.crf.value), 10),
    initWaitMs: Number.parseInt(String(els.initWait.value), 10),
    mode: currentMode,
    outputDir: String(els.outputDir.value).trim(),
    outputFile: String(els.outputFile.value).trim(),
    totalFrames,
  }
}

function validate(job) {
  if (!job.sourcePath) return '请填写源文件绝对路径，或在本机窗口点击「本机选择…」（npm run desktop:dev）。'
  if (!Number.isFinite(job.width) || job.width < 16) return '宽度无效。'
  if (!Number.isFinite(job.height) || job.height < 16) return '高度无效。'
  if (!Number.isFinite(job.fps) || job.fps < 1) return 'FPS 无效。'
  if (!Number.isFinite(job.durationSec) || job.durationSec <= 0) return '时长无效。'
  if (!Number.isFinite(job.dpr) || job.dpr < 1 || job.dpr > 4) return 'DPR 无效。'
  if (!Number.isFinite(job.crf) || job.crf < 0 || job.crf > 40) return 'CRF 无效。'
  if (!Number.isFinite(job.initWaitMs) || job.initWaitMs < 0) return '初始化等待无效。'
  if (!job.outputDir) return '请填写输出目录。'
  if (!job.outputFile) return '请填写输出文件名。'
  return null
}

function downloadJobJson(job) {
  const blob = new Blob([JSON.stringify({ version: 1, job }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'html2mp4-job.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

function startElapsedLoop() {
  stopElapsedLoop()
  jobStartedAt = performance.now()
  elapsedTimer = window.setInterval(() => {
    const elapsed = performance.now() - jobStartedAt
    els.statsElapsed.textContent = formatHMS(elapsed)
  }, 500)
}

function stopElapsedLoop() {
  if (elapsedTimer != null) {
    window.clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

function handleEngineMessage(data) {
  const type = data?.type
  if (type === 'progress') {
    const pct =
      typeof data.percent === 'number'
        ? Math.min(100, Math.max(0, data.percent))
        : data.totalFrames > 0 && typeof data.frame === 'number'
          ? Math.min(100, Math.max(0, (data.frame / data.totalFrames) * 100))
          : null
    if (typeof data.totalFrames === 'number') lastTotalFrames = data.totalFrames
    if (pct != null) {
      els.progressFill.style.width = `${pct}%`
      els.progressPct.textContent = `${Math.round(pct)}%`
      const elapsed = performance.now() - jobStartedAt
      if (pct > 0 && pct < 100) {
        const total = elapsed / (pct / 100)
        const eta = Math.max(0, total - elapsed)
        els.statsEta.textContent = formatHMS(eta)
      } else if (pct >= 100) {
        els.statsEta.textContent = '00:00:00'
      }
    }
    if (typeof data.frame === 'number' && typeof data.totalFrames === 'number') {
      els.progressDetail.textContent = `processing frame ${data.frame} / ${data.totalFrames}`
    } else if (typeof data.frame === 'number') {
      els.progressDetail.textContent = `frame ${data.frame}`
    }
    return
  }
  if (type === 'log') {
    const level = ['warn', 'error'].includes(data.level) ? data.level : 'info'
    const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]'
    appendLog(level, `${prefix} ${data.message ?? ''}`)
    return
  }
  if (type === 'done') {
    appendLog('info', `[INFO] 完成${data.outputPath ? `: ${data.outputPath}` : ''}`)
    finishJob(false)
    return
  }
  if (type === 'error') {
    appendLog('error', `[ERROR] ${data.message ?? '未知错误'}`)
    finishJob(true)
  }
}

function finishJob() {
  isRunning = false
  stopElapsedLoop()
  setFormDisabled(false)
  showMonitorRunning(false)
  resetProgressUI()
}

function fitUiToViewport() {
  const root = document.documentElement
  const main = document.querySelector('main')
  const viewport = $('app-viewport')
  if (!main || !viewport) return

  root.style.setProperty('--ui-offset-x', '0px')
  root.style.setProperty('--ui-offset-y', '0px')

  const availableWidth = viewport.clientWidth
  const contentWidth = main.scrollWidth

  const offsetX = Math.max(0, (availableWidth - contentWidth) / 2)
  const offsetY = 0

  root.style.setProperty('--ui-offset-x', `${offsetX.toFixed(2)}px`)
  root.style.setProperty('--ui-offset-y', `${offsetY.toFixed(2)}px`)
}

function scheduleFitUiToViewport() {
  if (viewportScaleTimer != null) window.clearTimeout(viewportScaleTimer)
  viewportScaleTimer = window.setTimeout(() => {
    fitUiToViewport()
  }, 60)
}

function connectWs() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws)
      return
    }
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
    const url = wsUrl()
    appendLog('info', `[INFO] 正在连接 ${url} …`)
    const socket = new WebSocket(url)
    socket.addEventListener('open', () => {
      appendLog('info', `[INFO] WebSocket 已连接 ${url}`)
      resolve(socket)
    })
    socket.addEventListener('error', () => {
      appendLog('error', `[ERROR] 无法连接 ${url}（本地引擎是否已启动？）`)
      reject(new Error('ws error'))
    })
    socket.addEventListener('close', () => {
      if (isRunning) {
        appendLog('error', '[ERROR] 连接在任务进行中关闭')
        finishJob(true)
      }
    })
    socket.addEventListener('message', (ev) => {
      let data
      try {
        data = JSON.parse(ev.data)
      } catch {
        appendLog('warn', `[WARN] 非 JSON 消息: ${String(ev.data).slice(0, 200)}`)
        return
      }
      handleEngineMessage(data)
    })
    ws = socket
  })
}

async function onStart() {
  const job = buildJob()
  const err = validate(job)
  if (err) {
    appendLog('warn', `[WARN] ${err}`)
    return
  }
  lastTotalFrames = job.totalFrames
  els.statsResolution.textContent = `${job.width}x${job.height}`
  els.statsFps.textContent = String(job.fps)
  els.statsFrames.textContent = String(lastTotalFrames)
  els.statsElapsed.textContent = '00:00:00'
  els.statsEta.textContent = '—'

  try {
    await connectWs()
  } catch {
    return
  }

  isRunning = true
  setFormDisabled(true)
  showMonitorRunning(true)
  resetProgressUI()
  els.progressDetail.textContent = 'starting…'
  startElapsedLoop()
  ws.send(JSON.stringify({ type: 'start', job }))
  appendLog('info', `[INFO] 已发送 start，totalFrames≈${lastTotalFrames}`)
}

function onCancel() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cancel' }))
    appendLog('info', '[INFO] 已发送 cancel')
  }
  finishJob(false)
}

function onExportJob() {
  const job = buildJob()
  const err = validate(job)
  if (err) {
    appendLog('warn', `[WARN] ${err}`)
    return
  }
  downloadJobJson(job)
  appendLog('info', '[INFO] 已下载 html2mp4-job.json')
}

// --- init ---
setMode('fast')

els.dpr.addEventListener('input', () => {
  els.dprValue.textContent = els.dpr.value
})
els.crf.addEventListener('input', () => {
  els.crfValue.textContent = els.crf.value
})
els.modeFast.addEventListener('click', () => setMode('fast'))
els.modePrecise.addEventListener('click', () => setMode('precise'))

els.dropzone.addEventListener('click', () => {
  if (!els.fileInput.disabled) els.fileInput.click()
})
els.fileInput.addEventListener('change', () => {
  const f = els.fileInput.files?.[0]
  syncSelectedFile(f, '已选文件')
})

;['dragenter', 'dragover'].forEach((ev) => {
  els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault()
    e.stopPropagation()
    els.dropzone.classList.add('dragover')
  })
})
;['dragleave', 'drop'].forEach((ev) => {
  els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault()
    e.stopPropagation()
    els.dropzone.classList.remove('dragover')
  })
})
els.dropzone.addEventListener('drop', (e) => {
  if (els.fileInput.disabled) return
  const f = e.dataTransfer?.files?.[0]
  if (f && /\.html?$/i.test(f.name)) {
    syncSelectedFile(f, '已拖入')
    try {
      const dt = new DataTransfer()
      dt.items.add(f)
      els.fileInput.files = dt.files
    } catch {
      /* ignore if DataTransfer unsupported */
    }
  } else {
    appendLog('warn', '[WARN] 请拖入 .html 文件')
  }
})

els.btnNativeFile?.addEventListener('click', async () => {
  const api = globalThis.nativeFileDialog
  if (!api?.pickHtmlFile) {
    appendLog(
      'warn',
      '[WARN] 系统文件对话框仅在 Electron 中可用：在项目根执行 npm run desktop:dev，在打开的窗口内使用本页。',
    )
    return
  }
  try {
    const p = await api.pickHtmlFile()
    if (!p) return
    els.sourcePath.value = p
    const base = p.replace(/[/\\]/g, '/').split('/').pop() ?? ''
    if (base) {
      droppedFileName = base
      els.droppedName.textContent = `本机已选: ${base}`
    }
    appendLog('info', `[INFO] 源路径: ${p}`)
  } catch (e) {
    appendLog('error', `[ERROR] 选择文件失败: ${e?.message ?? e}`)
  }
})

els.btnStart.addEventListener('click', () => onStart())
els.btnCancel.addEventListener('click', () => onCancel())
els.btnExportJob.addEventListener('click', () => onExportJob())
els.btnClearLog.addEventListener('click', () => {
  clearLog()
  appendLog('info', '[INFO] 日志已清空')
})

els.btnOutputHint.addEventListener('click', () => {
  const api = globalThis.nativeFileDialog
  if (!api?.pickOutputDir) {
    appendLog(
      'warn',
      '[WARN] 目录选择仅在 Electron 中可用：在项目根执行 npm run desktop:dev，并在打开的窗口中点击该按钮。',
    )
    return
  }
  api
    .pickOutputDir()
    .then((dir) => {
      if (!dir) return
      els.outputDir.value = dir
      appendLog('info', `[INFO] 输出目录: ${dir}`)
    })
    .catch((e) => {
      appendLog('error', `[ERROR] 选择输出目录失败: ${e?.message ?? e}`)
    })
})

clearLog()
appendLog(
  'info',
  '[INFO] 页面就绪。点击 Start Recording 连接 ws://127.0.0.1:8765；需系统选文件时请 npm run desktop:dev。可导出任务 JSON。',
)

window.addEventListener('resize', scheduleFitUiToViewport)
if (document.fonts?.ready) {
  document.fonts.ready.then(() => scheduleFitUiToViewport())
}
window.setTimeout(() => scheduleFitUiToViewport(), 0)
