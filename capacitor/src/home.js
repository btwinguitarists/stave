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
  notes.forEach(n => {
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
    row.onclick = () => openNote(n)
    list.appendChild(row)
  })
  document.getElementById('pending-dot').style.display = StaveFS.pendingCount() ? 'block' : 'none'
  renderStorage()
}

function renderStorage() {
  const el = document.getElementById('storage')
  if (StaveFS.mode === 'folder') {
    el.textContent = `iCloud · ${StaveFS.folderName || 'Stave'}`
    el.classList.add('connected')
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

function openSheet() {
  document.getElementById('sheet-info').textContent = StaveFS.mode === 'folder'
    ? `Your pages live in "${StaveFS.folderName}" in iCloud Drive — the same folder Stave on your Mac writes to. Edits sync both ways.`
    : 'Your pages are stored on this device. Connect the "Stave" folder in iCloud Drive to write in the same notebook as your Mac.'
  document.getElementById('connect-btn').textContent = StaveFS.mode === 'folder'
    ? 'Choose a different folder' : 'Connect iCloud Drive folder'
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
