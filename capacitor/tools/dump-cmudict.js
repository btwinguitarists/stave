#!/usr/bin/env node
// Dump the cmudict npm package's pronunciation table to a plain JSON object
// { WORD: "PH ON ES" } so the browser build can feed it to findRhymes, which
// reads cmuDict._cache directly.
const fs = require('fs')
const path = require('path')

const { CMUDict } = require(path.join(__dirname, '..', '..', 'node_modules', 'cmudict'))
const d = new CMUDict()
d.get('THE') // trigger full cache load (same trick renderer.js uses)

if (!d._cache || typeof d._cache !== 'object') {
  console.error('FATAL: cmudict internal _cache not found — package layout changed')
  process.exit(1)
}

const words = Object.keys(d._cache)
if (words.length < 100000) {
  console.error(`FATAL: cmudict cache suspiciously small (${words.length} entries)`)
  process.exit(1)
}

const out = process.argv[2]
if (!out) { console.error('usage: dump-cmudict.js <outfile>'); process.exit(1) }
fs.writeFileSync(out, JSON.stringify(d._cache))
console.log(`cmudict.json: ${words.length} words, ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)}MB`)
