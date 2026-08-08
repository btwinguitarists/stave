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
  })
  if (!window.StaveFS.ready) window.StaveFS.init().catch(e => console.error('[lockin-ios] init failed:', e))
})()
