'use strict'

// Local, out-of-iCloud version history. Every note accumulates rotating
// snapshots under Application Support so no sync conflict, crash, or
// accidental deletion can destroy writing that once reached disk.
// Text snapshots are tiny; a heavily-edited note costs ~1–2 MB total.

const fs = require('fs')
const path = require('path')
const os = require('os')

const MIN_INTERVAL_MS  = 5 * 60 * 1000 // steady-state cadence per note
const SHRINK_THRESHOLD = 200           // chars lost that force a pre-write snapshot
const MAX_PER_NOTE     = 200
const MAX_AGE_DAYS     = 90

function historyRoot() {
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Application Support', 'Stave', 'history')
  if (process.platform === 'win32')
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Stave', 'history')
  return path.join(os.homedir(), '.stave', 'history')
}

// <root>/<mode dir>/<note name without .md>/<local timestamp>.md
function historyDirFor(filepath) {
  const mode = path.basename(path.dirname(filepath))
  const note = path.basename(filepath).replace(/\.md$/, '')
  return path.join(historyRoot(), mode, note)
}

function stampName(d) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.md`
}

// Pure policy: is a routine (throttled) snapshot due?
function isSnapshotDue({ lastSnapshotAt, now, minIntervalMs = MIN_INTERVAL_MS }) {
  if (lastSnapshotAt === undefined || lastSnapshotAt === null) return true
  return (now - lastSnapshotAt) >= minIntervalMs
}

// Pure policy: did this write lose enough text that the previous disk
// content must be captured before it is overwritten?
function isBigShrink({ previousLength, nextLength, threshold = SHRINK_THRESHOLD }) {
  return (previousLength || 0) - (nextLength || 0) >= threshold
}

// Pure policy: given [{name, mtimeMs}], which snapshots should be deleted?
function selectPrunable(entries, { maxPerNote = MAX_PER_NOTE, maxAgeDays = MAX_AGE_DAYS, now = Date.now() } = {}) {
  const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000
  const sorted = [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs)
  return sorted.filter((e, i) => i >= maxPerNote || e.mtimeMs < cutoff).map(e => e.name)
}

function writeSnapshot(filepath, content) {
  const dir = historyDirFor(filepath)
  fs.mkdirSync(dir, { recursive: true })
  let target = path.join(dir, stampName(new Date()))
  let n = 2
  while (fs.existsSync(target)) {
    target = target.replace(/(?:-\d+)?\.md$/, `-${n++}.md`)
  }
  fs.writeFileSync(target, content, 'utf8')
  return target
}

// In-memory throttle per filepath, seeded from disk on first touch so a
// relaunch doesn't restart the cadence from zero.
const lastSnapshotAt = new Map()

function seedFromDisk(filepath) {
  try {
    const dir = historyDirFor(filepath)
    const newest = fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .reduce((best, f) => {
        const t = fs.statSync(path.join(dir, f)).mtimeMs
        return t > best ? t : best
      }, 0)
    lastSnapshotAt.set(filepath, newest || null)
  } catch (e) {
    lastSnapshotAt.set(filepath, null)
  }
}

// Routine snapshot of content that just reached the note file. Throttled.
function maybeSnapshot(filepath, content) {
  try {
    if (!filepath || !content || !content.trim()) return null
    if (!lastSnapshotAt.has(filepath)) seedFromDisk(filepath)
    if (!isSnapshotDue({ lastSnapshotAt: lastSnapshotAt.get(filepath), now: Date.now() })) return null
    const target = writeSnapshot(filepath, content)
    lastSnapshotAt.set(filepath, Date.now())
    return target
  } catch (e) {
    console.error('[history] snapshot failed:', e)
    return null
  }
}

// Unthrottled snapshot for moments that must be captured: the disk content
// an incoming write is about to shrink away, or a note about to be trashed.
function snapshotNow(filepath, content) {
  try {
    if (!filepath || !content || !content.trim()) return null
    const target = writeSnapshot(filepath, content)
    lastSnapshotAt.set(filepath, Date.now())
    return target
  } catch (e) {
    console.error('[history] snapshot failed:', e)
    return null
  }
}

function pruneHistory() {
  try {
    const root = historyRoot()
    if (!fs.existsSync(root)) return
    fs.readdirSync(root).forEach(mode => {
      const modeDir = path.join(root, mode)
      if (!fs.statSync(modeDir).isDirectory()) return
      fs.readdirSync(modeDir).forEach(note => {
        const noteDir = path.join(modeDir, note)
        if (!fs.statSync(noteDir).isDirectory()) return
        const entries = fs.readdirSync(noteDir)
          .filter(f => f.endsWith('.md'))
          .map(f => ({ name: f, mtimeMs: fs.statSync(path.join(noteDir, f)).mtimeMs }))
        selectPrunable(entries).forEach(name => {
          try { fs.unlinkSync(path.join(noteDir, name)) } catch (e) {}
        })
        if (!fs.readdirSync(noteDir).length) {
          try { fs.rmdirSync(noteDir) } catch (e) {}
        }
      })
    })
  } catch (e) {
    console.error('[history] prune failed:', e)
  }
}

module.exports = {
  historyRoot, historyDirFor,
  isSnapshotDue, isBigShrink, selectPrunable,
  maybeSnapshot, snapshotNow, pruneHistory,
  SHRINK_THRESHOLD
}
