/**
 * The /preview page's reading of its URL.
 *
 * consumer_node_preview opens the frontend at a target URL it fills in from a
 * template: the view mode as `vm`, a layout as `layout`, and the path of the
 * node's JSON:API preview document in the fragment. The fragment never reaches
 * the server, which is what makes a path there safe to carry: nothing logs it
 * and nothing caches it.
 */

/** Where a preview document may come from: this site's own JSON:API. */
const PREVIEW = /^\/jsonapi\/[a-z0-9_]+\/[a-z0-9_]+\/[0-9a-f-]{36}\/preview$/

/**
 * The preview document's path, from the URL's hash.
 *
 * Only a path on this origin, under /jsonapi, ending in /preview. Anything
 * else is refused rather than fetched: a page that fetches whatever its hash
 * names is a page that fetches for anyone who can write a link.
 *
 * @param {string} hash - `window.location.hash`, with or without the `#`.
 * @returns {string} The path, or an empty string when there is none to trust.
 */
export function previewPath(hash) {
  let path = String(hash || '')
  if (path.startsWith('#')) path = path.slice(1)
  try {
    path = decodeURIComponent(path)
  } catch {
    return ''
  }
  return PREVIEW.test(path) ? path : ''
}

/**
 * The view mode to render in: `vm`, or the default.
 *
 * @param {object} query - The route's query.
 * @returns {string}
 */
export function previewMode(query) {
  const mode = String((query || {}).vm || '').trim()
  return /^[a-z0-9_]+$/.test(mode) ? mode : 'default'
}

/**
 * The entity in a preview document, as the deck's components take it.
 *
 * @param {object} document - A JSON:API document with a single resource.
 * @returns {object|null} The resource, or null when the document holds none.
 */
export function previewEntity(document) {
  const data = (document || {}).data
  if (!data || Array.isArray(data) || !data.type || !data.id) return null
  return data
}
