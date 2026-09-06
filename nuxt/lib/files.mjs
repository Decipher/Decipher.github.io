/**
 * Content images, after the backend they came from has gone.
 *
 * An image inserted into a body field through CKEditor is a Drupal file, and
 * Drupal writes its own URL into the markup: `/sites/default/files/...`. That
 * URL is served by Drupal. A static build has no Drupal, so every one of those
 * images is a broken picture on the deployed site.
 *
 * `@nuxt/image` does not help here. It rewrites image *fields*, which Druxt
 * renders as components; an `<img>` inside body HTML is just text to it.
 *
 * Tome already exports the files into the repository, so the build has them on
 * disk. It copies them into the static output and rewrites the markup to point
 * at the copy. Pure, so the rewriting is testable without a build.
 */

/** Where Drupal serves public files from, and where the build puts them. */
export const DRUPAL_FILES = '/sites/default/files/'
export const STATIC_FILES = '/files/'

/**
 * Point body HTML at the copies the build made.
 *
 * Only the public files path is touched. An absolute URL to somewhere else is
 * somebody linking to another site's image, and rewriting that would break it.
 */
export function rewriteFileUrls(html, { from = DRUPAL_FILES, to = STATIC_FILES } = {}) {
  if (!html) return html
  // Both quote styles, because what is in the field is whatever the editor
  // wrote, and Drupal's own filters are not consistent about it.
  return String(html)
    .split(`"${from}`)
    .join(`"${to}`)
    .split(`'${from}`)
    .join(`'${to}`)
}

/**
 * Whether a path is one of Drupal's public files.
 *
 * Used by the build to decide what to copy, and by tests to say what the
 * rewriting is for.
 */
export function isDrupalFile(url) {
  return String(url || '').includes(DRUPAL_FILES)
}
