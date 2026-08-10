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

  // Typewriter mode — the active line rides near the vertical center,
  // gliding there on a critically-damped spring instead of jumping.
  let twMirror = null, twMark = null
  function caretTop(ed) {
    const cs = getComputedStyle(ed)
    if (!twMirror) {
      twMirror = document.createElement('div')
      twMirror.style.position = 'absolute'
      twMirror.style.left = '-99999px'
      twMirror.style.top = '0'
      twMirror.style.visibility = 'hidden'
      twMirror.style.whiteSpace = 'pre-wrap'
      twMirror.style.wordWrap = 'break-word'
      twMark = document.createElement('span')
      twMark.textContent = '​'
      document.body.appendChild(twMirror)
    }
    for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
                     'letterSpacing', 'paddingLeft', 'paddingRight']) {
      twMirror.style[p] = cs[p]
    }
    twMirror.style.width = ed.clientWidth + 'px'
    twMirror.textContent = ed.value.slice(0, ed.selectionStart)
    twMirror.appendChild(twMark)
    return twMark.offsetTop + (parseFloat(cs.paddingTop) || 0)
  }

  let twGoal = null, twGliding = false
  function twGlide() {
    const ed = document.getElementById('editor')
    if (!ed || twGoal === null || localStorage.getItem('stave-typewriter') !== 'on') {
      twGliding = false
      return
    }
    const diff = twGoal - ed.scrollTop
    if (Math.abs(diff) < 0.75) {
      ed.scrollTop = twGoal
      twGliding = false
      return
    }
    ed.scrollTop = ed.scrollTop + diff * 0.18
    setTimeout(twGlide, 16)  // not rAF: frame callbacks stall in keyboard transitions
  }

  let twTimer = 0
  function typewriterScroll() {
    if (localStorage.getItem('stave-typewriter') !== 'on') return
    clearTimeout(twTimer)
    twTimer = setTimeout(() => {
      const ed = document.getElementById('editor')
      if (!ed) return
      const caretY = caretTop(ed)
      let visible = ed.clientHeight
      if (window.visualViewport) {
        const edTop = Math.max(0, ed.getBoundingClientRect().top)
        visible = Math.min(visible, Math.max(120, window.visualViewport.height - edTop))
      }
      const target = Math.max(0, caretY - visible * 0.42)
      if (Math.abs(ed.scrollTop - target) <= 4) return
      twGoal = target
      if (!twGliding) { twGliding = true; setTimeout(twGlide, 0) }
    }, 24)
  }
  window.__twState = () => ({ goal: twGoal, gliding: twGliding })

  // iOS pans the whole viewport to "help" reveal focused inputs; our caret is
  // always centered, so any pan is pure fight — pin the window still.
  window.addEventListener('scroll', () => {
    if (window.scrollY) window.scrollTo(0, 0)
  }, { passive: true })
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', typewriterScroll)
  }
  window.__twScroll = typewriterScroll
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
  // Delegated on document so it survives lockin re-creating the editor node.
  for (const ev of ['input', 'keyup', 'click']) {
    document.addEventListener(ev, e => {
      if (e.target && e.target.id === 'editor') typewriterScroll()
    }, { passive: true })
  }
  document.addEventListener('focusin', e => {
    if (e.target && e.target.id === 'editor') typewriterScroll()
  })

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
