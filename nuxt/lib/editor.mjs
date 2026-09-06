/**
 * Building a CKEditor toolbar from Drupal's own editor configuration.
 *
 * Drupal already knows what each text format's editor looks like: `editor--editor`
 * carries `settings.toolbar.items`, the exact list configured at
 * `/admin/config/content/formats`. Reading it means the frontend offers the
 * buttons the site was configured for rather than a set someone guessed, and a
 * change made in Drupal reaches the frontend without a deploy.
 *
 * That resource needs `administer filters` to read, so it is only available to
 * an authenticated author, which is the only time an editor is on screen
 * anyway. Anonymous gets the fallback.
 */

import { SUPPORTED_BUTTONS } from './ckeditor.mjs'

/**
 * Buttons this build can render.
 *
 * Drupal's list is its own vocabulary and can name buttons that are not there:
 * `drupalInsertImage` is Drupal's own, and passing a button whose plugin is
 * missing throws `toolbarview-item-unavailable` and takes the whole editor down
 * with it. So the list is filtered to what `lib/ckeditor.mjs` has a plugin for.
 */
export const SUPPORTED = new Set([...SUPPORTED_BUTTONS, '|'])

/**
 * Drupal's name for a button, where CKEditor calls it something else.
 *
 * `drupalInsertImage` is the button Drupal's own module registers for inserting
 * an image. The thing it does is CKEditor's `uploadImage`, so the name is
 * translated rather than the button dropped: the site is configured to offer
 * image insertion, and it can be offered.
 */
export const ALIASES = {
  drupalInsertImage: 'uploadImage',
}

/** Used when Drupal's configuration cannot be read, which is the anonymous case. */
export const FALLBACK_TOOLBAR = [
  'heading', '|', 'bold', 'italic', 'link', '|', 'bulletedList', 'numberedList',
  '|', 'blockQuote', '|', 'undo', 'redo',
]

/**
 * Pick the editor configured for a text format out of a JSON:API collection.
 *
 * Matched on `drupal_internal__format`, the machine name the field's value
 * carries, rather than on the resource id, which the field never mentions.
 */
export function editorForFormat(resources, format) {
  if (!Array.isArray(resources) || !format) return null
  return (
    resources.find(
      (r) => ((r || {}).attributes || {}).drupal_internal__format === format
    ) || null
  )
}

/**
 * The toolbar for a format, as CKEditor wants it.
 *
 * Collapses runs of separators and trims them from the ends, because removing
 * an unsupported button often leaves a `|` with nothing on one side, which
 * renders as a stray divider.
 */
export function toolbarFor(resources, format) {
  const editor = editorForFormat(resources, format)
  const items = (((editor || {}).attributes || {}).settings || {}).toolbar
  const configured = Array.isArray((items || {}).items) ? items.items : null
  if (!configured || !configured.length) return [...FALLBACK_TOOLBAR]

  const named = configured.map((item) => ALIASES[item] || item)
  const supported = named.filter((item) => SUPPORTED.has(item))
  const tidied = supported.filter(
    (item, i, all) => !(item === '|' && (i === 0 || all[i - 1] === '|'))
  )
  while (tidied.length && tidied[tidied.length - 1] === '|') tidied.pop()

  // Every configured button was one this build cannot render, which is a
  // configuration worth falling back from rather than showing an empty bar.
  return tidied.length ? tidied : [...FALLBACK_TOOLBAR]
}
