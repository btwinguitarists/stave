'use strict'

// A bare auto-date title ("Thu Aug 13") says nothing in a list of notes.
// Wherever notes are listed, prefer the first real line of writing when the
// title was never customized.

const AUTO_DATE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$/
const MAX_LEN = 42

function firstContentLine(body) {
  if (!body) return ''
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^[-#>*•=~_\[\]() ]+$/.test(line)) continue // bare markup / rules
    return line.replace(/^#+\s*/, '').replace(/^[-•>]\s*/, '')
  }
  return ''
}

function displayTitleFrom({ title, body }) {
  const t = (title || '').trim()
  if (t && t !== 'untitled' && !AUTO_DATE.test(t)) return t
  const line = firstContentLine(body)
  if (line) return line.length > MAX_LEN ? line.slice(0, MAX_LEN).trimEnd() + '…' : line
  return t || 'untitled'
}

// For callers holding raw note markdown rather than a parsed tab.
function displayTitleFromRaw(raw) {
  const lines = (raw || '').split('\n')
  const titleLine = lines.find(l => l.startsWith('# '))
  const title = titleLine ? titleLine.slice(2).trim() : ''
  let body = ''
  let inBody = false
  for (const line of lines) {
    if (line === '## idea' || line === '## admin') { inBody = true; continue }
    if (inBody && /^## /.test(line)) break
    if (inBody) body += line + '\n'
  }
  return displayTitleFrom({ title, body })
}

module.exports = { displayTitleFrom, displayTitleFromRaw, firstContentLine }
