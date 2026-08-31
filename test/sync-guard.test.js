'use strict'

const assert = require('assert')
const {
  classifyExternalUpdate,
  canWriteOverDisk
} = require('../sync-guard')

function classify(currentDiskContent, lastDiskContent, localContent, lastSavedContent) {
  return classifyExternalUpdate({
    currentDiskContent,
    lastDiskContent,
    localContent,
    lastSavedContent
  })
}

assert.strictEqual(classify('same', 'same', 'same', 'same'), 'unchanged')
assert.strictEqual(classify('ipad', 'mac', 'mac', 'mac'), 'reload')
assert.strictEqual(classify('ipad', 'mac', 'mac + typing', 'mac'), 'recover-local')
assert.strictEqual(classify('ipad', 'mac', 'ipad', 'mac'), 'already-local')

assert.strictEqual(canWriteOverDisk({ currentDiskContent: 'mac', lastDiskContent: 'mac' }), true)
assert.strictEqual(canWriteOverDisk({ currentDiskContent: 'ipad', lastDiskContent: 'mac' }), false)
assert.strictEqual(canWriteOverDisk({ currentDiskContent: null, lastDiskContent: undefined }), true)

console.log('sync guard regression tests passed')
