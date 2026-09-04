// Where a Pages deployment is served from.
//
// A static build bakes its asset paths in, so getting this wrong does not fail
// the build: it publishes a site whose every asset 404s. Worth testing for that
// reason alone.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'

const script = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'pages-base.sh')
const base = (url) => execFileSync(script, url === undefined ? [] : [url], { encoding: 'utf8' })

test('a user site serves from the root', () => {
  assert.equal(base('https://decipher.github.io'), '/')
  assert.equal(base('https://decipher.github.io/'), '/')
})

test('a project site serves from its own path', () => {
  // A generic host on purpose: this repository is public, and `lint:private`
  // rejects a reference to one that only resolves on a private network.
  assert.equal(base('https://gitlab.example.com/group/project'), '/group/project/')
})

test('the base always ends in a slash', () => {
  // Without it Nuxt treats the last segment as a file and every asset URL
  // loses it.
  for (const url of ['https://x.test/a', 'https://x.test/a/', 'https://x.test/a/b']) {
    assert.ok(base(url).endsWith('/'), `${url} should end in a slash`)
  }
})

test('no URL falls back to the root', () => {
  // What a local build and a user site both want.
  assert.equal(base(), '/')
  assert.equal(base(''), '/')
})

test('a host with no path is the root', () => {
  assert.equal(base('https://example.test'), '/')
})
