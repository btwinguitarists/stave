const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const css = fs.readFileSync(path.join(root, 'capacitor/src/ios.css'), 'utf8')
const patch = fs.readFileSync(path.join(root, 'capacitor/src/lockin-ios-patch.js'), 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(/@media \(max-width: 700px\)[\s\S]*?#write-column\s*\{[\s\S]*?align-items:\s*stretch;[\s\S]*?overflow:\s*hidden;/.test(css),
  'phone writing column must use the full width and keep scrolling in the editor')
assert(/#outline-sidebar,\s*#drawer-panel\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?transform:\s*translateX\(-102%\);/.test(css),
  'phone side panels must overlay instead of reserving writing width')
assert(/#exit-btn\s*\{\s*display:\s*none;\s*\}/.test(css),
  'phone must hide the redundant desktop exit control')
assert(/@media \(max-width: 700px\)[\s\S]*?#editor\s*\{[\s\S]*?flex:\s*1;[\s\S]*?min-height:\s*0;/.test(css),
  'phone editor must fill the available space instead of using a viewport-height minimum')
assert(/\.phone \.tw-on #editor\s*\{[^}]*padding-top:\s*0;/.test(css),
  'phone CSS must fail safe to a top-aligned editor when typewriter state is stale')
assert(/localStorage\.getItem\('stave-typewriter'\) === 'on' && !phoneQuery\.matches/.test(patch),
  'phone mode must not activate typewriter centering')
assert(!/title:\s*\(twOn \? '✓ ' : ''\) \+ 'Typewriter mode'/.test(patch),
  'phone action sheet must not offer the centered-caret mode')

console.log('iOS phone editor layout tests passed')
