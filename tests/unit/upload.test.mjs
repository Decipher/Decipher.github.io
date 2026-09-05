// Putting a file into Drupal over JSON:API.
//
// The file does not go as a JSON:API document: it goes to the field's own route
// as raw bytes with the filename in a header. Everything below was established
// against a running Drupal rather than taken from the documentation.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  fileIsAllowed,
  imageRelationship,
  parseSize,
  safeFilename,
  uploadHeaders,
  uploadUrl,
} from '../../nuxt/lib/upload.mjs'

const imageSchema = {
  settings: {
    config: { file_extensions: 'png gif jpg jpeg webp', max_filesize: '2 MB', alt_field: true },
  },
}

test('the bytes go to the field, not to the file collection', () => {
  assert.equal(
    uploadUrl('https://b.test', 'node--article', 'field_image'),
    'https://b.test/jsonapi/node/article/field_image'
  )
})

test('a trailing slash on the backend does not double up', () => {
  assert.ok(
    uploadUrl('https://b.test/', 'node--article', 'field_image').startsWith(
      'https://b.test/jsonapi/'
    )
  )
})

test('the request is bytes, not a document', () => {
  const headers = uploadHeaders('photo.png', 'tok')
  // JSON:API's own media type here is a 415.
  assert.equal(headers['Content-Type'], 'application/octet-stream')
  assert.equal(headers['Content-Disposition'], 'file; filename="photo.png"')
  assert.equal(headers.Authorization, 'Bearer tok')
})

test('a filename cannot break out of its header', () => {
  // Content-Disposition is a header: a newline is request smuggling and a quote
  // ends the value early.
  assert.equal(safeFilename('a"b\nc.png'), 'abc.png')
  assert.equal(safeFilename('../../etc/passwd'), 'passwd')
  assert.equal(safeFilename(''), 'upload')
  assert.equal(safeFilename(null), 'upload')
})

test('the relationship carries alt text', () => {
  // Sending the relationship without meta answers 200 and silently clears the
  // alt, which is the one way to lose it without being told.
  const rel = imageRelationship('file-1', 'A description')
  assert.equal(rel.data.type, 'file--file')
  assert.equal(rel.data.meta.alt, 'A description')
})

test('what Drupal put in the meta is kept', () => {
  // Width, height and title come back from Drupal. Rebuilding the meta from
  // scratch would drop them, which is a change the author did not make.
  const rel = imageRelationship('file-1', 'New alt', { width: 100, height: 50, title: 'T' })
  assert.deepEqual(rel.data.meta, { width: 100, height: 50, title: 'T', alt: 'New alt' })
})

test('removing an image is an explicit null', () => {
  assert.deepEqual(imageRelationship(null, ''), { data: null })
})

test('the field says which files it takes', () => {
  assert.deepEqual(fileIsAllowed({ name: 'photo.png', size: 10 }, imageSchema), { ok: true })
  assert.equal(fileIsAllowed({ name: 'notes.txt', size: 10 }, imageSchema).ok, false)
  assert.match(fileIsAllowed({ name: 'notes.txt', size: 10 }, imageSchema).reason, /png/)
  // Case is not a reason to refuse a file.
  assert.deepEqual(fileIsAllowed({ name: 'PHOTO.PNG', size: 10 }, imageSchema), { ok: true })
})

test('a file too large for the field is refused before it is sent', () => {
  const big = fileIsAllowed({ name: 'photo.png', size: 3 * 1024 * 1024 }, imageSchema)
  assert.equal(big.ok, false)
  assert.match(big.reason, /2 MB/)
})

test('a field with no restrictions takes anything', () => {
  assert.deepEqual(fileIsAllowed({ name: 'whatever', size: 999 }, {}), { ok: true })
})

test('Drupal writes sizes as words', () => {
  assert.equal(parseSize('2 MB'), 2 * 1024 * 1024)
  assert.equal(parseSize('512 KB'), 512 * 1024)
  assert.equal(parseSize(''), 0)
  assert.equal(parseSize('not a size'), 0)
})
