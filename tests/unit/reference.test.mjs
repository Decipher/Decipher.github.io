// Working out what an entity reference field points at, and how to search it.
//
// Drupal's autocomplete widget gets all of this from the field definition.
// JSON:API has no autocomplete endpoint, so it has to be derived, and deriving
// it wrongly means a field that silently searches the wrong things.
//
// The fixtures below are the real config of the article content type, read
// back out of a running site rather than invented.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  autocompleteUrl,
  filterFieldFor,
  labelFieldFor,
  labelOf,
  labelsUrl,
  targetResourceTypes,
  toRelationship,
} from '../../nuxt/lib/reference.mjs'

// node.article.field_tags, as druxt-schema assembles it.
const tagsSchema = {
  id: 'field_tags',
  settings: {
    storage: { target_type: 'taxonomy_term' },
    config: {
      handler: 'default:taxonomy_term',
      handler_settings: { target_bundles: { tags: 'tags' }, auto_create: true },
    },
    display: { match_operator: 'CONTAINS', match_limit: 10 },
  },
}

// node.article.uid. A base field, so it has no field config of either kind.
const authorSchema = {
  id: 'uid',
  settings: {
    storage: {},
    config: {},
    display: { match_operator: 'CONTAINS', match_limit: 10 },
  },
}

test('each entity type has its own label field', () => {
  // JSON:API does not announce which attribute is the label.
  assert.equal(labelFieldFor('node'), 'title')
  assert.equal(labelFieldFor('taxonomy_term'), 'name')
  assert.equal(labelFieldFor('user'), 'display_name')
  assert.equal(labelFieldFor('something_unknown'), 'name')
})

test('a user is searched by a different field than it is labelled by', () => {
  // display_name is computed, and filtering on it is a 500 from Drupal.
  assert.equal(labelFieldFor('user'), 'display_name')
  assert.equal(filterFieldFor('user'), 'name')
  // Everything else searches what it displays.
  assert.equal(filterFieldFor('node'), 'title')
  assert.equal(filterFieldFor('taxonomy_term'), 'name')
})

test('a resource is labelled by whichever attribute it actually has', () => {
  assert.equal(labelOf({ type: 'node--article', attributes: { title: 'A post' } }), 'A post')
  assert.equal(labelOf({ type: 'taxonomy_term--tags', attributes: { name: 'Bread' } }), 'Bread')
  assert.equal(labelOf({ type: 'user--user', attributes: { display_name: 'admin' } }), 'admin')
  // Falls back to the id rather than rendering nothing.
  assert.equal(labelOf({ type: 'node--article', id: 'abc', attributes: {} }), 'abc')
})

test('what a field already references is definitive', () => {
  const existing = [{ type: 'taxonomy_term--tags', id: '1' }]
  // No guessing needed when the answer is in the data.
  assert.deepEqual(targetResourceTypes({}, existing, {}), ['taxonomy_term--tags'])
})

test('the allowed bundles come from the field config, not the storage', () => {
  // target_type is on the storage, target_bundles on the field. Reading either
  // from the wrong one leaves the field searching nothing.
  assert.deepEqual(targetResourceTypes(tagsSchema, [], {}), ['taxonomy_term--tags'])
})

test('an unrestricted field searches every bundle the index reports', () => {
  // Guessing one would silently hide the rest.
  const open = { id: 'field_ref', settings: { storage: { target_type: 'taxonomy_term' } } }
  const index = { 'taxonomy_term--tags': {}, 'taxonomy_term--topics': {}, 'node--article': {} }
  assert.deepEqual(targetResourceTypes(open, [], index), [
    'taxonomy_term--tags',
    'taxonomy_term--topics',
  ])
})

test('the handler names the target when the storage does not', () => {
  const schema = { id: 'field_ref', settings: { config: { handler: 'default:node' } } }
  const index = { 'node--article': {}, 'node--page': {} }
  assert.deepEqual(targetResourceTypes(schema, [], index), ['node--article', 'node--page'])
})

test('a base field is recognised by name, having no config to read', () => {
  assert.deepEqual(targetResourceTypes(authorSchema, [], {}), ['user--user'])
})

test('a field that says nothing about its target yields nothing', () => {
  assert.deepEqual(targetResourceTypes({ id: 'field_mystery' }, [], {}), [])
})

test('the search uses the field own operator and limit', () => {
  const url = decodeURIComponent(
    autocompleteUrl('https://b.test', 'taxonomy_term--tags', 'bre', tagsSchema)
  )
  assert.ok(url.startsWith('https://b.test/jsonapi/taxonomy_term/tags?'))
  assert.ok(url.includes('filter[q][condition][path]=name'))
  assert.ok(url.includes('filter[q][condition][operator]=CONTAINS'))
  assert.ok(url.includes('filter[q][condition][value]=bre'))
  assert.ok(url.includes('page[limit]=10'))
})

test('searching users filters on name, not on the computed label', () => {
  const url = decodeURIComponent(
    autocompleteUrl('https://b.test', 'user--user', 'ad', authorSchema)
  )
  assert.ok(url.includes('filter[q][condition][path]=name'))
  assert.ok(!url.includes('display_name'))
})

test('a field configured to match differently is honoured', () => {
  const starts = { settings: { display: { match_operator: 'STARTS_WITH', match_limit: 3 } } }
  const url = decodeURIComponent(autocompleteUrl('https://b.test', 'node--article', 'x', starts))
  assert.ok(url.includes('operator]=STARTS_WITH'))
  assert.ok(url.includes('page[limit]=3'))
  // Nodes are matched on their title, not a name.
  assert.ok(url.includes('path]=title'))
})

test('a trailing slash on the backend does not double up', () => {
  const url = autocompleteUrl('https://b.test/', 'node--article', 'x', {})
  assert.ok(url.startsWith('https://b.test/jsonapi/node/article?'))
})

test('referenced ids are looked up in one request per type', () => {
  const url = decodeURIComponent(labelsUrl('https://b.test', 'taxonomy_term--tags', ['aaa', 'bbb']))
  assert.ok(url.startsWith('https://b.test/jsonapi/taxonomy_term/tags?'))
  assert.ok(url.includes('filter[ids][condition][path]=id'))
  assert.ok(url.includes('filter[ids][condition][operator]=IN'))
  // Drupal wants the values indexed; a bare repeated key returns nothing.
  assert.ok(url.includes('filter[ids][condition][value][0]=aaa'))
  assert.ok(url.includes('filter[ids][condition][value][1]=bbb'))
})

test('a relationship is emitted in the shape JSON:API expects', () => {
  const items = [
    { type: 'taxonomy_term--tags', id: '1', label: 'Bread' },
    { type: 'taxonomy_term--tags', id: '2', label: 'Baking' },
  ]
  // Multi-value is an array; single is one object or null. Sending the wrong
  // shape is rejected by Drupal rather than coerced.
  assert.deepEqual(toRelationship(items, true).data, [
    { type: 'taxonomy_term--tags', id: '1' },
    { type: 'taxonomy_term--tags', id: '2' },
  ])
  assert.deepEqual(toRelationship(items, false).data, { type: 'taxonomy_term--tags', id: '1' })
  assert.equal(toRelationship([], false).data, null)
  // The label is display only and must not reach the wire.
  assert.deepEqual(Object.keys(toRelationship(items, true).data[0]), ['type', 'id'])
})
