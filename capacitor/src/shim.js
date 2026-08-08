'use strict'
// Electron-environment shim for iOS. Lockin.html and home.js run unmodified
// against this instead of Electron: require() returns facades, ipcRenderer is
// an in-page bus, and the filesystem is a write-through cache over the
// StaveFolder native plugin (app Documents by default, or a user-picked
// iCloud Drive folder via security-scoped bookmark).

// ── native bridge (absent in plain-browser dev mode) ──
// No bundler here, so use the Plugins proxy the native bridge injects
// (registerPlugin only exists inside @capacitor/core builds).
const _cap = window.Capacitor
const StaveNative = (_cap && _cap.Plugins && typeof _cap.isNativePlatform === 'function' && _cap.isNativePlatform())
  ? _cap.Plugins.StaveFolder
  : null

// ── path mapping ──
// Cody's code builds Mac-style absolute paths (…/com~apple~CloudDocs/Stave/…).
// Everything under the Stave root becomes a relative key: 'write/x.md'.
function mapPath(p) {
  if (!p) return p
  const i = p.indexOf('/Stave/')
  let rel = i !== -1 ? p.slice(i + '/Stave/'.length) : p
  return rel.replace(/^\/+/, '').replace(/\/+/g, '/')
}

// ── write-through cache with persistent retry journal ──
const StaveFS = {
  cache: {},          // rel -> { content, mtime (ms) }
  mode: 'local',      // 'local' | 'folder'
  folderName: '',
  ready: false,
  _inflight: [],
  _listeners: [],

  async init() {
    // Replay any writes a previous page unload dropped before native ack.
    let journal = {}
    try { journal = JSON.parse(localStorage.getItem('stave-pending-writes') || '{}') } catch (e) {}

    if (StaveNative) {
      const snap = await StaveNative.snapshot()
      this.mode = snap.mode
      this.folderName = snap.folderName || ''
      this.cache = {}
      for (const f of snap.files || []) this.cache[f.path] = { content: f.content, mtime: f.mtime || Date.now() }
    } else {
      // Browser dev mode: localStorage-backed store.
      this.mode = 'local'
      try { this.cache = JSON.parse(localStorage.getItem('stave-dev-fs') || '{}') } catch (e) { this.cache = {} }
    }

    for (const [rel, content] of Object.entries(journal)) this.write(rel, content)
    this.ready = true
    this._listeners.forEach(fn => fn())
  },

  onReady(fn) { this.ready ? fn() : this._listeners.push(fn) },

  read(rel) {
    const e = this.cache[rel]
    return e ? e.content : null
  },

  list(prefix) {
    return Object.keys(this.cache).filter(k => k.startsWith(prefix + '/'))
      .map(k => ({ path: k, mtime: this.cache[k].mtime }))
      .sort((a, b) => b.mtime - a.mtime)
  },

  _journal(rel, content) {
    try {
      const j = JSON.parse(localStorage.getItem('stave-pending-writes') || '{}')
      if (content === undefined) delete j[rel]; else j[rel] = content
      localStorage.setItem('stave-pending-writes', JSON.stringify(j))
    } catch (e) {}
  },

  write(rel, content) {
    this.cache[rel] = { content, mtime: Date.now() }
    this._journal(rel, content)
    if (StaveNative) {
      const p = StaveNative.writeFile({ path: rel, data: content })
        .then(() => this._journal(rel, undefined))
        .catch(err => console.error('[StaveFS] native write failed, journaled for retry:', rel, err))
      this._inflight.push(p)
      if (this._inflight.length > 20) this._inflight.splice(0, this._inflight.length - 20)
    } else {
      try { localStorage.setItem('stave-dev-fs', JSON.stringify(this.cache)) } catch (e) {}
      this._journal(rel, undefined)
    }
  },

  remove(rel) {
    delete this.cache[rel]
    this._journal(rel, undefined)
    if (StaveNative) StaveNative.deleteFile({ path: rel }).catch(e => console.error('[StaveFS] delete failed:', rel, e))
    else try { localStorage.setItem('stave-dev-fs', JSON.stringify(this.cache)) } catch (e) {}
  },

  async flush(timeoutMs) {
    await Promise.race([
      Promise.allSettled(this._inflight),
      new Promise(r => setTimeout(r, timeoutMs || 1500))
    ])
  },

  pendingCount() {
    try { return Object.keys(JSON.parse(localStorage.getItem('stave-pending-writes') || '{}')).length }
    catch (e) { return 0 }
  },

  async pickFolder() {
    if (!StaveNative) return { mode: 'local' }
    const res = await StaveNative.pickFolder()
    if (res && res.mode === 'folder') {
      // Migrate local notes into the picked folder (skip paths that already exist there).
      const local = { ...this.cache }
      await this.init()
      for (const [rel, e] of Object.entries(local)) {
        if (rel.endsWith('.md') && !this.cache[rel]) this.write(rel, e.content)
      }
    }
    return res
  }
}
window.StaveFS = StaveFS

