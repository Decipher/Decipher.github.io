// Which fields are the content, and which are the settings around it.
//
// Drupal's node form puts the URL alias, the publishing flags and the authoring
// information in a sidebar, because writing something and deciding whether to
// publish it are different jobs. druxt-schema does not carry the field group
// configuration that arrangement comes from, so the split is made by name.

import assert from 'node:assert/strict'
import test from 'node:test'

import { ADVANCED_FIELDS, groupFields } from '../../nuxt/lib/form-groups.mjs'

test('what the author writes stays in front of them', () => {
  const { content } = groupFields(['title', 'body', 'field_tags', 'field_image', 'status'])
  assert.deepEqual(content, ['title', 'body', 'field_tags', 'field_image'])
})

test('the settings go out of the way', () => {
  const { advanced } = groupFields(['title', 'path', 'promote', 'sticky', 'status', 'uid'])
  assert.deepEqual(advanced, ['path', 'promote', 'sticky', 'status', 'uid'])
})

test('field order within each group is left alone', () => {
  // Drupal already sorted these by weight, and second-guessing that would
  // reorder a form its owner arranged on purpose.
  const { content } = groupFields(['body', 'title'])
  assert.deepEqual(content, ['body', 'title'])
})

test('an unknown field is content until someone says otherwise', () => {
  // Getting this the other way round would hide a field an author needs, which
  // is worse than showing one they do not.
  const { content } = groupFields(['field_something_new'])
  assert.deepEqual(content, ['field_something_new'])
})

test('nothing in, nothing out', () => {
  assert.deepEqual(groupFields([]), { content: [], advanced: [] })
  assert.deepEqual(groupFields(), { content: [], advanced: [] })
})

test('the advanced list is the one the form uses', () => {
  // Named rather than derived, so a change to it is a decision someone made.
  assert.ok(ADVANCED_FIELDS.includes('uid'))
  assert.ok(!ADVANCED_FIELDS.includes('title'))
})
