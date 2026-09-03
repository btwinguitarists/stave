#!/usr/bin/env node
// Scripture concordance for the drawer.
//
// FORK NOTE: upstream (Cody) builds this from the `world-english-bible` npm
// package. Ben's apps use the Berean Standard Bible as the house English text
// everywhere — Eremos ships it, and Stave's iOS build has used it since 1.1 —
// so the Mac build was the last place still showing WEB wording ("Hiddekel"
// where the BSB reads "Tigris"). Both builds now come from one script and one
// source, so this cannot silently drift back.
//
// The real work lives in capacitor/tools/build-bible-bsb.js: same index shape
// (word -> [{ref, text}]) and the same skip list, so the drawer is unchanged.
// It reads ~/thai-bible-ai/sources/bsb-text/bsb.txt and hard-fails if fewer
// than 31,000 verses parse.
const { execFileSync } = require('child_process')
const path = require('path')

execFileSync(
  'node',
  [path.join(__dirname, 'capacitor', 'tools', 'build-bible-bsb.js'),
   path.join(__dirname, 'bible-index.json')],
  { stdio: 'inherit' },
)
