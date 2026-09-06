// Turning Drupal's configured toolbar into one CKEditor can render.
//
// The filtering is the point: Drupal's toolbar vocabulary includes buttons from
// modules the classic build has no plugin for, and passing one through throws
// `toolbarview-item-unavailable` and takes the whole editor down. Getting this
// wrong loses the field, not just a button.

import assert from 'node:assert/strict'
import test from 'node:test'

import { FALLBACK_TOOLBAR, editorForFormat, toolbarFor } from '../../nuxt/lib/editor.mjs'

const editor = (format, items) => ({
  attributes: { drupal_internal__format: format, settings: { toolbar: { items } } },
})

// What a stock Drupal 11 basic_html actually reports.
const BASIC_HTML = [
  'bold',
  'italic',
  '|',
  'link',
  '|',
  'bulletedList',
  'numberedList',
  '|',
  'blockQuote',
  'drupalInsertImage',
  '|',
  'heading',
]

test('an editor is matched on the format machine name', () => {
  const all = [editor('basic_html', BASIC_HTML), editor('full_html', ['bold'])]
  // The field's value carries the machine name, never the resource id.
  assert.equal(editorForFormat(all, 'full_html').attributes.drupal_internal__format, 'full_html')
  assert.equal(editorForFormat(all, 'nope'), null)
  assert.equal(editorForFormat(null, 'basic_html'), null)
  assert.equal(editorForFormat([], null), null)
})

test('buttons this build cannot render are dropped', () => {
  const toolbar = toolbarFor([editor('basic_html', BASIC_HTML)], 'basic_html')
  assert.ok(!toolbar.includes('drupalInsertImage'))
  assert.ok(toolbar.includes('bold'))
  assert.ok(toolbar.includes('heading'))
})

test('separators left stranded by a dropped button are collapsed', () => {
  // `blockQuote drupalInsertImage |` would otherwise leave a doubled divider.
  const toolbar = toolbarFor([editor('basic_html', BASIC_HTML)], 'basic_html')
  assert.ok(!toolbar.some((item, i) => item === '|' && toolbar[i - 1] === '|'))
  assert.notEqual(toolbar[0], '|')
  assert.notEqual(toolbar[toolbar.length - 1], '|')
})

test('an unknown format falls back rather than rendering nothing', () => {
  assert.deepEqual(
    toolbarFor([editor('basic_html', BASIC_HTML)], 'restricted_html'),
    FALLBACK_TOOLBAR
  )
})

test('no configuration at all falls back', () => {
  // The anonymous case: `editor--editor` needs `administer filters`, so a
  // visitor gets an empty collection rather than an error.
  assert.deepEqual(toolbarFor([], 'basic_html'), FALLBACK_TOOLBAR)
  assert.deepEqual(toolbarFor(null, 'basic_html'), FALLBACK_TOOLBAR)
})

test('a toolbar of only unsupported buttons falls back', () => {
  // Better a working editor with the wrong buttons than an empty toolbar.
  const only = [editor('basic_html', ['drupalInsertImage', 'sourceEditing'])]
  assert.deepEqual(toolbarFor(only, 'basic_html'), FALLBACK_TOOLBAR)
})

test('a button is only offered when its plugin was loaded', () => {
  // `code` is configured on this site's full_html but is not in the classic
  // build, so it is dropped unless the caller says it managed to add it.
  const configured = [editor('full_html', ['bold', 'code', 'italic'])]
  assert.ok(!toolbarFor(configured, 'full_html').includes('code'))
  assert.ok(toolbarFor(configured, 'full_html', ['code']).includes('code'))
})

test('a loaded plugin cannot conjure a button Drupal did not configure', () => {
  // The configuration decides what is offered. Loading a plugin only decides
  // whether a configured button can be honoured.
  const configured = [editor('full_html', ['bold', 'italic'])]
  assert.ok(!toolbarFor(configured, 'full_html', ['code']).includes('code'))
})
