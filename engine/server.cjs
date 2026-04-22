'use strict'

const { WebSocketServer } = require('ws')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { renderFrames } = require('./renderer.cjs')
const { Encoder } = require('./encoder.cjs')

const PORT = 8765

const wss = new WebSocketServer({ port: PORT })
console.log(`[engine] WebSocket 服务已启动 ws://127.0.0.1:${PORT}`)

wss.on('connection', (ws) => {
  console.log('[engine] 客户端已连接')
  let cancelled = false
  let busy = false

  const send = (obj) => {
    if (ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(obj))
  }
  const log = (level, message) => {
    console.log(`[${level.toUpperCase()}] ${message}`)
    send({ type: 'log', level, message })
  }

  ws.on('message', async (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { log('error', '无效 JSON'); return }

    if (msg.type === 'cancel') {
      cancelled = true
      log('info', '收到取消指令')
      return
    }

    if (msg.type !== 'start') return

    if (busy) { log('warn', '已有任务在运行，忽略此次请求'); return }
    busy = true
    cancelled = false

    const job = msg.job

    // Resolve output directory (expand ~ and handle relative paths)
    let outDir = job.outputDir || '~/Videos'
    if (outDir === '~' || outDir.startsWith('~/') || outDir.startsWith('~\\')) {
      outDir = path.join(os.homedir(), outDir.slice(outDir === '~' ? 1 : 2))
    } else if (!path.isAbsolute(outDir)) {
      outDir = path.resolve(os.homedir(), outDir)
    }
    fs.mkdirSync(outDir, { recursive: true })

    const fname = job.outputFile
      ? (job.outputFile.endsWith('.mp4') ? job.outputFile : job.outputFile + '.mp4')
      : 'output.mp4'
    const outputPath = path.join(outDir, fname)

    log('info', `任务: ${job.width}x${job.height} @${job.fps}fps ${job.durationSec}s`)
    log('info', `源: ${job.sourcePath}`)
    log('info', `输出: ${outputPath}`)

    const encoder = new Encoder({
      fps: job.fps,
      crf: job.crf,
      outputPath,
      onLog: log,
    })

    try {
      encoder.start()

      await renderFrames(job, {
        onLog: log,
        isCancelled: () => cancelled,
        onFrame: async (frame, totalFrames, pngBuf) => {
          await encoder.writeFrame(pngBuf)
          send({
            type: 'progress',
            frame: frame + 1,
            totalFrames,
            percent: ((frame + 1) / totalFrames) * 100,
          })
        },
      })

      log('info', cancelled ? '渲染已取消，等待编码器收尾…' : '截图完毕，等待 FFmpeg 编码…')
      const result = await encoder.finish()

      if (cancelled) {
        send({ type: 'done', outputPath: null })
      } else if (result.success) {
        send({ type: 'done', outputPath })
      } else {
        send({ type: 'error', message: result.error || '编码失败' })
      }
    } catch (err) {
      log('error', `任务失败: ${err.message}`)
      send({ type: 'error', message: err.message })
      try { await encoder.finish() } catch { /* ignore cleanup error */ }
    } finally {
      busy = false
    }
  })

  ws.on('close', () => {
    cancelled = true
    console.log('[engine] 客户端已断开')
  })

  ws.on('error', (err) => console.error('[engine] ws 错误:', err.message))
})

wss.on('error', (err) => {
  console.error('[engine] 服务器错误:', err.message)
  if (err.code === 'EADDRINUSE') {
    console.error(`[engine] 端口 ${PORT} 已被占用，请关闭其他实例后重试`)
    process.exit(1)
  }
})
