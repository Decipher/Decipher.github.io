/**
 * Backend resolution logic, with no browser in it.
 *
 * The plugins that use this run only in the browser, which makes them awkward
 * to test and easy to get subtly wrong: "is this backend usable", "has this
 * session expired", "which source wins". Those are decisions, not plumbing, so
 * they live here where a test can reach them and `fetch` is a parameter rather
 * than a global.
 */

/** Trim trailing slashes so URLs concatenate predictably. */
export function normaliseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '')
}

/** A session is over the moment its expiry passes, or if it never had one. */
export function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false
  const at = new Date(expiresAt).getTime()
  return Number.isNaN(at) ? true : at <= now
}

export const CONFORMANCE_UNREACHABLE =
  'Could not reach it, or it does not allow this site\'s origin.'

/**
 * Decide whether a URL is a backend this site can author against.
 *
 * Reachability alone is not enough, so this asks JSON:API to identify itself.
 * A cross-origin rejection and a dead host both surface as a rejected fetch
 * with no status, because the browser deliberately refuses to say which, so
 * the message names both possibilities rather than guessing.
 */
export async function checkConformance(url, { fetch: fetchImpl, origin } = {}) {
  const base = normaliseUrl(url)
  if (!base) return { ok: false, reason: 'Enter a backend URL.' }
  if (!/^https?:\/\//.test(base)) {
    return { ok: false, reason: 'That is not an http or https URL.' }
  }

  let response
  try {
    response = await fetchImpl(`${base}/jsonapi`, {
      headers: { Accept: 'application/vnd.api+json' },
    })
  } catch {
    const suffix = origin ? ` Check it is running, and that its CORS configuration lists ${origin}.` : ''
    return { ok: false, reason: CONFORMANCE_UNREACHABLE + suffix }
  }

  if (!response.ok) {
    return { ok: false, reason: `JSON:API answered ${response.status}.` }
  }

  let body
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!body || !body.jsonapi) {
    return { ok: false, reason: 'That URL answered, but it is not a JSON:API endpoint.' }
  }

  return { ok: true, version: body.jsonapi.version }
}

/**
 * Read a published session record, treating every kind of absence alike.
 *
 * No session is the normal case, not an error: the site has to render exactly
 * as it does for any visitor when nothing is running, so a missing record, a
 * malformed one and an expired one all mean the same thing.
 */
export async function readSessionRecord(recordUrl, { fetch: fetchImpl, now = Date.now() } = {}) {
  if (!recordUrl) return null
  let record
  try {
    const response = await fetchImpl(recordUrl, { cache: 'no-store' })
    if (!response.ok) return null
    record = await response.json()
  } catch {
    return null
  }
  if (!record || typeof record.url !== 'string' || !record.url) return null
  if (isExpired(record.expiresAt, now)) return null
  return { ...record, url: normaliseUrl(record.url) }
}

/** base64url, the encoding every OAuth PKCE value uses. */
export function base64Url(bytes) {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The redirect URI to register and to send.
 *
 * Built from the page's own origin plus the router base, so it follows the
 * site wherever it is served from. It has to match what the consumer has
 * registered exactly, or the backend rejects the request as `invalid_client`,
 * which is a confusing way to say "unknown redirect".
 */
export function callbackUrl(origin, base = '/') {
  const path = base.endsWith('/') ? base : `${base}/`
  return `${origin}${path}callback`
}

/** Which source wins when more than one names a backend. */
export function resolveSource({ query, stored, published }) {
  if (query) return { url: normaliseUrl(query), source: 'query' }
  if (stored && stored.url) return { ...stored, url: normaliseUrl(stored.url), source: 'stored' }
  if (published && published.url) return { ...published, source: 'published' }
  return null
}
