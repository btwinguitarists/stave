'use strict'

// A tab may only write over the disk version it last observed. This keeps a
// stale renderer from winning after iCloud has delivered a newer copy.
function canWriteOverDisk({ currentDiskContent, lastDiskContent }) {
  return lastDiskContent === undefined || currentDiskContent === lastDiskContent
}

function classifyExternalUpdate({
  currentDiskContent,
  lastDiskContent,
  localContent,
  lastSavedContent
}) {
  if (currentDiskContent === lastDiskContent) return 'unchanged'
  if (currentDiskContent === localContent) return 'already-local'
  if (localContent === lastSavedContent) return 'reload'
  return 'recover-local'
}

module.exports = { canWriteOverDisk, classifyExternalUpdate }
