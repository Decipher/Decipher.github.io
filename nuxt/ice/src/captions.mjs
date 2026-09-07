/**
 * Captions, which Drupal keeps in an attribute rather than in the markup.
 *
 * An image caption written in CKEditor is stored as `data-caption` on the
 * `<img>`, and Drupal's `filter_caption` turns it into a `<figure>` with a
 * `<figcaption>` when the field is rendered. That is why the published article
 * has figures in it that are nowhere in the field's stored value.
 *
 * This frontend gets both forms. `body.processed` has been through Drupal's
 * filters and already has its figures; a value staged in the browser has not
 * been near Drupal and still has the attribute. Rendering the staged one as-is
 * showed the picture and silently dropped every caption, which made a preview
 * of an edit look like a page that had lost them.
 *
 * So the filter is applied here too, for the values Drupal has not filtered.
 * Deliberately the same shape of output as `FilterCaption`, so that what the
 * preview shows and what the built page shows are the same thing.
 *
 * String work rather than DOM work, because this also has to run in the tests,
 * and because it is the same reason `files.mjs` is written the way it is.
 */

/** Images and media that carry a caption, with the attribute in either quote. */
const CAPTIONED = /<(img|drupal-media)\b[^>]*\bdata-caption\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi

/** The attribute itself, so it can be taken back out of the tag. */
const CAPTION_ATTRIBUTE = /\s*\bdata-caption\s*=\s*("[^"]*"|'[^']*')/i

/**
 * Wrap captioned images in the figure Drupal would have rendered.
 *
 * A caption is stored entity encoded, because it lives in an attribute, so it
 * is decoded once on the way into the figure. That is the same trust boundary
 * the rest of this body already sits on: the markup is rendered with `v-html`
 * either way, and the caption came from the same field as the rest of it.
 */
export function applyCaptionFilter(html) {
  if (!html || !String(html).includes('data-caption')) return html

  return String(html).replace(CAPTIONED, (tag, _name, _quoted, double, single) => {
    const caption = double !== undefined ? double : single || ''
    const stripped = tag.replace(CAPTION_ATTRIBUTE, '')
    // The same attributes `FilterCaption` writes, so a staged preview and the
    // published page are the same markup and not merely similar.
    return `<figure role="group" class="caption">${stripped}<figcaption>${decodeAttribute(caption)}</figcaption></figure>`
  })
}

/**
 * An attribute value back into the markup it stands for.
 *
 * A caption is allowed to contain a link or an emphasis, and those arrive here
 * as `&lt;em&gt;`; leaving them encoded would print the tags at the reader.
 *
 * Numeric references are decoded as well as named ones, because what wrote the
 * attribute is not always what reads it: an apostrophe can arrive as `&#39;` or
 * as `&#x27;`, and handling only the first meant every round trip through the
 * editor re-encoded the ampersand of the second. The caption grew an `&amp;`
 * each time, and because the value never came back the same, the field decided
 * on every keystroke that it had changed and pushed itself into the editor
 * again.
 *
 * `&amp;` is decoded last, so a literal `&amp;lt;` stays the text it is.
 */
export function decodeAttribute(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .split('&lt;')
    .join('<')
    .split('&gt;')
    .join('>')
    .split('&quot;')
    .join('"')
    .split('&amp;')
    .join('&')
}

/**
 * Whether a value still needs the filter, which is to say Drupal has not run it.
 *
 * A fresh expression each time, because `CAPTIONED` is global and `test` on a
 * global regexp carries `lastIndex` from the call before it: the same string
 * would answer true, then false, then true.
 */
export function hasUnfilteredCaption(html) {
  return new RegExp(CAPTIONED.source, 'i').test(String(html || ''))
}

/**
 * The same caption, in the shape CKEditor works in.
 *
 * CKEditor keeps a caption as a `<figcaption>` inside `<figure class="image">`
 * and knows nothing about `data-caption`: an attribute it has no schema for is
 * dropped on the way in, so an article opened for editing came back with every
 * caption gone, silently, and staging that committed the loss.
 *
 * Translated here rather than in a downcast converter. Doing it in the pipeline
 * means overriding the converter that builds the image's figure, which is one
 * that fills slots, and CKEditor answers `conversion-slot-filter-incomplete`.
 * A pair of string transforms either side of the editor does the same job in a
 * place that can be tested without starting one, which is how the file URLs are
 * already handled.
 */
export function toEditorCaptions(html) {
  if (!html || !String(html).includes('data-caption')) return html

  return String(html).replace(CAPTIONED, (tag, _name, _quoted, double, single) => {
    const caption = double !== undefined ? double : single || ''
    const stripped = tag.replace(CAPTION_ATTRIBUTE, '')
    return `<figure class="image">${stripped}<figcaption>${decodeAttribute(caption)}</figcaption></figure>`
  })
}

/** A figure CKEditor built, back to the attribute Drupal stores. */
const EDITOR_FIGURE =
  /<figure\b[^>]*\bclass\s*=\s*["'][^"']*\bimage\b[^"']*["'][^>]*>\s*(?<img><img\b[^>]*>)\s*<figcaption[^>]*>(?<caption>[\s\S]*?)<\/figcaption>\s*<\/figure>/gi

/**
 * The reverse, for anything on its way back out of the editor.
 *
 * A figure with no caption in it is left alone rather than unwrapped: that is
 * CKEditor's own markup for a plain block image, and Drupal stores it as such.
 */
export function fromEditorCaptions(html) {
  if (!html || !String(html).includes('<figcaption')) return html

  return String(html).replace(EDITOR_FIGURE, (figure, ...args) => {
    const { img, caption } = args[args.length - 1]
    const text = String(caption).trim()
    if (!text) return figure
    return img.replace(/\s*\/?>$/, ` data-caption="${encodeAttribute(text)}">`)
  })
}

/** The inverse of `decodeAttribute`, for putting markup back into an attribute. */
export function encodeAttribute(value) {
  return String(value || '')
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;')
}

/** The filter that turns `data-caption` into a figure when the field renders. */
export const CAPTION_FILTER = 'filter_caption'

/**
 * Whether captions belong in an attribute for this format.
 *
 * Only when Drupal will build the figure back. Writing `data-caption` into a
 * format that does not run `filter_caption` puts the words somewhere nothing
 * reads: the picture renders, the caption is gone, and no error is raised
 * anywhere. Leaving the editor's own `<figcaption>` alone is the safe answer,
 * because that at least renders as itself.
 *
 * Unknown formats are treated as running it. Every format that ships with
 * Drupal and permits images runs it, and the alternative default silently
 * changes how existing content is stored the first time a format cannot be
 * looked up.
 */
export function captionsAreAttributes(filters, format) {
  const known = (filters || {})[format]
  if (!Array.isArray(known)) return true
  return known.includes(CAPTION_FILTER)
}
