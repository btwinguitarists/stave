'use strict'

const assert = require('assert')
const { displayTitleFrom, displayTitleFromRaw } = require('../note-title')

// custom titles always win
assert.strictEqual(displayTitleFrom({ title: 'Prepared For Battle', body: 'The Desert of XJ' }), 'Prepared For Battle')

// auto-date titles yield to the first line of writing
assert.strictEqual(displayTitleFrom({ title: 'Thu Aug 13', body: 'A Rule of Prayer for the Field\n\nI’ve lived…' }), 'A Rule of Prayer for the Field')
assert.strictEqual(displayTitleFrom({ title: 'Sat Aug 8', body: '' }), 'Sat Aug 8', 'empty body keeps the date')
assert.strictEqual(displayTitleFrom({ title: '', body: '' }), 'untitled')
assert.strictEqual(displayTitleFrom({ title: 'untitled', body: 'Real first line' }), 'Real first line')

// markdown noise is skipped / stripped
assert.strictEqual(displayTitleFrom({ title: 'Mon Apr 13', body: '\n---\n## A heading line\ntext' }), 'A heading line')
assert.strictEqual(displayTitleFrom({ title: 'Mon Apr 13', body: '- bullet first line' }), 'bullet first line')

// long lines are trimmed with an ellipsis
const long = 'x'.repeat(80)
const shown = displayTitleFrom({ title: 'Tue Apr 21', body: long })
assert.ok(shown.length <= 43 && shown.endsWith('…'), 'long first line trimmed')

// raw markdown path
const raw = '# Thu Aug 13\ntype: write\ntags: \n\n## idea\nA Rule of Prayer for the Field\nmore\n\n## context\nctx\n'
assert.strictEqual(displayTitleFromRaw(raw), 'A Rule of Prayer for the Field')
const rawCustom = '# My Song\ntype: write\ntags: \n\n## idea\nverse one\n'
assert.strictEqual(displayTitleFromRaw(rawCustom), 'My Song')

console.log('note title tests passed')
