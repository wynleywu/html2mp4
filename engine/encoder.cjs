'use strict'

const { PassThrough } = require('stream')
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')

class Encoder {
  /**
   * @param {{ width: number, height: number, fps: number, crf: number,
   *           outputPath: string, onLog: (level: string, msg: string) => void }} opts
   */
  constructor({ fps, crf, outputPath, onLog }) {
    this.fps = fps
    this.crf = crf
    this.outputPath = outputPath
    this.onLog = onLog || (() => {})
    this.frameStream = new PassThrough()
    this._promise = new Promise((resolve) => { this._resolve = resolve })
  }

  start() {
    const ffmpeg = require('fluent-ffmpeg')
    ffmpeg.setFfmpegPath(ffmpegInstaller.path)

    this.proc = ffmpeg()
      .input(this.frameStream)
      .inputFormat('image2pipe')
      .inputFPS(this.fps)
      .videoCodec('libx264')
      .outputOptions([
        `-crf ${this.crf}`,
        '-preset fast',
        '-pix_fmt yuv420p',
        // Ensure even dimensions required by yuv420p
        '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-movflags +faststart',
      ])
      .fps(this.fps)
      .output(this.outputPath)
      .on('start', (cmd) => {
        this.onLog('info', `FFmpeg 启动`)
        this.onLog('info', cmd)
      })
      .on('stderr', (line) => {
        if (/frame=|fps=|Error|error/i.test(line)) {
          this.onLog('info', `FFmpeg: ${line}`)
        }
      })
      .on('error', (err) => {
        this.onLog('error', `FFmpeg 错误: ${err.message}`)
        this._resolve({ success: false, error: err.message })
      })
      .on('end', () => {
        this.onLog('info', 'FFmpeg 编码完成')
        this._resolve({ success: true })
      })

    this.proc.run()
    return this
  }

  /** Write one PNG buffer to the encode stream. Respects back-pressure. */
  writeFrame(pngBuffer) {
    return new Promise((resolve, reject) => {
      if (!this.frameStream.writable) {
        reject(new Error('encoder stream already closed'))
        return
      }
      const ok = this.frameStream.write(pngBuffer)
      if (ok) resolve()
      else this.frameStream.once('drain', resolve)
    })
  }

  /** Signal end of input and wait for FFmpeg to finish. */
  async finish() {
    this.frameStream.end()
    return this._promise
  }
}

module.exports = { Encoder }
