/**
 * What this site is, in one place.
 *
 * Every title, description, canonical URL and share card is derived from here,
 * so the share card and the canonical URL cannot drift apart, and so the claim
 * the site makes about itself is written once rather than in eight templates.
 */

/**
 * Where the site lives.
 *
 * Configurable because a preview build is not the deployment, and a canonical
 * URL pointing at the wrong origin is worse than none: it tells a search engine
 * to index a preview. The default is the deployment, which is what a build with
 * nothing set is.
 *
 * Read on each call rather than captured once, because nuxt.config.js imports
 * this and ES imports are hoisted above the dotenv call at the top of it. A
 * constant here would be fixed before the environment it reads was loaded.
 */
export function siteOrigin() {
  return (process.env.SITE_ORIGIN || 'https://decipher.github.io').replace(/\/+$/, '')
}

export const SITE_NAME = 'Deciphered'

/**
 * What the site is for, said plainly.
 *
 * This is the sentence a search result, a share card and an assistant all quote,
 * so it says what the thing demonstrates rather than what it is built with.
 */
export const SITE_DESCRIPTION =
  'A statically generated Drupal site on GitHub Pages, with a backend that only exists while someone is writing. Experiments in decoupled Drupal with Druxt.'

/** Appended to a page title, so a tab and a share card say which site. */
export const TITLE_SUFFIX = ` | ${SITE_NAME}`

/**
 * An absolute URL for a route on this site.
 *
 * Trailing slashes are stripped, because `/about` and `/about/` are one page
 * and indexing them separately splits its ranking between two URLs.
 */
export function siteUrl(path = '/') {
  const route = `/${String(path || '/')}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1')
  return `${siteOrigin()}${route}`
}

/**
 * The canonical URL for a page.
 *
 * Usually this site's own. Content syndicated from somewhere else declares
 * where it came from instead: the canonical belongs on the original, or this
 * copy competes with it in search and can outrank the real thing.
 *
 * `canonical` is whatever the content itself says, so syndication is a matter
 * of supplying it rather than of changing this.
 */
export function canonicalUrl({ path = '/', canonical } = {}) {
  const declared = String(canonical || '').trim()
  return declared || siteUrl(path)
}

/** Whether a page is a copy of something published elsewhere. */
export function isSyndicated({ path = '/', canonical } = {}) {
  return canonicalUrl({ path, canonical }) !== siteUrl(path)
}

/**
 * Routes that exist for the machinery rather than for a reader.
 *
 * Kept out of the sitemap and out of llms.txt, and told not to be indexed. The
 * OAuth callback is a redirect target with no content; the authoring page is a
 * tool that only works for someone signed in.
 */
export const PRIVATE_ROUTES = ['/callback', '/authoring']

export function isPrivateRoute(path) {
  const route = String(path || '')
  return PRIVATE_ROUTES.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))
}
