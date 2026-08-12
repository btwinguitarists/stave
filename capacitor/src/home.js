'use strict'
// Home screen: list pages, open in Lock In, create, search, storage sheet.
const C = window.StaveCore

function formatDateTitle(d) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`
}

function noteType(raw) {
  const m = raw.match(/^type: (\w+)$/m)
  return m ? m[1] : 'write'
}

function loadNotes() {
  const files = [...StaveFS.list('write'), ...StaveFS.list('longform')]
    .filter(f => f.path.endsWith('.md'))
    .sort((a, b) => b.mtime - a.mtime)
  return files.map(f => {
    const raw = StaveFS.read(f.path)
    if (raw === null) return null
    const mode = noteType(raw)
    if (mode !== 'write' && mode !== 'longform') return null
    const parsed = C.parseNote(raw, mode)
    const snippet = (parsed.idea || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 2).join(' · ')
    return { path: f.path, mtime: f.mtime, mode, raw, title: parsed.title || 'untitled', idea: parsed.idea || '', snippet }
  }).filter(Boolean)
}

function fmtDate(ms) {
  const d = new Date(ms)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}

function render() {
  const q = document.getElementById('search').value.trim().toLowerCase()
  const notes = loadNotes().filter(n => !q || n.title.toLowerCase().includes(q) || n.raw.toLowerCase().includes(q))
  const list = document.getElementById('list')
  list.innerHTML = ''
  document.getElementById('empty').style.display = notes.length ? 'none' : 'block'
  notes.forEach(n => list.appendChild(buildRow(n)))
  document.getElementById('pending-dot').style.display = StaveFS.pendingCount() ? 'block' : 'none'
  renderStorage()
}

function renderStorage() {
  const el = document.getElementById('storage')
  el.style.color = ''
  if (StaveFS.mode === 'folder') {
    el.textContent = `iCloud · ${StaveFS.folderName || 'Stave'}`
    el.classList.add('connected')
  } else if (StaveFS.mode === 'folder-lost') {
    el.textContent = '⚠ reconnect iCloud folder'
    el.style.color = 'var(--accent)'
    el.classList.remove('connected')
  } else {
    el.textContent = 'on this iPad'
    el.classList.remove('connected')
  }
}

function openNote(n) {
  sessionStorage.setItem('stave-open', JSON.stringify({
    filepath: n.path, mode: n.mode, title: n.title, content: n.idea, recordings: []
  }))
  location.href = 'lockin.html'
}

function newNote() {
  const now = new Date()
  const stamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const rel = `write/${stamp}.md`
  const tab = C.emptyTab('write')
  tab.title = formatDateTitle(now)
  if (StaveFS.read(rel) === null) StaveFS.write(rel, C.serializeTab(tab))
  sessionStorage.setItem('stave-open', JSON.stringify({
    filepath: rel, mode: 'write', title: tab.title, content: '', recordings: []
  }))
  location.href = 'lockin.html'
}

// ── page rows: swipe-left for Export/Delete (the primary iOS gesture),
//    long-press for the native action sheet as a secondary path ──
const REVEAL = 160
let openRow = null

function closeOpenRow() {
  if (openRow) { openRow.style.transform = ''; openRow._open = false; openRow = null }
}

async function confirmDelete(n, wrap) {
  const cap = window.Capacitor
  const DL = cap && cap.Plugins && cap.Plugins.Dialog
  let go = false
  if (DL && cap.isNativePlatform && cap.isNativePlatform()) {
    const { value } = await DL.confirm({
      title: 'Delete this page?',
      message: `“${n.title}” will be gone for good.`,
      okButtonTitle: 'Delete',
      cancelButtonTitle: 'Cancel'
    })
    go = value
  } else {
    go = window.confirm(`Delete “${n.title}”? This can’t be undone.`)
  }
  if (!go) { closeOpenRow(); return }
  wrap.style.maxHeight = wrap.offsetHeight + 'px'
  requestAnimationFrame(() => wrap.classList.add('collapsing'))
  setTimeout(() => { StaveFS.remove(n.path); render() }, 230)
}

function buildRow(n) {
  const wrap = document.createElement('div')
  wrap.className = 'swipe-wrap'
  const actions = document.createElement('div')
  actions.className = 'swipe-actions'
  const exp = document.createElement('button')
  exp.className = 'swipe-btn export'
  exp.textContent = 'Export'
  exp.onclick = () => { closeOpenRow(); window.__staveExport(n.title, n.idea) }
  const del = document.createElement('button')
  del.className = 'swipe-btn delete'
  del.textContent = 'Delete'
  del.onclick = () => confirmDelete(n, wrap)
  actions.append(exp, del)

  const row = document.createElement('div')
  row.className = 'note' + (n.mode === 'longform' ? ' longform' : '')
  row.innerHTML = `
    <div class="note-top">
      <span class="note-dot">✦</span>
      <span class="note-title"></span>
      <span class="note-date">${fmtDate(n.mtime)}</span>
    </div>
    <div class="note-snippet"></div>`
  row.querySelector('.note-title').textContent = n.title
  row.querySelector('.note-snippet').textContent = n.snippet

  let startX = 0, startY = 0, dx = 0, horiz = null
  let pressTimer = null, longPressed = false
  row.addEventListener('touchstart', e => {
    const t = e.touches[0]
    startX = t.clientX; startY = t.clientY; dx = row._open ? -REVEAL : 0; horiz = null
    longPressed = false
    pressTimer = setTimeout(() => {
      if (horiz === null) { longPressed = true; openNoteSheet(n) }
    }, 500)
    row.classList.add('swiping')
  }, { passive: true })
  row.addEventListener('touchmove', e => {
    const t = e.touches[0]
    const mx = t.clientX - startX, my = t.clientY - startY
    if (horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      horiz = Math.abs(mx) > Math.abs(my)
      clearTimeout(pressTimer)
      if (horiz && openRow && openRow !== row) closeOpenRow()
    }
    if (!horiz) return
    e.preventDefault()
    dx = Math.min(0, (row._open ? -REVEAL : 0) + mx)
    if (dx < -REVEAL) dx = -REVEAL + (dx + REVEAL) * 0.25
    row.style.transform = `translateX(${dx}px)`
  }, { passive: false })
  const settle = () => {
    clearTimeout(pressTimer)
    row.classList.remove('swiping')
    if (horiz) {
      row._open = dx < -REVEAL / 2
      row.style.transform = row._open ? `translateX(${-REVEAL}px)` : ''
      openRow = row._open ? row : (openRow === row ? null : openRow)
    }
  }
  row.addEventListener('touchend', settle, { passive: true })
  row.addEventListener('touchcancel', settle, { passive: true })
  row.oncontextmenu = e => { e.preventDefault(); openNoteSheet(n) }
  row.onclick = () => {
    if (longPressed || horiz) return
    if (row._open || openRow) { closeOpenRow(); return }
    openNote(n)
  }

  wrap.append(actions, row)
  return wrap
}

// ── per-page options (long-press) ──
// On device this is the real iOS action sheet + alert (Capacitor ActionSheet
// and Dialog plugins); the HTML sheet below is only the browser-dev fallback.
let sheetNote = null

async function openNoteSheet(n) {
  const cap = window.Capacitor
  const AS = cap && cap.Plugins && cap.Plugins.ActionSheet
  const DL = cap && cap.Plugins && cap.Plugins.Dialog
  if (AS && DL && cap.isNativePlatform && cap.isNativePlatform()) {
    try {
      const { index } = await AS.showActions({
        title: n.title,
        options: [
          { title: 'Write' },
          { title: 'Export' },
          { title: 'Delete', style: 'DESTRUCTIVE' },
          { title: 'Cancel', style: 'CANCEL' }
        ]
      })
      if (index === 0) { openNote(n) }
      else if (index === 1) { window.__staveExport(n.title, n.idea) }
      else if (index === 2) {
        const { value } = await DL.confirm({
          title: 'Delete this page?',
          message: `“${n.title}” will be gone for good.`,
          okButtonTitle: 'Delete',
          cancelButtonTitle: 'Cancel'
        })
        if (value) { StaveFS.remove(n.path); render() }
      }
    } catch (e) { console.error('[home] native sheet failed:', e) }
    return
  }
  sheetNote = n
  document.getElementById('note-sheet-title').textContent = n.title.toUpperCase()
  const del = document.getElementById('note-sheet-delete')
  del.textContent = 'Delete'
  del.dataset.armed = ''
  document.getElementById('note-sheet-back').style.display = 'block'
  document.getElementById('note-sheet').style.transform = 'none'
}

function closeNoteSheet() {
  sheetNote = null
  document.getElementById('note-sheet-back').style.display = 'none'
  document.getElementById('note-sheet').style.transform = 'translateY(105%)'
}

function noteSheetOpen() {
  const n = sheetNote
  closeNoteSheet()
  if (n) openNote(n)
}

function noteSheetExport() {
  const n = sheetNote
  closeNoteSheet()
  if (n) window.__staveExport(n.title, n.idea)
}

function noteSheetDelete() {
  const del = document.getElementById('note-sheet-delete')
  if (!del.dataset.armed) {
    del.dataset.armed = '1'
    del.textContent = 'Really delete? This can’t be undone.'
    return
  }
  const n = sheetNote
  closeNoteSheet()
  if (n) { StaveFS.remove(n.path); render() }
}

function openSheet() {
  document.getElementById('sheet-info').textContent = StaveFS.mode === 'folder'
    ? `Your pages live in "${StaveFS.folderName}" in iCloud Drive — the same folder Stave on your Mac writes to. Edits sync both ways.`
    : StaveFS.mode === 'folder-lost'
      ? 'iPadOS dropped this app’s permission to your iCloud folder, so recent pages were kept safely on this device instead. Reconnect the folder and everything here is carried over — pages that changed in both places are kept as "(recovered)" copies, never overwritten.'
      : 'Your pages are stored on this device. Connect the "Stave" folder in iCloud Drive to write in the same notebook as your Mac.'
  document.getElementById('connect-btn').textContent = StaveFS.mode === 'folder'
    ? 'Choose a different folder' : StaveFS.mode === 'folder-lost' ? 'Reconnect iCloud folder' : 'Connect iCloud Drive folder'
  document.getElementById('sheet-back').style.display = 'block'
  document.getElementById('sheet').classList.add('open')
}

function closeSheet() {
  document.getElementById('sheet-back').style.display = 'none'
  document.getElementById('sheet').classList.remove('open')
}

async function connectFolder() {
  try {
    await StaveFS.pickFolder()
    closeSheet()
    render()
  } catch (e) {
    console.error('[home] pickFolder failed:', e)
    closeSheet()
  }
}

document.getElementById('new-note').onclick = newNote
document.getElementById('search').oninput = render
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && StaveFS.ready) StaveFS.init().then(render)
})

sessionStorage.removeItem('stave-open')
StaveFS.init().then(render).catch(e => {
  console.error('[home] init failed:', e)
  document.getElementById('empty').style.display = 'block'
})
