// Reading what Drupal says this site is called.
//
// The name, slogan and front page live in Drupal's configuration.
// `@druxt-contrib/decoupled-settings` bakes them into the build; this is the
// reading of what it baked in, and the falling back when it baked in nothing.

import assert from 'node:assert/strict'
import test from 'node:test'

import { configObject, faviconUrl, siteIdentity } from '../../nuxt/lib/settings.mjs'

const SETTINGS = {
  'system.site': { name: 'Deciphered', slogan: 'Serverless Drupal', page: { front: '/node' } },
  'olivero.settings': {
    favicon: { url: '/core/themes/olivero/favicon.ico', mimetype: 'image/vnd.microsoft.icon' },
  },
}

test('the site is called what Drupal calls it', () => {
  assert.deepEqual(siteIdentity(SETTINGS), {
    name: 'Deciphered',
    slogan: 'Serverless Drupal',
    front: '/node',
  })
})

test('a build that never reached Drupal still has a name', () => {
  // The static build serves people who never connect a backend, so this is not
  // an error path: it is what a header shows when nobody was asked.
  assert.deepEqual(siteIdentity(undefined, { name: 'Deciphered', slogan: 'Serverless Drupal' }), {
    name: 'Deciphered',
    slogan: 'Serverless Drupal',
    front: '/',
  })
})

test('an empty slogan is not a slogan', () => {
  // Drupal stores an unset slogan as an empty string, and `??` would take it.
  const site = { 'system.site': { name: 'Deciphered', slogan: '' } }
  assert.equal(siteIdentity(site, { slogan: 'Serverless Drupal' }).slogan, 'Serverless Drupal')
})

test('a missing config object reads like a missing key', () => {
  assert.deepEqual(configObject(SETTINGS, 'nothing.settings'), {})
  assert.deepEqual(configObject(undefined, 'system.site'), {})
})

test('a favicon is resolved against the backend that serves it', () => {
  assert.equal(
    faviconUrl(SETTINGS, 'olivero', 'http://backend.test/'),
    'http://backend.test/core/themes/olivero/favicon.ico'
  )
  // Already absolute, so left alone.
  const absolute = { 'x.settings': { favicon: { url: 'https://cdn.test/f.ico' } } }
  assert.equal(faviconUrl(absolute, 'x', 'http://backend.test'), 'https://cdn.test/f.ico')
  // Nothing to point at without a backend, and saying so beats a broken link.
  assert.equal(faviconUrl(SETTINGS, 'olivero', ''), '')
})
