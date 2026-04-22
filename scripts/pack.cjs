'use strict'

/**
 * Manual Electron packaging script.
 * Copies node_modules/electron/dist + app source into dist_app/win-unpacked/
 * without needing electron-builder, code signing, or network access.
 *
 * Usage: node scripts/pack.cjs
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist')
const OUT = path.join(ROOT, 'dist_app', 'win-unpacked')
const APP = path.join(OUT, 'resources', 'app')

// Production deps to include (run: node -e "..." to regenerate)
const PROD_PKGS = new Set([
  'async',
  'fluent-ffmpeg',
  'isexe',
  'which',
  'ws',
])
// Scoped prod packages (full scope dir is copied)
const PROD_SCOPES = new Set(['@ffmpeg-installer'])

function log(msg) { process.stdout.write(msg + '\n') }

function copyDir(src, dest, filter) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (filter && !filter(s, entry.name)) continue
    if (entry.isDirectory()) copyDir(s, d, filter)
    else fs.copyFileSync(s, d)
  }
}

// ── 1. Clean output ──────────────────────────────────────────────────────────
log('Cleaning dist_app/win-unpacked…')
if (fs.existsSync(OUT)) {
  try {
    fs.rmSync(OUT, { recursive: true, force: true })
  } catch (e) {
    log(`  Warning: could not fully clean output dir (${e.message}). Proceeding anyway.`)
  }
}

// ── 2. Copy Electron runtime ──────────────────────────────────────────────────
log('Copying Electron runtime…')
copyDir(ELECTRON_DIST, OUT)

// Rename electron.exe → HTML2MP4.exe
const exeSrc = path.join(OUT, 'electron.exe')
const exeDst = path.join(OUT, 'HTML2MP4.exe')
if (fs.existsSync(exeSrc)) fs.renameSync(exeSrc, exeDst)

// ── 3. Copy app source files ──────────────────────────────────────────────────
log('Copying app source…')
fs.mkdirSync(APP, { recursive: true })
for (const dir of ['electron', 'engine', 'renderer']) {
  copyDir(path.join(ROOT, dir), path.join(APP, dir))
}
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(APP, 'package.json'))

// ── 4. Copy production node_modules ──────────────────────────────────────────
log('Copying production node_modules…')
const NM_SRC = path.join(ROOT, 'node_modules')
const NM_DEST = path.join(APP, 'node_modules')
fs.mkdirSync(NM_DEST, { recursive: true })

for (const entry of fs.readdirSync(NM_SRC)) {
  const src = path.join(NM_SRC, entry)
  const dest = path.join(NM_DEST, entry)

  if (entry.startsWith('@')) {
    // Scoped package dir — include entire scope if it's in our prod list
    if (PROD_SCOPES.has(entry)) {
      copyDir(src, dest)
    }
  } else if (PROD_PKGS.has(entry)) {
    copyDir(src, dest)
  }
}

// ── Done ──────────────────────────────────────────────────────────────────────
log('')
log('✓ Packaged successfully!')
log(`  Launch: ${exeDst}`)
log('')
