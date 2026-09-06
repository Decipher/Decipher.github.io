import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCaptionFilter,
  decodeAttribute,
  hasUnfilteredCaption,
} from '../../nuxt/lib/captions.mjs'

test('a captioned image becomes the figure Drupal would have rendered', () => {
  assert.equal(
    applyCaptionFilter('<p><img src="/a.png" data-caption="One change, staged."></p>'),
    '<p><figure role="group" class="caption"><img src="/a.png">' +
      '<figcaption>One change, staged.</figcaption></figure></p>'
  )
})

test('the attribute is taken out of the tag it came from', () => {
  const out = applyCaptionFilter('<img src="/a.png" alt="x" data-caption="c">')
  assert.ok(!out.includes('data-caption'))
  assert.ok(out.includes('alt="x"'))
})

test('markup inside a caption is decoded, not printed', () => {
  // A caption lives in an attribute, so Drupal stores its tags encoded.
  const out = applyCaptionFilter('<img src="/a.png" data-caption="see &lt;em&gt;this&lt;/em&gt;">')
  assert.ok(out.includes('<figcaption>see <em>this</em></figcaption>'))
})

test('single quotes are handled, because the editor is not consistent', () => {
  const out = applyCaptionFilter("<img src='/a.png' data-caption='c'>")
  assert.ok(out.includes('<figcaption>c</figcaption>'))
})

test('other attributes on the image are kept', () => {
  const out = applyCaptionFilter(
    '<img src="/a.png" data-entity-type="file" data-entity-uuid="u" data-caption="c">'
  )
  assert.ok(out.includes('data-entity-uuid="u"'))
  assert.ok(out.includes('data-entity-type="file"'))
})

test('markup Drupal already filtered is left alone', () => {
  // `body.processed` arrives with its figures already built.
  const filtered =
    '<figure role="group" class="caption"><img src="/a.png"><figcaption>c</figcaption></figure>'
  assert.equal(applyCaptionFilter(filtered), filtered)
})

test('nothing to do is nothing done', () => {
  assert.equal(applyCaptionFilter('<p>plain</p>'), '<p>plain</p>')
  assert.equal(applyCaptionFilter(''), '')
  assert.equal(applyCaptionFilter(null), null)
})

test('asking twice about the same markup answers the same', () => {
  // A global regexp keeps `lastIndex` between calls, which made this alternate.
  const html = '<img src="/a.png" data-caption="c">'
  assert.equal(hasUnfilteredCaption(html), true)
  assert.equal(hasUnfilteredCaption(html), true)
  assert.equal(hasUnfilteredCaption('<p>none</p>'), false)
})

test('an ampersand is decoded once, not twice', () => {
  assert.equal(decodeAttribute('a &amp;lt;b&amp;gt; c'), 'a &lt;b&gt; c')
})
