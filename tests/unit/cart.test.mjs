// What the cart decides: what counts as a change, how repeated edits fold
// together, and what a staged resource looks like on the wire.
//
// These are the rules a wrong answer corrupts someone's content with, so they
// are tested directly rather than through a component.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cartKey,
  changedFields,
  deepEqual,
  exportCart,
  exportSummary,
  isEmptyResource,
  mergeEntry,
  patchBody,
  patchUrl,
  tidyResource,
} from '../../nuxt/lib/cart.mjs'

test('one cart entry per entity', () => {
  assert.equal(cartKey('node--article', 'abc'), 'node--article:abc')
})

test('only changed fields are staged', () => {
  const original = { title: 'Before', body: { value: 'same' } }
  const edited = { title: 'After', body: { value: 'same' } }
  assert.deepEqual(changedFields(original, edited), { title: 'After' })
})

test('an edit that changes nothing stages nothing', () => {
  const same = { title: 'Same', body: { value: 'x' } }
  assert.deepEqual(changedFields(same, { ...same }), {})
})

test('a field is compared by content, not by identity', () => {
  // The form hands back new objects every render. Comparing by reference would
  // stage every field on every keystroke.
  const original = { body: { value: 'text', format: 'basic_html' } }
  const edited = { body: { value: 'text', format: 'basic_html' } }
  assert.deepEqual(changedFields(original, edited), {})
})

test('a field set to empty is a change, not an absence', () => {
  assert.deepEqual(changedFields({ title: 'Something' }, { title: '' }), { title: '' })
})

test('deepEqual handles arrays, order included', () => {
  assert.equal(deepEqual([1, 2], [1, 2]), true)
  assert.equal(deepEqual([1, 2], [2, 1]), false)
  // Ordering is meaningful for a multi-value field, so a reorder is a change.
  assert.equal(deepEqual({ a: [1] }, { a: [1] }), true)
  assert.equal(deepEqual(null, undefined), false)
})

test('a second edit to one entity merges rather than replacing', () => {
  const first = { type: 'node--article', id: '1', attributes: { title: 'A' } }
  const second = { type: 'node--article', id: '1', attributes: { body: 'B' } }
  const merged = mergeEntry(first, second)
  assert.deepEqual(merged.attributes, { title: 'A', body: 'B' })
})

test('a later edit to the same field wins', () => {
  const first = { type: 'node--article', id: '1', attributes: { title: 'A' } }
  const second = { type: 'node--article', id: '1', attributes: { title: 'B' } }
  assert.equal(mergeEntry(first, second).attributes.title, 'B')
})

test('relationships merge alongside attributes', () => {
  const first = { type: 'node--article', id: '1', relationships: { tags: { data: [] } } }
  const second = { type: 'node--article', id: '1', attributes: { title: 'A' } }
  const merged = mergeEntry(first, second)
  assert.ok(merged.relationships.tags)
  assert.equal(merged.attributes.title, 'A')
})

test('an empty half is dropped from the resource', () => {
  const tidy = tidyResource({
    type: 'node--article',
    id: '1',
    attributes: { title: 'A' },
    relationships: {},
  })
  assert.deepEqual(Object.keys(tidy).sort(), ['attributes', 'id', 'type'])
})

test('a resource with nothing in it is recognised as empty', () => {
  assert.equal(isEmptyResource({ type: 'node--article', id: '1', attributes: {} }), true)
  assert.equal(
    isEmptyResource({ type: 'node--article', id: '1', attributes: { title: 'A' } }),
    false
  )
})

test('the PATCH body is a JSON:API document carrying the id', () => {
  const body = patchBody({ type: 'node--article', id: 'abc', attributes: { title: 'A' } })
  // Drupal rejects a PATCH whose body omits the id, even though it is in the URL.
  assert.deepEqual(body, {
    data: { type: 'node--article', id: 'abc', attributes: { title: 'A' } },
  })
})

test('the PATCH url follows the entity_type/bundle path', () => {
  assert.equal(
    patchUrl('https://backend.test', 'node--article', 'abc'),
    'https://backend.test/jsonapi/node/article/abc'
  )
  // A trailing slash on the backend must not double up.
  assert.equal(
    patchUrl('https://backend.test/', 'node--article', 'abc'),
    'https://backend.test/jsonapi/node/article/abc'
  )
})

test('a type with no bundle still resolves', () => {
  assert.equal(patchUrl('https://backend.test', 'user', '1'), 'https://backend.test/jsonapi/user/1')
})

test('the export is stable regardless of staging order', () => {
  const a = { 'node--article:2': { type: 'node--article', id: '2', attributes: { t: 2 } } }
  const b = { 'node--article:1': { type: 'node--article', id: '1', attributes: { t: 1 } } }
  const one = exportCart({ ...a, ...b }, { generatedAt: 'fixed' })
  const two = exportCart({ ...b, ...a }, { generatedAt: 'fixed' })
  // An export that reordered itself would show as a change in every diff.
  assert.deepEqual(one, two)
  assert.deepEqual(
    one.resources.map((r) => r.id),
    ['1', '2']
  )
})

test('the export is versioned', () => {
  assert.equal(exportCart({}, { generatedAt: 'fixed' }).version, 1)
})

test('the summary says what changed', () => {
  const entries = {
    'node--article:1': { type: 'node--article', id: '1', attributes: {} },
    'node--page:2': { type: 'node--page', id: '2', attributes: {} },
  }
  assert.equal(exportSummary(entries), 'chore(content): edit 2 entities (node)')
  assert.equal(
    exportSummary({ 'media--image:1': { type: 'media--image', id: '1' } }),
    'chore(content): edit 1 entity (media)'
  )
  assert.equal(exportSummary({}), 'chore(content): no changes')
})
