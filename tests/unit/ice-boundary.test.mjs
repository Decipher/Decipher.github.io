import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

/**
 * The module's boundary, asserted rather than described.
 *
 * `nuxt/ice` is meant to become a Druxt contrib module, and the thing that
 * makes that possible is that nothing in it reaches back into this site. A
 * README saying so is a README; this fails.
 */
const SRC = path.join(import.meta.dirname, '..', '..', 'nuxt', 'ice', 'src')
const files = readdirSync(SRC).filter((name) => name.endsWith('.mjs'))

test('the module has something in it', () => {
  assert.ok(files.length >= 10, `expected the engine modules, found ${files.length}`)
})

test('nothing in the module reaches back into the site', () => {
  // A site's look, its destinations and its store are the things this has to
  // work without. An import of any of them means the boundary has moved.
  const forbidden = [
    /\.\.\/\.\.\/lib\//,
    /nuxt\/lib\//,
    /\/components\//,
    /\/store\//,
    /\/layouts\//,
  ]
  const offenders = []
  for (const name of files) {
    const source = readFileSync(path.join(SRC, name), 'utf8')
    for (const pattern of forbidden) {
      if (pattern.test(source)) offenders.push(`${name} imports ${pattern}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('the module imports nothing from this site by name', () => {
  // The site's own modules, which are the ones a contrib release would not have.
  const site = ['github', 'github-client', 'regions', 'settings', 'sticky', 'prose', 'teaser']
  const offenders = []
  for (const name of files) {
    const source = readFileSync(path.join(SRC, name), 'utf8')
    for (const module of site) {
      if (source.includes(`'./${module}.mjs'`)) offenders.push(`${name} imports ${module}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('everything in src is re-exported from the package root', () => {
  // So a consumer has one import path, and so a module added here is a
  // deliberate part of the public surface rather than an accident.
  const index = readFileSync(path.join(SRC, '..', 'index.mjs'), 'utf8')
  const missing = files.filter((name) => !index.includes(`./src/${name}`))
  assert.deepEqual(missing, [])
})