// ── ipcRenderer bus ──
// (exposed as window.__staveBus for lockin-ios-patch.js)
const bus = {
  _handlers: {},
  on(channel, cb) { (this._handlers[channel] = this._handlers[channel] || []).push(cb) },
  emit(channel, ...args) { (this._handlers[channel] || []).forEach(cb => { try { cb({ sender: bus }, ...args) } catch (e) { console.error('[bus]', channel, e) } }) },
  send(channel, ...args) { const h = sendHandlers[channel]; h ? h(...args) : console.warn('[bus] unhandled send:', channel) }
}
window.__staveBus = bus

// ── drawer engine (bible + rhymes local; WordNet synonyms not on iOS) ──
let dataLoading = null
function ensureDrawerData() {
  if (dataLoading) return dataLoading
  dataLoading = Promise.all([
    window.StaveCore.hasCmu() ? null : fetch('cmudict.json').then(r => r.json()).then(d => window.StaveCore.setCmu(d)),
    window.StaveCore.hasBible() ? null : fetch('bible-index.json').then(r => r.json()).then(d => window.StaveCore.setBible(d))
  ]).catch(e => { console.error('[drawer] data load failed:', e); dataLoading = null })
  return dataLoading
}

function drawerLookup(word) {
  const C = window.StaveCore
  const clean = String(word || '').replace(/[^a-z]/gi, '').toLowerCase()
  if (clean.length < 2) return
  ensureDrawerData().then(() => {
    const { perfect, near } = C.findRhymes(clean)
    const wordSig = C.getRhymeSignature(clean)
    const rhymesWith = w => { const s = C.getRhymeSignature(w); return !!(wordSig && s && s === wordSig) }
    const songs = Object.values(C.SONGS_WORDS).map(g => ({
      label: g.label,
      synonyms: g.synonyms.map(w => ({ word: w, rhymes: rhymesWith(w.split(' ')[0]) })),
      expand: g.expand
    }))
    const songMatches = C.findWordWebMatches(clean)
    const wordweb = (songMatches.length ? songMatches : C.getPaletteCategories(clean)).map(g => ({
      label: g.label,
      words: g.words || [...(g.synonyms || []), ...(g.expand || [])],
      fromPalette: !songMatches.length
    }))
    bus.emit('drawer-results', {
      word: clean,
      syllables: C.countSyllables(clean),
      rhymes: { perfect, near },
      synonyms: [],
      wordweb, songs,
      scripture: C.bible(clean)
    })
  })
}

// ── send-channel implementations (what main.js did on the Mac) ──
const sendHandlers = {
  'lockin-save': ({ filepath, content }) => StaveFS.write(mapPath(filepath), content),
  'lockin-drawer-lookup': word => drawerLookup(word),
  'flush-save-done': () => {},
  'lockin-recordings-update': () => {},
  'close-lockin': async () => {
    try { if (typeof window.saveNow === 'function') window.saveNow() } catch (e) {}
    await StaveFS.flush()
    location.replace('index.html')
  },
  'import-file-dialog': () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.txt,.markdown,text/plain,text/markdown'
    input.onchange = () => {
      const f = input.files && input.files[0]
      if (!f) { bus.emit('import-file-result', null); return }
      const reader = new FileReader()
      reader.onload = () => bus.emit('import-file-result', { content: String(reader.result), basename: f.name })
      reader.onerror = () => bus.emit('import-file-result', null)
      reader.readAsText(f)
    }
    input.oncancel = () => bus.emit('import-file-result', null)
    input.click()
  }
}

// ── node-module facades ──
const fsFacade = {
  readFileSync(p) {
    const c = StaveFS.read(mapPath(p))
    if (c === null) { const err = new Error('ENOENT: ' + p); err.code = 'ENOENT'; throw err }
    return c
  },
  writeFileSync(p, data) {
    if (typeof data !== 'string') { console.warn('[fs shim] binary write ignored:', p); return }
    StaveFS.write(mapPath(p), data)
  },
  existsSync(p) { return StaveFS.read(mapPath(p)) !== null },
  mkdirSync() {},
  unlinkSync(p) { StaveFS.remove(mapPath(p)) },
  statSync(p) {
    const rel = mapPath(p)
    const e = StaveFS.cache[rel]
    if (!e) { const err = new Error('ENOENT: ' + p); err.code = 'ENOENT'; throw err }
    return { mtime: new Date(e.mtime), size: e.content.length }
  },
  readdirSync(p) {
    const prefix = mapPath(p).replace(/\/+$/, '')
    return StaveFS.list(prefix).map(f => f.path.slice(prefix.length + 1)).filter(n => !n.includes('/'))
  }
}

const pathFacade = {
  sep: '/',
  join(...parts) { return parts.filter(Boolean).join('/').replace(/\/+/g, '/') },
  basename(p) { return String(p).split('/').filter(Boolean).pop() || '' },
  dirname(p) { const a = String(p).split('/'); a.pop(); return a.join('/') || '/' },
  resolve(p) { return p }
}

const modules = {
  electron: { ipcRenderer: bus },
  fs: fsFacade,
  path: pathFacade,
  os: { homedir: () => '/home', tmpdir: () => '/tmp' }
}

window.require = name => {
  if (modules[name]) return modules[name]
  throw new Error('shim: module not available on iOS: ' + name)
}

// Minimal Buffer stand-in (recordings are hidden on iOS; this only prevents
// a stray reference from throwing at parse/run time).
if (!window.Buffer) window.Buffer = { from: x => x, isBuffer: () => false }
