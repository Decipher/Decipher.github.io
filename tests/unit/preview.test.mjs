// Showing content that exists only in the cart.
//
// A listing is built from what the backend returns, so something written in the
// browser appears nowhere: an author writes an article, sees the front page
// unchanged, and reasonably concludes it was lost.

import assert from 'node:assert/strict'
import test from 'node:test'

import { asResource, listingAccepts, previewsFor } from '../../nuxt/lib/preview.mjs'

const results = [
  { type: 'node--article', id: '1' },
  { type: 'node--article', id: '2' },
]

test('a listing takes new content of a type it is already showing', () => {
  // The types a view is returning, rather than its configuration: the
  // configuration would have to be interpreted, and the results are evidence.
  assert.equal(listingAccepts(['node--article'], { type: 'node--article' }), true)
  assert.equal(listingAccepts(['node--article'], { type: 'node--page' }), false)
  assert.equal(listingAccepts([], { type: 'node--article' }), false)
})

test('only new content, and only once', () => {
  const staged = [
    { type: 'node--article', id: 'new', isNew: true },
    // An edit to something already listed is not a second copy of it.
    { type: 'node--article', id: '1', attributes: { title: 'edited' } },
    // Nor is something the backend has already returned.
    { type: 'node--article', id: '2', isNew: true },
    // Nor a type this listing does not show.
    { type: 'taxonomy_term--tags', id: 'tag', isNew: true },
  ]
  assert.deepEqual(
    previewsFor(results, staged).map((r) => r.id),
    ['new']
  )
})

test('content staged for deletion is not added to a listing', () => {
  const staged = [{ type: 'node--article', id: 'gone', isNew: true, deleted: true }]
  assert.deepEqual(previewsFor(results, staged), [])
})

test('newest first, the way a front page reads', () => {
  const staged = [
    { type: 'node--article', id: 'first', isNew: true },
    { type: 'node--article', id: 'second', isNew: true },
  ]
  assert.deepEqual(
    previewsFor(results, staged).map((r) => r.id),
    ['second', 'first']
  )
})

test('a seeded resource is marked complete, or Druxt fetches it anyway', () => {
  // Without this it asks the backend for a uuid it has never heard of, and the
  // row renders as a 404 instead of as the content just written.
  const seeded = asResource({ type: 'node--article', id: 'x', attributes: { title: 'T' } })
  assert.equal(seeded._druxt_full, true)
  assert.equal(seeded.data.type, 'node--article')
  assert.equal(seeded.data.attributes.title, 'T')
  assert.deepEqual(seeded.data.relationships, {})
})
