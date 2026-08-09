'use strict'
// Runs after lockin.html's own script. Hands it the note the home screen
// chose, adds a touch exit, and makes the room choice stick per device.
;(function () {
  const bus = window.__staveBus

  // Persist room picks (Mac resets each open; on iPad it should remember).
  const origSetRoom = window.setRoom
  if (typeof origSetRoom === 'function') {
    window.setRoom = function (room) {
      try { localStorage.setItem('stave-room', room) } catch (e) {}
      return origSetRoom(room)
    }
  }

  // Export button — share sheet with the page as .md + rendered PDF.
  const toolbar = document.getElementById('fmt-toolbar')
  if (toolbar) {
    const btn = document.createElement('button')
    btn.className = 'fmt-btn'
    btn.id = 'ios-export'
    btn.textContent = 'export'
    btn.onclick = e => {
      const title = (document.getElementById('doc-title') || {}).textContent || 'Stave note'
      const md = (document.getElementById('editor') || {}).value || ''
      window.__staveExport(title.trim(), md, e.clientX, e.clientY)
    }
    toolbar.appendChild(btn)
  }

  // The songwriter-drawer toggle belongs on the toolbar, not floating mid-air.
  const drawerToggle = document.getElementById('drawer-toggle')
  if (toolbar && drawerToggle) {
    drawerToggle.classList.add('in-toolbar')
    toolbar.insertBefore(drawerToggle, toolbar.firstChild)
  }

  // Aa — visual font size (display preference, not markdown), persisted.
  const SIZES = [15, 17, 19, 21]
  function applyFontSize() {
    const px = parseInt(localStorage.getItem('stave-fontsize') || '0', 10)
    const ed = document.getElementById('editor')
    if (ed) ed.style.fontSize = SIZES.includes(px) ? px + 'px' : ''
  }
  if (toolbar) {
    const aa = document.createElement('button')
    aa.className = 'fmt-btn'
    aa.id = 'ios-fontsize'
    aa.textContent = 'Aa'
    aa.onclick = () => {
      const cur = parseInt(localStorage.getItem('stave-fontsize') || '0', 10)
      const next = SIZES[(SIZES.indexOf(cur) + 1) % SIZES.length]
      localStorage.setItem('stave-fontsize', String(next))
      applyFontSize()
    }
    toolbar.appendChild(aa)
  }

  // Typewriter mode — the active line rides near the vertical center.
  function caretTop(ed) {
    const cs = getComputedStyle(ed)
    const m = document.createElement('div')
    for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
                     'letterSpacing', 'paddingLeft', 'paddingRight', 'borderWidth']) {
      m.style[p] = cs[p]
    }
    m.style.width = ed.clientWidth + 'px'
    m.style.position = 'absolute'
    m.style.visibility = 'hidden'
    m.style.whiteSpace = 'pre-wrap'
    m.style.wordWrap = 'break-word'
    m.textContent = ed.value.slice(0, ed.selectionStart)
    const mark = document.createElement('span')
    mark.textContent = '​'
    m.appendChild(mark)
    document.body.appendChild(m)
    const y = mark.offsetTop
    m.remove()
    return y
  }
  let twRaf = 0
  function typewriterScroll() {
    if (localStorage.getItem('stave-typewriter') !== 'on') return
    cancelAnimationFrame(twRaf)
    twRaf = requestAnimationFrame(() => {
      const ed = document.getElementById('editor')
      const col = document.getElementById('write-column')
      if (!ed || !col) return
      const target = ed.offsetTop + caretTop(ed) - col.clientHeight * 0.42
      if (Math.abs(col.scrollTop - target) > 14) col.scrollTop = Math.max(0, target)
    })
  }
  function applyTypewriter() {
    const on = localStorage.getItem('stave-typewriter') === 'on'
    document.body.classList.toggle('tw-on', on)
    const b = document.getElementById('ios-typewriter')
    if (b) b.classList.toggle('tw-active', on)
    if (on) typewriterScroll()
  }
  if (toolbar) {
    const tw = document.createElement('button')
    tw.className = 'fmt-btn'
    tw.id = 'ios-typewriter'
    tw.textContent = 'typewriter'
    tw.onclick = () => {
      const on = localStorage.getItem('stave-typewriter') === 'on'
      localStorage.setItem('stave-typewriter', on ? 'off' : 'on')
      applyTypewriter()
    }
    toolbar.appendChild(tw)
  }
  const edEl = document.getElementById('editor')
  if (edEl) {
    for (const ev of ['input', 'keyup', 'click', 'focus']) {
      edEl.addEventListener(ev, typewriterScroll, { passive: true })
    }
  }

  // Touch exit button (Escape on Mac).
  const exit = document.createElement('button')
  exit.id = 'ios-exit'
  exit.textContent = '‹'
  exit.title = 'Back to your pages'
  exit.onclick = () => { try { window.exitLockIn() } catch (e) { location.replace('index.html') } }
  document.body.appendChild(exit)

  // Feed lockin the chosen note once the file cache is live.
  let payload = null
  try { payload = JSON.parse(sessionStorage.getItem('stave-open') || 'null') } catch (e) {}
  if (!payload) { location.replace('index.html'); return }

  window.StaveFS.onReady(() => {
    bus.emit('init-lockin', payload)
    const saved = localStorage.getItem('stave-room')
    if (saved && typeof window.setRoom === 'function') {
      try { window.setRoom(saved) } catch (e) {}
    }
    applyFontSize()
    applyTypewriter()
    // Warm the drawer's word data so the first lookup is instant and honest.
    setTimeout(() => { try { window.__stavePreloadDrawer() } catch (e) {} }, 800)
  })
  if (!window.StaveFS.ready) window.StaveFS.init().catch(e => console.error('[lockin-ios] init failed:', e))
})()
