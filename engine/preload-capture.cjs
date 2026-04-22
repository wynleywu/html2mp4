'use strict'

// Runs inside the offscreen BrowserWindow BEFORE any page scripts.
// Only active when HTML2MP4_MODE=precise — injects fake clock + rAF control
// so the renderer can advance time frame-by-frame deterministically.

const mode = process.env.HTML2MP4_MODE || 'fast'
const frameMs = Number(process.env.HTML2MP4_FRAME_MS || '33.33')

if (mode === 'precise') {
  let _t = 0
  const _q = []
  let _id = 0

  const _Orig = Date
  class _FakeDate extends _Orig {
    constructor(...args) { if (args.length) super(...args); else super(_t) }
    static now() { return _t }
  }
  window.Date = _FakeDate

  Object.defineProperty(performance, 'now', { value: () => _t, configurable: true })

  window.requestAnimationFrame = (cb) => { const id = ++_id; _q.push({ id, cb }); return id }
  window.cancelAnimationFrame = (id) => {
    const i = _q.findIndex((e) => e.id === id)
    if (i !== -1) _q.splice(i, 1)
  }

  window.__html2mp4_tick = (frameIndex) => {
    _t = Math.round(frameIndex * frameMs)
    const batch = _q.splice(0)
    for (const { cb } of batch) { try { cb(_t) } catch { /* ignore */ } }
  }
}
