// Showing content that exists only in the cart.
//
// A listing is built from what the backend returns, so something written in the
// browser appears nowhere: an author writes an article, sees the front page
// unchanged, and reasonably concludes it was lost.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  asResource,
  failsFilters,
  listingAccepts,
  listingTypes,
  previewsFor,
} from '../../nuxt/ice/src/preview.mjs'

/** The front page view's own filters, as Drupal ships them. */
const FRONTPAGE = {
  display_options: {
    filters: {
      promote: { field: 'promote', value: '1', plugin_id: 'boolean', entity_type: 'node' },
      status: { field: 'status', value: '1', plugin_id: 'boolean', entity_type: 'node' },
      langcode: { field: 'langcode', plugin_id: 'language', entity_type: 'node' },
    },
  },
}

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

// The case this whole file exists for, and the one it could not do: an empty
// listing has no results to infer a type from, so writing the site's first
// article left the front page still saying nothing had been created.

test('a view with no results describes itself from its own filters', () => {
  assert.deepEqual(listingTypes(FRONTPAGE), { types: [], entityTypes: ['node'] })

  // A bundle filter is exact; without one, a view over nodes takes any node.
  const bundled = {
    display_options: {
      filters: {
        type: {
          plugin_id: 'bundle',
          entity_type: 'node',
          field: 'type',
          value: { article: 'article' },
        },
      },
    },
  }
  assert.deepEqual(listingTypes(bundled), {
    types: ['node--article'],
    entityTypes: ['node'],
  })
})

test('an entity type accepts any of its bundles', () => {
  const accepted = { types: [], entityTypes: ['node'] }
  assert.equal(listingAccepts(accepted, { type: 'node--article' }), true)
  assert.equal(listingAccepts(accepted, { type: 'node--page' }), true)
  assert.equal(listingAccepts(accepted, { type: 'taxonomy_term--tags' }), false)
})

test('the first article written appears on an empty front page', () => {
  const article = { type: 'node--article', id: 'a', isNew: true, attributes: { title: 'First' } }
  assert.deepEqual(
    previewsFor([], [article], FRONTPAGE).map((r) => r.id),
    ['a']
  )
  // And with nothing to go on at all, it still declines rather than guessing.
  assert.deepEqual(previewsFor([], [article]), [])
})

test('what a view already returned beats what its filters imply', () => {
  // A listing showing only tags does not take an article, whatever the filters
  // would have allowed: results are evidence, configuration is inference.
  const rows = [{ type: 'taxonomy_term--tags', id: 't' }]
  const article = { type: 'node--article', id: 'a', isNew: true, attributes: {} }
  assert.deepEqual(previewsFor(rows, [article], FRONTPAGE), [])
})

test('a filter the author plainly failed is honoured', () => {
  // Unticking "Promoted to front page" is the author saying where it does not
  // belong, and a front page that shows it anyway is lying about the filter.
  const off = { type: 'node--article', id: 'a', isNew: true, attributes: { promote: false } }
  assert.equal(failsFilters(FRONTPAGE, off), true)
  assert.deepEqual(previewsFor([], [off], FRONTPAGE), [])

  const on = { type: 'node--article', id: 'b', isNew: true, attributes: { promote: true } }
  assert.equal(failsFilters(FRONTPAGE, on), false)
})

test('a field the cart never staged is unknown, not false', () => {
  // A new Article carries no `promote` in the cart, and Drupal's default for it
  // is on. Reading absence as "not promoted" would hide every new article from
  // the one view it is most likely to belong to.
  const article = { type: 'node--article', id: 'a', isNew: true, attributes: { title: 'x' } }
  assert.equal(failsFilters(FRONTPAGE, article), false)
})

test('what a listing accepts does not depend on what was added to it first', () => {
  // Rows added by a previous pass are marked, and they used to count towards
  // the types a listing accepts. So the front page took a page when a page was
  // staged into it first, and refused the same page when an article had been
  // staged before it. Which happened came down to the order somebody typed in.
  const article = { type: 'node--article', id: 'a', isNew: true, attributes: {} }
  const page = { type: 'node--page', id: 'p', isNew: true, attributes: {} }

  const emptyView = []
  const afterArticle = [{ type: 'node--article', id: 'a', __staged: true }]

  assert.deepEqual(
    previewsFor(emptyView, [article, page], FRONTPAGE)
      .map((r) => r.id)
      .sort(),
    ['a', 'p']
  )
  // The same answer once the article is already on the page.
  assert.deepEqual(
    previewsFor(afterArticle, [article, page], FRONTPAGE).map((r) => r.id),
    ['p']
  )

  // A row the backend really returned still narrows it, which is the point:
  // evidence about what this listing holds beats inference from its filters.
  const realRow = [{ type: 'taxonomy_term--tags', id: 't' }]
  assert.deepEqual(previewsFor(realRow, [article, page], FRONTPAGE), [])
})
