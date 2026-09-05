// The decisions the authoring layer makes, without a browser.
//
// `fetch` is injected rather than stubbed globally, so these run anywhere and
// each case says plainly what the backend did.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONFORMANCE_UNREACHABLE,
  base64Url,
  callbackUrl,
  checkConformance,
  contentsApiUrl,
  isExpired,
  normaliseUrl,
  readSessionRecord,
  resolveSource,
  sessionRecordRequest,
} from '../../nuxt/lib/authoring.mjs'

const jsonapiOk = () => ({
  ok: true,
  status: 200,
  json: async () => ({ jsonapi: { version: '1.1' } }),
})

test('normaliseUrl trims whitespace and trailing slashes', () => {
  assert.equal(normaliseUrl('  https://example.test/  '), 'https://example.test')
  assert.equal(normaliseUrl('https://example.test///'), 'https://example.test')
  assert.equal(normaliseUrl(undefined), '')
})

test('a session with no expiry never expires', () => {
  assert.equal(isExpired(null), false)
})

test('a session expires the moment its expiry passes', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  assert.equal(isExpired('2026-01-01T12:00:01Z', now), false)
  assert.equal(isExpired('2026-01-01T12:00:00Z', now), true)
  assert.equal(isExpired('2026-01-01T11:59:59Z', now), true)
})

test('an unparseable expiry counts as expired', () => {
  // Better to treat a backend as gone than to send edits at one that may be.
  assert.equal(isExpired('not a date'), true)
})

test('a JSON:API backend conforms', async () => {
  const result = await checkConformance('https://backend.test/', { fetch: jsonapiOk })
  assert.equal(result.ok, true)
  assert.equal(result.version, '1.1')
})

test('a URL that is not http is refused before any request', async () => {
  let called = false
  const result = await checkConformance('ftp://backend.test', {
    fetch: async () => {
      called = true
      return jsonapiOk()
    },
  })
  assert.equal(result.ok, false)
  assert.equal(called, false)
})

test('an empty URL asks for one', async () => {
  const result = await checkConformance('', { fetch: jsonapiOk })
  assert.equal(result.ok, false)
  assert.match(result.reason, /Enter a backend URL/)
})

test('a rejected fetch names both causes it could be', async () => {
  const result = await checkConformance('https://backend.test', {
    fetch: async () => {
      throw new TypeError('Failed to fetch')
    },
    origin: 'https://decipher.github.io',
  })
  assert.equal(result.ok, false)
  assert.ok(result.reason.startsWith(CONFORMANCE_UNREACHABLE))
  // The origin matters: a CORS misconfiguration is the likeliest cause, and
  // the message has to say which origin the backend needs to allow.
  assert.match(result.reason, /decipher\.github\.io/)
})

test('a non-200 reports its status', async () => {
  const result = await checkConformance('https://backend.test', {
    fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }),
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /403/)
})

test('a URL that answers but is not JSON:API is refused', async () => {
  const result = await checkConformance('https://backend.test', {
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ hello: 'world' }) }),
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /not a JSON:API endpoint/)
})

test('a live session record is read', async () => {
  const record = await readSessionRecord('https://records.test/session.json', {
    fetch: async () => ({
      ok: true,
      json: async () => ({ url: 'https://backend.test/', expiresAt: '2026-01-01T13:00:00Z' }),
    }),
    now: Date.parse('2026-01-01T12:00:00Z'),
  })
  assert.equal(record.url, 'https://backend.test')
})

test('every kind of absence reads as no session', async () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  const cases = {
    'no record URL configured': [null, async () => jsonapiOk()],
    'a 404': ['https://records.test/s.json', async () => ({ ok: false, status: 404 })],
    'a network failure': [
      'https://records.test/s.json',
      async () => {
        throw new Error('offline')
      },
    ],
    'malformed JSON': [
      'https://records.test/s.json',
      async () => ({
        ok: true,
        json: async () => {
          throw new Error('bad json')
        },
      }),
    ],
    'a record with no url': [
      'https://records.test/s.json',
      async () => ({ ok: true, json: async () => ({ expiresAt: '2026-01-01T13:00:00Z' }) }),
    ],
    'an expired record': [
      'https://records.test/s.json',
      async () => ({
        ok: true,
        json: async () => ({ url: 'https://backend.test', expiresAt: '2026-01-01T11:00:00Z' }),
      }),
    ],
  }

  for (const [label, [url, fetchImpl]] of Object.entries(cases)) {
    const record = await readSessionRecord(url, { fetch: fetchImpl, now })
    assert.equal(record, null, `${label} should read as no session`)
  }
})

