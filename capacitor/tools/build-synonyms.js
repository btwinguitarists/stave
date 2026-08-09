#!/usr/bin/env node
// Dump WordNet (wordnet-db, already in Cody's deps) to a flat synonyms map
// so the drawer has real synonyms on iOS, where the Mac's fs-based lookup
// can't run. lemma -> up to 12 single-word synonyms across all parts of
// speech, same content the Mac path surfaces via `natural`.
const fs = require('fs')
const path = require('path')

const DICT = path.join(__dirname, '..', '..', 'node_modules', 'wordnet-db', 'dict')
const POS = ['noun', 'verb', 'adj', 'adv']

function fail(msg) { console.error('SYNONYMS BUILD FAIL: ' + msg); process.exit(1) }

const out = process.argv[2]
if (!out) fail('usage: build-synonyms.js <outfile>')
if (!fs.existsSync(DICT)) fail('missing wordnet-db dict at ' + DICT)

// data.<pos>: offset -> member words + similar-to links.
// Adjectives hide their treasure in satellite synsets reached via '&'
// (similar-to) pointers — "beautiful" alone owns beauteous/gorgeous/lovely
// that way — so we keep those links and merge one hop below.
// (null-prototype maps: WordNet really does contain the lemma "constructor")
const synsets = Object.create(null)
for (const pos of POS) {
  for (const line of fs.readFileSync(path.join(DICT, 'data.' + pos), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const parts = line.split(' ')
    const offset = parts[0]
    const wCnt = parseInt(parts[3], 16)
    if (!Number.isFinite(wCnt)) continue
    const words = []
    for (let i = 0; i < wCnt; i++) {
      const w = parts[4 + i * 2]
      if (w && !w.includes('_') && /^[a-zA-Z-]+$/.test(w)) words.push(w.toLowerCase())
    }
    const similar = []
    const pIdx = 4 + wCnt * 2
    const pCnt = parseInt(parts[pIdx], 10)
    if (Number.isFinite(pCnt)) {
      for (let i = 0; i < pCnt; i++) {
        const sym = parts[pIdx + 1 + i * 4]
        const tOff = parts[pIdx + 2 + i * 4]
        if (sym === '&') similar.push(tOff)
      }
    }
    synsets[pos + offset] = { words, similar }
  }
}

function wordsOf(pos, offset, hop) {
  const s = synsets[pos + offset]
  if (!s) return []
  let all = s.words
  if (hop) for (const o of s.similar) all = all.concat((synsets[pos + o] || { words: [] }).words)
  return all
}

// index.<pos>: lemma -> synset offsets
const syn = Object.create(null)
for (const pos of POS) {
  for (const line of fs.readFileSync(path.join(DICT, 'index.' + pos), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const parts = line.split(' ').filter(Boolean)
    const lemma = parts[0]
    if (lemma.includes('_') || !/^[a-z-]+$/.test(lemma)) continue
    const synsetCnt = parseInt(parts[2], 10)
    if (!Number.isFinite(synsetCnt) || synsetCnt < 1) continue
    const offsets = parts.slice(parts.length - synsetCnt)
    const found = syn[lemma] ? new Set(syn[lemma]) : new Set()
    for (const off of offsets) {
      for (const w of wordsOf(pos, off, pos === 'adj')) {
        if (w !== lemma) found.add(w)
      }
    }
    if (found.size) syn[lemma] = [...found].slice(0, 12)
  }
}

const lemmas = Object.keys(syn)
if (lemmas.length < 40000) fail(`only ${lemmas.length} lemmas — parse drifted?`)
fs.writeFileSync(out, JSON.stringify(syn))
console.log(`synonyms: ${lemmas.length} lemmas, ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)}MB`)
