/**
 * What Drupal says this site is called.
 *
 * The name, the slogan and the front page live in Drupal's own configuration,
 * and a decoupled frontend that hardcodes them is a second copy that drifts:
 * change the site name in Drupal and the header still says the old one, with
 * nothing to explain why.
 *
 * `decoupled_settings` exposes allowlisted simple config over JSON:API, and
 * `@druxt-contrib/decoupled-settings` reads it at build time and bakes it into
 * `publicRuntimeConfig.decoupledSettings`. This is the reading of what it baked
 * in, kept pure so the falling back can be tested without a build.
 */

/**
 * One config object out of the baked settings.
 *
 * Returns an empty object rather than undefined, so a caller reads a missing
 * key the same way whether the object was absent or the key was.
 */
export function configObject(settings, name) {
  return (settings || {})[name] || {}
}

/**
 * The site's identity, with what to show when Drupal has not been asked yet.
 *
 * A static build serves visitors who never connect a backend, so the fallbacks
 * are not an error path: they are what most people see. They are passed in
 * rather than hardcoded here, because the build already knows what this site is
 * called and that is a better answer than a generic one.
 */
export function siteIdentity(settings, fallback = {}) {
  const site = configObject(settings, 'system.site')
  return {
    // `||` not `??`: Drupal stores an unset slogan as an empty string, and an
    // empty string is not something to put in a header.
    name: site.name || fallback.name || '',
    slogan: site.slogan || fallback.slogan || '',
    front: site.page?.front || fallback.front || '/',
  }
}

/**
 * The favicon a theme resolves to, as a URL against the backend.
 *
 * Core resolves this with its own fallbacks, so the value is usable rather than
 * a path that may or may not exist. It is served by Drupal, so a static build
 * with no backend has nothing to point at and says so by returning nothing.
 */
export function faviconUrl(settings, theme, backendUrl) {
  const url = configObject(settings, `${theme}.settings`).favicon?.url
  if (!url || !backendUrl) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${String(backendUrl).replace(/\/+$/, '')}${url}`
}
