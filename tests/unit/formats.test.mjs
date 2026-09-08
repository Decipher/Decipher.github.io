import assert from 'node:assert/strict'
import test from 'node:test'

import { filtersFromResources } from '../../nuxt/ice/src/formats.mjs'

const format = (name, filters) => ({
  type: 'filter_format--filter_format',
  attributes: { drupal_internal__format: name, filters },
})

test('the filters a format runs, by the name a field value carries', () => {
  const resources = [
    format('basic_html', { filter_caption: {}, filter_html: {} }),
    format('full_html', { filter_caption: {}, filter_align: {} }),
  ]
  assert.deepEqual(filtersFromResources(resources, 'basic_html'), ['filter_caption', 'filter_html'])
})

test('a format that runs no filters is an answer, not a missing one', () => {
  // The difference matters: "runs nothing" and "could not be read" lead to
  // different decisions about where a caption is stored.
  assert.deepEqual(filtersFromResources([format('plain', {})], 'plain'), [])
})

test('a format that is not in the collection reads as unknown', () => {
  assert.equal(filtersFromResources([format('basic_html', {})], 'full_html'), null)
})

test('no collection at all reads as unknown', () => {
  // Which is what an anonymous session gets: JSON:API answers 200 with nothing
  // in it rather than refusing outright.
  assert.equal(filtersFromResources([], 'full_html'), null)
  assert.equal(filtersFromResources(null, 'full_html'), null)
})
