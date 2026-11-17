'use strict'

const path = require('path')
const { fileURLToPath } = require('url')

const APP_PAGES = new Set([
  'index.html', 'search.html', 'reminders.html', 'lockin.html', 'lockin-plan.html'
])

// Editors require Node access. Only bundled entry points may run in them.
function classifyNavigation(url, appDir) {
  try {
    const target = new URL(url)
    if (target.protocol === 'https:' || target.protocol === 'http:') return 'external'
    if (target.protocol !== 'file:' || target.hostname) return 'blocked'
    const filename = fileURLToPath(target)
    if (path.dirname(filename) !== path.resolve(appDir)) return 'blocked'
    return APP_PAGES.has(path.basename(filename)) ? 'local' : 'blocked'
  } catch {
    return 'blocked'
  }
}

module.exports = { classifyNavigation }
