// Content images, after the backend they came from has gone.
//
// An image inserted through CKEditor is a Drupal file, and Drupal writes its
// own URL into the markup. That URL is served by Drupal, and a static build has
// no Drupal, so every one of those images was a broken picture on the deployed
// site.

import assert from 'node:assert/strict'
import test from 'node:test'

import { DRUPAL_FILES, isDrupalFile, rewriteFileUrls } from '../../nuxt/lib/files.mjs'

test('an inserted image points at the copy the build made', () => {
  assert.equal(
    rewriteFileUrls('<img src="/sites/default/files/inline-images/a.png" alt="x">'),
    '<img src="/files/inline-images/a.png" alt="x">'
  )
})

test('single quotes are rewritten too', () => {
  // What is in the field is whatever the editor wrote, and Drupal's own filters
  // are not consistent about which quote they use.
  assert.equal(
    rewriteFileUrls("<img src='/sites/default/files/a.png'>"),
    "<img src='/files/a.png'>"
  )
})

test("another site's image is left alone", () => {
  // An absolute URL that happens to contain Drupal's files path is somebody
  // linking to a different site, and rewriting it would break the link.
  const html = '<img src="https://example.test/sites/default/files/a.png">'
  assert.equal(rewriteFileUrls(html), html)
})

test('a field with no markup is not a special case', () => {
  assert.equal(rewriteFileUrls(''), '')
  assert.equal(rewriteFileUrls(undefined), undefined)
  assert.equal(rewriteFileUrls('<p>No pictures here.</p>'), '<p>No pictures here.</p>')
})

test('the path being rewritten is the one Drupal serves from', () => {
  assert.equal(DRUPAL_FILES, '/sites/default/files/')
  assert.equal(isDrupalFile('/sites/default/files/x.png'), true)
  assert.equal(isDrupalFile('/images/x.png'), false)
  assert.equal(isDrupalFile(undefined), false)
})
