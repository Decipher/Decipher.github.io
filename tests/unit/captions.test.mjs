import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCaptionFilter,
  captionsAreAttributes,
  decodeAttribute,
  fromEditorCaptions,
  hasUnfilteredCaption,
  toEditorCaptions,
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

test('a stored caption survives repeated trips through the editor unchanged', () => {
  // Not merely readable afterwards: identical. The field compares what comes
  // out of the editor with what went in to decide whether anything changed, so
  // a value that never comes back the same is a value that reports an edit
  // nobody made, and re-encodes itself a little more each time.
  const stored =
    '<p>text</p>\n<img src="/sites/default/files/a.png" alt="x" ' +
    'data-entity-type="file" data-entity-uuid="u" data-caption="Drupal\'s layout &amp; more.">'
  let value = stored
  for (let i = 0; i < 3; i += 1) value = fromEditorCaptions(toEditorCaptions(value))
  assert.equal(value, stored)
})

test('an apostrophe written as a hex reference decodes like a decimal one', () => {
  // Both forms appear in the wild. Handling only `&#39;` meant `&#x27;` kept
  // its ampersand re-encoded on every save.
  assert.equal(decodeAttribute('Drupal&#x27;s'), "Drupal's")
  assert.equal(decodeAttribute('Drupal&#39;s'), "Drupal's")
})

test('a figure with no caption is left as the editor wrote it', () => {
  const figure = '<figure class="image"><img src="/a.png"><figcaption></figcaption></figure>'
  assert.equal(fromEditorCaptions(figure), figure)
})

test('captions are attributes only where Drupal will build the figure back', () => {
  const filters = {
    full_html: ['editor_file_reference', 'filter_caption', 'filter_align'],
    plain_html: ['filter_autop', 'filter_url'],
  }
  assert.equal(captionsAreAttributes(filters, 'full_html'), true)
  assert.equal(captionsAreAttributes(filters, 'plain_html'), false)
})

test('a format nobody could look up is assumed to run the filter', () => {
  // Every format shipping with Drupal that permits images runs it, and the
  // other default would quietly change how existing content is stored the
  // first time a lookup failed.
  assert.equal(captionsAreAttributes({}, 'unknown'), true)
  assert.equal(captionsAreAttributes(null, 'unknown'), true)
})
