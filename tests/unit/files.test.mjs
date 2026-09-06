// Content images, after the backend they came from has gone.
//
// An image inserted through CKEditor is a Drupal file, and Drupal writes its
// own URL into the markup. That URL is served by Drupal, and a static build has
// no Drupal, so every one of those images was a broken picture on the deployed
// site.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DRUPAL_FILES,
  absoluteFileUrls,
  isDrupalFile,
  relativeFileUrls,
  rewriteFileUrls,
} from '../../nuxt/lib/files.mjs'

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

test('a body image is addressed at the backend for the editor', () => {
  // The editable shows stored markup as-is, and the frontend does not serve
  // Drupal's files path, so every image would be a broken picture.
  const html = '<p><img src="/sites/default/files/inline-images/a.png"></p>'
  assert.equal(
    absoluteFileUrls(html, 'https://backend.test'),
    '<p><img src="https://backend.test/sites/default/files/inline-images/a.png"></p>'
  )
})

test('and put back before it is staged', () => {
  // An absolute URL here would bake this session's backend into the content,
  // and that backend stops existing.
  const html = '<p><img src="https://backend.test/sites/default/files/inline-images/a.png"></p>'
  assert.equal(
    relativeFileUrls(html, 'https://backend.test/'),
    '<p><img src="/sites/default/files/inline-images/a.png"></p>'
  )
})

test('with no backend connected, the markup is left alone', () => {
  const html = '<p><img src="/sites/default/files/a.png"></p>'
  assert.equal(absoluteFileUrls(html, null), html)
  assert.equal(relativeFileUrls(html, ''), html)
})

test('a link to another site is not touched', () => {
  const html = '<p><img src="https://example.test/sites/default/files/a.png"></p>'
  assert.equal(relativeFileUrls(html, 'https://backend.test'), html)
})
