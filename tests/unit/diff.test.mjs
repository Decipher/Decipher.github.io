import assert from 'node:assert/strict'
import test from 'node:test'

import { changedRegion, diffLines, isLong } from '../../nuxt/ice/src/diff.mjs'

test('a word replaced in the middle is the only thing reported', () => {
  const r = changedRegion('the quick brown fox jumps', 'the quick red fox jumps')
  assert.deepEqual(r.removed, ['brown'])
  assert.deepEqual(r.added, ['red'])
})

test('an insertion has nothing removed', () => {
  const r = changedRegion('one two five', 'one two three four five')
  assert.deepEqual(r.removed, [])
  assert.equal(r.added.join('').trim(), 'three four')
})

test('a deletion has nothing added', () => {
  const r = changedRegion('one two three four five', 'one two five')
  assert.equal(r.removed.join('').trim(), 'three four')
  assert.deepEqual(r.added, [])
})

test('identical values report no change at all', () => {
  assert.equal(diffLines('same text here', 'same text here'), null)
})

test('the change is shown with the words around it', () => {
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
  const edited = long.replace('word30', 'CHANGED')
  const d = diffLines(long, edited)
  assert.ok(d.removed.includes('word30'))
  assert.ok(d.added.includes('CHANGED'))
  // Context either side, so the change can be placed in the text.
  assert.ok(d.removed.includes('word29'))
  assert.ok(d.removed.includes('word31'))
})

test('text cut from the ends is marked as cut', () => {
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')
  const d = diffLines(long, long.replace('word30', 'CHANGED'))
  assert.ok(d.removed.startsWith('...'), 'the head was elided')
  assert.ok(d.removed.endsWith('...'), 'the tail was elided')
})

test('a short edit is not elided', () => {
  const d = diffLines('a b c', 'a x c')
  assert.ok(!d.removed.includes('...'))
  assert.equal(d.removed.trim(), 'a b c')
  assert.equal(d.added.trim(), 'a x c')
})

test('an empty value on either side still diffs', () => {
  assert.equal(diffLines('', 'new text').removed, null)
  assert.equal(diffLines('old text', '').added, null)
})

test('long is about the length that stops being readable at a glance', () => {
  assert.equal(isLong('short'), false)
  assert.equal(isLong('x'.repeat(200)), true)
  assert.equal(isLong(null), false)
})
