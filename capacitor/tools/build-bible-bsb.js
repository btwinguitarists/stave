#!/usr/bin/env node
// Build the scripture concordance from the Berean Standard Bible (public
// domain) instead of the WEB — same index shape as Cody's build-index.js
// (word -> [{ref, text}]), same skip rules, so lockin's drawer needs no
// changes. Source: the tab-separated BSB text in Ben's translation repo.
const fs = require('fs')
const os = require('os')
const path = require('path')

const SRC = path.join(os.homedir(), 'thai-bible-ai', 'sources', 'bsb-text', 'bsb.txt')
const SKIP = new Set(['the','and','of','to','a','in','that','he','was','his','for','it','with','as','be','at','by','are','this','or','an','but','not','from','all','have','they','which','one','you','were','had','has','their','will','there','what','so','if','up','out','when','who','him','its','do','how','my','we','your','said','on','is','i','me','no','more','than','then','them','into','her','our','upon','also','about','after','over','before','shall','these','those','would','could','should','been','may','did','now','come','came','went','away','down','through','every','any','both','own','such','even','only','other','where','while','yet','unto','lord','god','yahweh','jesus','christ'])

function fail(msg) { console.error('BSB BUILD FAIL: ' + msg); process.exit(1) }

const out = process.argv[2]
if (!out) fail('usage: build-bible-bsb.js <outfile>')
if (!fs.existsSync(SRC)) fail('missing ' + SRC)

const index = {}
let verses = 0
for (const line of fs.readFileSync(SRC, 'utf8').split('\n')) {
  const tab = line.indexOf('\t')
  if (tab === -1) continue
  const ref = line.slice(0, tab).trim()
  const text = line.slice(tab + 1).trim()
  // refs look like "Genesis 1:1" / "1 Samuel 2:3" / "Song of Solomon 1:1"
  if (!/^[1-3]?\s?[A-Za-z ]+ \d+:\d+$/.test(ref) || !text) continue
  verses++
  const words = text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/)
  const seen = new Set()
  for (const word of words) {
    if (word.length < 3 || SKIP.has(word) || seen.has(word)) continue
    seen.add(word)
    if (!index[word]) index[word] = []
    index[word].push({ ref, text: text.slice(0, 120) })
  }
}

if (verses < 31000) fail(`only ${verses} verses parsed — source layout changed?`)
fs.writeFileSync(out, JSON.stringify(index))
console.log(`bible-index (BSB): ${verses} verses, ${Object.keys(index).length} words, ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)}MB`)
