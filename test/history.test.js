'use strict'

const assert = require('assert')
const { isSnapshotDue, isBigShrink, selectPrunable } = require('../history')

const MIN = 60 * 1000

// isSnapshotDue
assert.strictEqual(isSnapshotDue({ lastSnapshotAt: null, now: 1000 }), true, 'first save always snapshots')
assert.strictEqual(isSnapshotDue({ lastSnapshotAt: undefined, now: 1000 }), true, 'unseeded note snapshots')
assert.strictEqual(isSnapshotDue({ lastSnapshotAt: 0, now: 5 * MIN, minIntervalMs: 5 * MIN }), true, 'due at interval')
assert.strictEqual(isSnapshotDue({ lastSnapshotAt: 0, now: 5 * MIN - 1, minIntervalMs: 5 * MIN }), false, 'not due before interval')

// isBigShrink
assert.strictEqual(isBigShrink({ previousLength: 1000, nextLength: 800 }), true, '200-char loss triggers')
assert.strictEqual(isBigShrink({ previousLength: 1000, nextLength: 801 }), false, '199-char loss does not')
assert.strictEqual(isBigShrink({ previousLength: 100, nextLength: 5000 }), false, 'growth never triggers')
assert.strictEqual(isBigShrink({ previousLength: 0, nextLength: 0 }), false, 'empty-to-empty does not')
assert.strictEqual(isBigShrink({ previousLength: 7000, nextLength: 80 }), true, 'the journal-resurrection shape triggers')

// selectPrunable
const day = 24 * 60 * 60 * 1000
const now = 1000 * day
const fresh = i => ({ name: `fresh-${i}.md`, mtimeMs: now - i * MIN })
const old = { name: 'old.md', mtimeMs: now - 91 * day }

assert.deepStrictEqual(selectPrunable([fresh(1), fresh(2)], { now }), [], 'few fresh snapshots all kept')
assert.deepStrictEqual(selectPrunable([fresh(1), old], { now }), ['old.md'], 'age cutoff prunes')
const many = Array.from({ length: 205 }, (_, i) => fresh(i))
const pruned = selectPrunable(many, { now })
assert.strictEqual(pruned.length, 5, 'count cap prunes overflow')
assert.deepStrictEqual(pruned, ['fresh-200.md', 'fresh-201.md', 'fresh-202.md', 'fresh-203.md', 'fresh-204.md'], 'oldest pruned first')

console.log('history policy tests passed')
