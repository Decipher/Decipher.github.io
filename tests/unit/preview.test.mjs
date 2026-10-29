import assert from 'node:assert/strict'
import { test } from 'node:test'

import { previewEntity, previewMode, previewPath } from '../../nuxt/lib/preview.mjs'

const UUID = '753b6c4b-7684-4d69-8650-1ca4ab6af08a'

test('the hash names a preview document on this site', () => {
  assert.equal(
    previewPath(`#/jsonapi/node/slide/${UUID}/preview`),
    `/jsonapi/node/slide/${UUID}/preview`
  )
  assert.equal(
    previewPath(`/jsonapi/node/article/${UUID}/preview`),
    `/jsonapi/node/article/${UUID}/preview`
  )
  const encoded = encodeURIComponent(`/jsonapi/node/slide/${UUID}/preview`)
  assert.equal(previewPath(`#${encoded}`), `/jsonapi/node/slide/${UUID}/preview`)
})

test('anything that is not that is refused', () => {
  assert.equal(previewPath(''), '')
  assert.equal(previewPath('#'), '')
  assert.equal(previewPath(`#https://evil.example/jsonapi/node/slide/${UUID}/preview`), '')
  assert.equal(previewPath(`#//evil.example/jsonapi/node/slide/${UUID}/preview`), '')
  assert.equal(previewPath(`#/jsonapi/node/slide/${UUID}`), '')
  assert.equal(previewPath(`#/jsonapi/node/slide/../../user/1/preview`), '')
  assert.equal(previewPath(`#/jsonapi/node/slide/${UUID}/preview?x=1`), '')
  assert.equal(previewPath('#%E0%A4%A'), '')
})

test('the view mode is vm, or the default', () => {
  assert.equal(previewMode({ vm: 'teaser' }), 'teaser')
  assert.equal(previewMode({ vm: ' full ' }), 'full')
  assert.equal(previewMode({}), 'default')
  assert.equal(previewMode({ vm: 'not a mode' }), 'default')
  assert.equal(previewMode(null), 'default')
})

test('the entity is the document single resource', () => {
  const data = { type: 'node--slide', id: UUID, attributes: { title: 'Draft' } }
  assert.deepEqual(previewEntity({ data }), data)
  assert.equal(previewEntity({ data: [data] }), null)
  assert.equal(previewEntity({ errors: [] }), null)
  assert.equal(previewEntity(null), null)
})
