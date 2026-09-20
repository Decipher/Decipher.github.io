// Where this site's session record is read from.
//
// The logic moved out of the editing module when that module stopped knowing
// any host by name. These two cases came with it: the signed-in author who can
// use the API, and the record published somewhere this site has never heard of.

import assert from 'node:assert/strict'
import test from 'node:test'

import { contentsApiUrl, sessionRecordRequest } from '../../nuxt/lib/github.mjs'

const RAW = 'https://raw.githubusercontent.com/o/r/session/session.json'

test('a signed-in author reads the record from the API, not the CDN', () => {
  // As close to the job telling the page as a static site gets: the contents
  // API is current the moment the job pushes the branch, where the raw URL is
  // behind a CDN that can repeat a five minute old answer.
  const { url, headers } = sessionRecordRequest(RAW, 'a-token')
  assert.equal(url, 'https://api.github.com/repos/o/r/contents/session.json?ref=session')
  assert.equal(headers.authorization, 'Bearer a-token')
  // The file, not the metadata envelope, so the module parses one shape
  // whichever address answered.
  assert.equal(headers.accept, 'application/vnd.github.raw')
})

test('a record published somewhere other than GitHub still reads', () => {
  // Nothing usable means the module falls back to the plain URL rather than
  // treating the record as unreadable.
  assert.equal(contentsApiUrl('https://example.test/session.json'), null)
  assert.equal(sessionRecordRequest('https://example.test/session.json', 'a-token'), null)
})

test('an anonymous visitor gets nothing, so the plain URL is used', () => {
  assert.equal(sessionRecordRequest(RAW, undefined), null)
  assert.equal(sessionRecordRequest(RAW, ''), null)
})
