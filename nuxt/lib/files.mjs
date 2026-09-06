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

/**
 * The same file, addressed for the editor rather than for the page.
 *
 * A body image is stored as `/sites/default/files/...`, which is Drupal's path
 * and not one the frontend serves. On the built page that does not matter,
 * because `rewriteFileUrls` points the markup at the copies. Inside CKEditor it
 * matters a lot: the editable is showing the stored markup as-is, so every
 * image in an article an author opens is a broken picture, and one they have
 * just uploaded is a broken picture too.
 *
 * So the markup is made absolute against the backend on the way into the
 * editor, and put back on the way out. What gets staged and committed is the
 * relative path Drupal writes itself, which is the only portable form: an
 * absolute URL here would bake this session's backend address into the content,
 * and that address belongs to a backend that stops existing.
 */
export function absoluteFileUrls(html, backendUrl) {
  if (!html || !backendUrl) return html
  const origin = String(backendUrl).replace(/\/+$/, '')
  return rewriteFileUrls(html, { from: DRUPAL_FILES, to: `${origin}${DRUPAL_FILES}` })
}

/** The reverse, for anything on its way back out of the editor. */
export function relativeFileUrls(html, backendUrl) {
  if (!html || !backendUrl) return html
  const origin = String(backendUrl).replace(/\/+$/, '')
  return rewriteFileUrls(html, { from: `${origin}${DRUPAL_FILES}`, to: DRUPAL_FILES })
}
