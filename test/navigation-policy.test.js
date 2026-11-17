'use strict'

const assert = require('assert')
const path = require('path')
const { pathToFileURL } = require('url')
const { classifyNavigation } = require('../navigation-policy')
const appDir = path.resolve(__dirname, '..')
const classify = url => classifyNavigation(url, appDir)

for (const name of ['index.html', 'search.html', 'reminders.html', 'lockin.html', 'lockin-plan.html']) {
  assert.strictEqual(classify(pathToFileURL(path.join(appDir, name)).href), 'local')
}
assert.strictEqual(classify(pathToFileURL(path.join(appDir, 'index.html')).href + '#note'), 'local')
assert.strictEqual(classify('https://example.com'), 'external')
assert.strictEqual(classify('http://example.com'), 'external')
for (const url of [
  'javascript:require("fs")', 'data:text/html,<script>require("fs")</script>',
  'file:///etc/passwd', 'file://server/share/index.html', 'not a URL',
  pathToFileURL(path.join(appDir, 'notes', 'index.html')).href,
  pathToFileURL(path.join(appDir, 'untrusted.html')).href,
]) assert.strictEqual(classify(url), 'blocked', url)

console.log('navigation security tests passed')
