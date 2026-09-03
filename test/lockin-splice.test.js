'use strict'

// Regression test for the Lock In autosave splice (assessment 2026-09-03 §4.1):
// a body containing its own '#'/'##' headings must splice idempotently.
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const html = fs.readFileSync(path.join(__dirname, '..', 'lockin.html'), 'utf8')
const start = html.indexOf('// @splice-start')
const end = html.indexOf('// @splice-end')
assert.ok(start !== -1 && end > start, 'splice markers present in lockin.html')
const spliceSection = new Function(html.slice(start, end) + '\nreturn spliceSection')()

// a song with a section heading inside the writing
const song = '# Sunday\ntype: write\n\n## idea\nVerse line one\n\n## Chorus\nchorus line\n\n## context\nCTX\n'
const edited = 'Verse line one\n\n## Chorus\nchorus line\n\n## Bridge\nbridge line'
const once = spliceSection(song, '## idea', edited)
assert.strictEqual(once, '# Sunday\ntype: write\n\n## idea\n' + edited + '\n\n## context\nCTX\n')
assert.strictEqual(spliceSection(once, '## idea', edited), once, 'second save is a no-op')

// sermon template: '# ' headings in the body must not end the section early
const sermon = '# S\ntype: write\n\n## idea\n# Series\nx\n# Scripture\ny\n\n## context\n'
const body = '# Series\nx\n# Scripture\ny\n# Big idea\nz'
const s1 = spliceSection(sermon, '## idea', body)
assert.strictEqual(s1, '# S\ntype: write\n\n## idea\n' + body + '\n\n## context\n')
assert.strictEqual(spliceSection(s1, '## idea', body).length, s1.length, 'no growth across saves')

// idea is the last section (no context) → ends at EOF, single trailing newline
assert.strictEqual(spliceSection('# T\n\n## idea\nold\n', '## idea', 'new words'), '# T\n\n## idea\nnew words\n')

// empty editor clears the section but keeps the note shape
assert.strictEqual(spliceSection('# T\n\n## idea\nold\n\n## context\nc\n', '## idea', '   '), '# T\n\n## idea\n\n## context\nc\n')

// plan mode uses '## admin' … '## tasks'
const plan = '# P\ntype: plan\n\n## admin\nold admin\n\n## tasks\n- [ ] a\n'
assert.strictEqual(spliceSection(plan, '## admin', 'new admin\n## not a section'), '# P\ntype: plan\n\n## admin\nnew admin\n## not a section\n\n## tasks\n- [ ] a\n')

// missing marker → null (caller must not write)
assert.strictEqual(spliceSection('# T\nno sections\n', '## idea', 'x'), null)

console.log('lockin-splice: ok')
