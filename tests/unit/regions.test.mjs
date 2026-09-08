// Where a theme's regions go, inferred from what they are called.
//
// Drupal tells a decoupled frontend which regions a theme has and nothing about
// where they belong: the arrangement lives in the theme's Twig page template,
// which a Nuxt site never sees.

import assert from 'node:assert/strict'
import test from 'node:test'

import { bandFor, hasAside, layoutFor } from '../../nuxt/lib/regions.mjs'

const OLIVERO = [
  'header',
  'primary_menu',
  'secondary_menu',
  'hero',
  'highlighted',
  'breadcrumb',
  'social',
  'content_above',
  'content',
  'sidebar',
  'content_below',
  'footer_top',
  'footer_bottom',
]

test('a theme is arranged into bands from its region names', () => {
  const layout = layoutFor(OLIVERO)
  assert.deepEqual(layout.top, ['header', 'primary_menu', 'secondary_menu'])
  assert.deepEqual(layout.main, ['content'])
  assert.deepEqual(layout.aside, ['social', 'sidebar'])
  assert.deepEqual(layout.bottom, ['footer_top', 'footer_bottom'])
})

test('the specific names win over the general ones', () => {
  // `content_above` is not the content, and `footer_top` is not the top. Both
  // read as the opposite of where they belong if the general rule matches first.
  assert.equal(bandFor('content_above'), 'above')
  assert.equal(bandFor('content_below'), 'below')
  assert.equal(bandFor('content'), 'main')
  assert.equal(bandFor('footer_top'), 'bottom')
  assert.equal(bandFor('header'), 'top')
})

test('a region nobody recognises is shown, not dropped', () => {
  // A region silently dropped is a block placed into nothing, with nothing on
  // the page to say why it never appeared.
  assert.equal(bandFor('whatever_this_is'), 'above')
  assert.deepEqual(layoutFor(['whatever_this_is']).above, ['whatever_this_is'])
})

test('a band is ordered by what its regions are, not by when they arrived', () => {
  // The order they arrive in is not the theme's. Druxt derives the region list
  // from the blocks that are placed, so it follows that query: the account menu
  // arrived before the branding, and the header rendered backwards.
  assert.deepEqual(layoutFor(['footer_bottom', 'footer_top']).bottom, [
    'footer_top',
    'footer_bottom',
  ])
  assert.deepEqual(layoutFor(['secondary_menu', 'header', 'primary_menu']).top, [
    'header',
    'primary_menu',
    'secondary_menu',
  ])
})

test('a region nobody ranked keeps its place, after the ones that are', () => {
  // Sorting an unrecognised region to the front would put something the
  // convention does not describe ahead of the branding. `nav_extra` is in the
  // top band by name and ranked by nothing, so it follows the header.
  assert.deepEqual(layoutFor(['nav_extra', 'header']).top, ['header', 'nav_extra'])
  // And two unranked regions keep the order they arrived in, rather than being
  // shuffled by a comparison that has nothing to compare.
  assert.deepEqual(layoutFor(['b_thing', 'a_thing']).above, ['b_thing', 'a_thing'])
})

test('a page with nothing beside the content is not laid out around a sidebar', () => {
  assert.equal(hasAside(layoutFor(['header', 'content'])), false)
  assert.equal(hasAside(layoutFor(OLIVERO)), true)
})
