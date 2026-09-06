// Trimmed text fields, which JSON:API does not trim.
//
// A teaser display asks for `text_summary_or_trimmed` with a trim length.
// JSON:API returns the stored field either way, because it is an API rather
// than a render pipeline, so consuming the formatter is the theme's job. Druxt
// hands the schema over with its settings; this is what the theme does with it.

import assert from 'node:assert/strict'
import test from 'node:test'

import { isTrimmed, teaserHtml, trimWords } from '../../nuxt/lib/teaser.mjs'

test("an editor's own summary is the summary", () => {
  // Somebody wrote it to be one, which beats anything cut mechanically.
  assert.equal(
    teaserHtml({ summary: 'Written to be a summary.', processed: '<p>The whole thing</p>' }),
    'Written to be a summary.'
  )
})

test('a body with no summary is cut to the configured length', () => {
  const long = { processed: `<p>${'word '.repeat(200)}</p>` }
  const out = teaserHtml(long, { trimLength: 40 })
  assert.ok(out.length < 80, out)
  assert.ok(out.endsWith('...</p>'), out)
})

test('the cut is plain text, not cut markup', () => {
  // Cutting HTML at a character count leaves tags unclosed, and a teaser that
  // opens a figure it never closes takes the rest of the page inside it.
  const out = teaserHtml(
    { processed: '<figure><img src="x"></figure><p>Text</p>' },
    { trimLength: 100 }
  )
  assert.equal(out, '<p>Text</p>')
  assert.ok(!out.includes('<figure'))
})

test('entities in the body do not survive as entities', () => {
  assert.equal(teaserHtml({ processed: '<p>Tom &amp; Jerry&#39;s</p>' }), "<p>Tom & Jerry's</p>")
})

test('a cut lands on a word', () => {
  assert.equal(trimWords('one two three four', 9), 'one two...')
  assert.equal(trimWords('short', 40), 'short')
  assert.equal(trimWords('  spaced   out  ', 40), 'spaced out')
})

test('only the trimming formatters are trimmed', () => {
  assert.equal(isTrimmed('text_summary_or_trimmed'), true)
  assert.equal(isTrimmed('text_trimmed'), true)
  // The full display renders the whole field, which is the point of it.
  assert.equal(isTrimmed('text_default'), false)
  assert.equal(isTrimmed(undefined), false)
})

test('a field with nothing in it produces nothing', () => {
  assert.equal(teaserHtml(undefined), '')
  assert.equal(teaserHtml({ processed: '' }), '')
})
