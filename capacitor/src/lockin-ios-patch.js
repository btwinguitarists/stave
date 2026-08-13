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
      const out = origSetRoom(room)
      // setRoom assigns body.className wholesale — restore our body classes.
      try { applyTypewriter() } catch (e) {}
      return out
    }
  }

  // Export — share sheet with the page as .md + rendered PDF.
  function doExport(x, y) {
    const title = (document.getElementById('doc-title') || {}).textContent || 'Stave note'
    const md = (document.getElementById('editor') || {}).value || ''
    window.__staveExport(title.trim(), md, x, y)
  }
  const toolbar = document.getElementById('fmt-toolbar')
  if (toolbar) {
    const btn = document.createElement('button')
    btn.className = 'fmt-btn'
    btn.id = 'ios-export'
    btn.textContent = 'export'
    btn.onclick = e => doExport(e.clientX, e.clientY)
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
  function cycleFontSize() {
    const cur = parseInt(localStorage.getItem('stave-fontsize') || '0', 10)
    const next = SIZES[(SIZES.indexOf(cur) + 1) % SIZES.length]
    localStorage.setItem('stave-fontsize', String(next))
    applyFontSize()
    return next
  }
  if (toolbar) {
    const aa = document.createElement('button')
    aa.className = 'fmt-btn'
    aa.id = 'ios-fontsize'
    aa.textContent = 'Aa'
    aa.onclick = cycleFontSize
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

  // Manual scrolling is sacred: while the writer browses their own page,
  // recentering waits. Typing re-engages it. Fingers on glass pause the glide.
  let twGoal = null, twGliding = false
  let twUserScrollAt = 0, twExpected = -1, twTouching = false

  document.addEventListener('scroll', e => {
    if (!e.target || e.target.id !== 'editor') return
    // Position, not timing, tells us whose scroll this is: the glide always
    // records exactly where it wrote; anything else is the writer's hand.
    if (Math.abs(e.target.scrollTop - twExpected) > 4) {
      twUserScrollAt = Date.now()
      twGoal = null  // kill any in-flight glide: the writer's hand wins
    }
  }, { capture: true, passive: true })
  document.addEventListener('touchstart', e => {
    if (e.target && e.target.id === 'editor') twTouching = true
  }, { capture: true, passive: true })
  document.addEventListener('touchend', () => { twTouching = false }, { capture: true, passive: true })
  document.addEventListener('touchcancel', () => { twTouching = false }, { capture: true, passive: true })

  function twGlide() {
    const ed = document.getElementById('editor')
    if (!ed || twGoal === null || twTouching ||
        localStorage.getItem('stave-typewriter') !== 'on') {
      twGliding = false
      return
    }
    const diff = twGoal - ed.scrollTop
    if (Math.abs(diff) < 0.75) {
      twExpected = twGoal
      ed.scrollTop = twGoal
      twGliding = false
      return
    }
    twExpected = ed.scrollTop + diff * 0.18
    ed.scrollTop = twExpected
    setTimeout(twGlide, 16)  // not rAF: frame callbacks stall in keyboard transitions
  }

  let twTimer = 0
  function typewriterScroll(force) {
    if (localStorage.getItem('stave-typewriter') !== 'on') return
    clearTimeout(twTimer)
    twTimer = setTimeout(() => {
      const ed = document.getElementById('editor')
      if (!ed) return
      // A live selection (double-tapped word) holds the view still — iOS
      // anchors its callout menu to the word, and typewriter tracking the
      // INSERTION point is the native behavior anyway.
      if (ed.selectionStart !== ed.selectionEnd) return
      // Browsing grace: a caret tap doesn't recenter for a while after a
      // manual scroll (ending a scroll with a tap IS a caret move on iOS).
      // Typing always recenters.
      if (force) twUserScrollAt = 0
      else if (Date.now() - twUserScrollAt < 1500) return
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
  function toggleTypewriter() {
    const on = localStorage.getItem('stave-typewriter') === 'on'
    localStorage.setItem('stave-typewriter', on ? 'off' : 'on')
    applyTypewriter()
  }
  if (toolbar) {
    const tw = document.createElement('button')
    tw.className = 'fmt-btn'
    tw.id = 'ios-typewriter'
    tw.textContent = 'typewriter'
    tw.onclick = toggleTypewriter
    toolbar.appendChild(tw)
  }

  // ── phone: a writing surface, not a shrunken desktop ──
  // Keep only the mark-making strip (☰ B I " • —); everything secondary
  // lives behind one native ⋯ sheet. The corner cluster reduces to the
  // word count.
  const phoneQuery = window.matchMedia('(max-width: 700px)')
  function applyPhoneMode() {
    // On <html>, not <body>: setRoom() assigns body.className wholesale.
    document.documentElement.classList.toggle('phone', phoneQuery.matches)
  }
  phoneQuery.addEventListener('change', applyPhoneMode)
  window.addEventListener('resize', applyPhoneMode, { passive: true })
  applyPhoneMode()
  if (toolbar) {
    const importBtn = [...toolbar.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'import')
    if (importBtn) importBtn.classList.add('phone-hidden')

    const more = document.createElement('button')
    more.className = 'fmt-btn'
    more.id = 'ios-more'
    more.textContent = '⋯'
    more.onclick = async () => {
      const cap = window.Capacitor
      const AS = cap && cap.Plugins && cap.Plugins.ActionSheet
      const native = AS && cap.isNativePlatform && cap.isNativePlatform()
      if (!native) { toggleTypewriter(); return }
      const twOn = localStorage.getItem('stave-typewriter') === 'on'
      const size = parseInt(localStorage.getItem('stave-fontsize') || '17', 10) || 17
      try {
        const { index } = await AS.showActions({
          title: 'Writing room',
          options: [
            { title: (twOn ? '✓ ' : '') + 'Typewriter mode' },
            { title: 'Text size ' + size + ' → bigger' },
            { title: 'Change room' },
            { title: 'Outline' },
            { title: 'Import text' },
            { title: 'Export page' },
            { title: 'Cancel', style: 'CANCEL' }
          ]
        })
        if (index === 0) toggleTypewriter()
        else if (index === 1) cycleFontSize()
        else if (index === 2) {
          const rooms = ['stave', 'manuscript', 'midnight', 'parchment', 'terminal']
          const r = await AS.showActions({
            title: 'Room',
            options: rooms.map(n => ({ title: n })).concat([{ title: 'Cancel', style: 'CANCEL' }])
          })
          if (r.index < rooms.length && typeof window.setRoom === 'function') window.setRoom(rooms[r.index])
        }
        else if (index === 3) { try { window.toggleOutline() } catch (e) {} }
        else if (index === 4) { if (importBtn) importBtn.click() }
        else if (index === 5) doExport()
      } catch (e) { console.error('[phone] sheet failed:', e) }
    }
    toolbar.appendChild(more)
  }
  // Delegated on document so it survives lockin re-creating the editor node.
  // Typing forces recentering (ends any browsing grace); caret taps respect it.
  for (const ev of ['input', 'keyup']) {
    document.addEventListener(ev, e => {
      if (e.target && e.target.id === 'editor') typewriterScroll(true)
    }, { passive: true })
  }
  document.addEventListener('focusin', e => {
    if (e.target && e.target.id === 'editor') typewriterScroll(true)
  })
  // NOT 'click': it fires before WebKit finishes placing the caret, so it
  // centers the PREVIOUS line. selectionchange fires after the caret lands.
  document.addEventListener('selectionchange', () => {
    const ed = document.getElementById('editor')
    if (ed && document.activeElement === ed) typewriterScroll(false)
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