test('base64Url produces no padding or URL-unsafe characters', () => {
  const encoded = base64Url(new Uint8Array([251, 255, 190, 0]))
  assert.doesNotMatch(encoded, /[+/=]/)
})

test('callbackUrl handles a root and a subpath base', () => {
  assert.equal(
    callbackUrl('https://decipher.github.io', '/'),
    'https://decipher.github.io/callback'
  )
  // A project site serves from a subpath, and the redirect has to match the
  // page's real origin plus that base or the backend rejects it.
  assert.equal(
    callbackUrl('https://example.test', '/frontend/'),
    'https://example.test/frontend/callback'
  )
  assert.equal(
    callbackUrl('https://example.test', '/frontend'),
    'https://example.test/frontend/callback'
  )
})

test('an explicit URL beats a remembered one, which beats a published one', () => {
  const stored = { url: 'https://stored.test' }
  const published = { url: 'https://published.test', source: 'published' }

  assert.equal(resolveSource({ query: 'https://query.test', stored, published }).source, 'query')
  assert.equal(resolveSource({ stored, published }).source, 'stored')
  assert.equal(resolveSource({ published }).source, 'published')
  assert.equal(resolveSource({}), null)
})

test('the record is never read from a cache that could be five minutes old', () => {
  // `raw.githubusercontent.com` is served through a CDN with `max-age=300`, and
  // `cache: 'no-store'` only speaks to the browser's cache. A backend that came
  // up a minute ago stayed invisible for five, and a 404 fetched before the
  // session started was cached just as happily as a hit.
  const raw = 'https://raw.githubusercontent.com/o/r/session/session.json'
  const first = sessionRecordRequest(raw).url
  assert.match(first, /\?t=\d+$/)
  assert.ok(first.startsWith(`${raw}?`))
  assert.equal(sessionRecordRequest('https://x.test/a?b=1').url.includes('&t='), true)
})

test('a signed-in author reads the record from the API, not the CDN', () => {
  // As close to the job telling the page as a static site gets: the contents
  // API is current the moment the job pushes the branch.
  const raw = 'https://raw.githubusercontent.com/o/r/session/session.json'
  const { url, headers } = sessionRecordRequest(raw, 'a-token')
  assert.equal(url, 'https://api.github.com/repos/o/r/contents/session.json?ref=session')
  assert.equal(headers.authorization, 'Bearer a-token')
  // The file, not the metadata envelope, so one shape comes back either way.
  assert.equal(headers.accept, 'application/vnd.github.raw')
})

test('a record published somewhere other than GitHub still reads', () => {
  assert.equal(contentsApiUrl('https://example.test/session.json'), null)
  const { url, headers } = sessionRecordRequest('https://example.test/session.json', 'a-token')
  assert.match(url, /^https:\/\/example\.test\/session\.json\?t=\d+$/)
  assert.equal(headers, undefined)
})

test('the record read sends the token it was given', async () => {
  const seen = []
  const fetch = async (url, init) => {
    seen.push({ url, headers: init.headers })
    return {
      ok: true,
      json: async () => ({
        url: 'https://backend.test',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    }
  }
  const record = await readSessionRecord(
    'https://raw.githubusercontent.com/o/r/session/session.json',
    { fetch, token: 'a-token' }
  )
  assert.equal(record.url, 'https://backend.test')
  assert.ok(seen[0].url.startsWith('https://api.github.com/'))
  assert.equal(seen[0].headers.authorization, 'Bearer a-token')
})
