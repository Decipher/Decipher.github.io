import assert from 'node:assert/strict'
import test from 'node:test'

import { modesFromDisplays } from '../../nuxt/lib/view-modes.mjs'

const display = (targetEntityType, bundle, mode) => ({
  attributes: { targetEntityType, bundle, mode },
})

test('the modes a bundle has, with default always first', () => {
  const displays = [
    display('node', 'article', 'teaser'),
    display('node', 'article', 'full'),
    display('node', 'page', 'teaser'),
    display('taxonomy_term', 'tags', 'teaser'),
  ]
  assert.deepEqual(modesFromDisplays(displays, 'node--article'), ['default', 'teaser', 'full'])
})

test('default is not repeated when Drupal also lists it', () => {
  const displays = [display('node', 'article', 'default'), display('node', 'article', 'teaser')]
  assert.deepEqual(modesFromDisplays(displays, 'node--article'), ['default', 'teaser'])
})

test('a bundle with no displays still renders as default', () => {
  assert.deepEqual(modesFromDisplays([], 'node--article'), ['default'])
  assert.deepEqual(modesFromDisplays(null, 'node--article'), ['default'])
})
