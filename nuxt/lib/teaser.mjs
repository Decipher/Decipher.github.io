/**
 * Trimmed text fields, which JSON:API does not trim.
 *
 * A teaser display asks for `text_summary_or_trimmed` with a trim length.
 * Drupal applies that when it renders; JSON:API returns the stored field,
 * summary and processed body alike, because it is an API rather than a render
 * pipeline.
 *
 * Consuming the formatter is the theme's job. Druxt hands the field's schema to
 * the component rendering it, settings included, and what a display is
 * configured to do is then a decision the theme makes rather than one the
 * framework makes for it. This is that decision for the trimming formatters;
 * without it a front page of teasers renders whole articles.
 *
 * Pure, so the trimming can be tested without a browser.
 */

/** The formatters this applies to, as Drupal names them. */
export const TRIMMING_FORMATTERS = ['text_summary_or_trimmed', 'text_trimmed']

export function isTrimmed(type) {
  return TRIMMING_FORMATTERS.includes(String(type || ''))
}

/**
 * Cut text to a length, at a word.
 *
 * Cutting mid-word reads as a bug rather than as a summary.
 */
export function trimWords(text, length) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (value.length <= length) return value
  const cut = value.slice(0, length)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.]$/, '')}...`
}

/**
 * What a trimmed formatter should show for one field value.
 *
 * An editor's own summary wins, because somebody wrote it to be the summary.
 * Failing that the body is cut down.
 *
 * The cut down version is plain text wrapped in a paragraph, not trimmed HTML. Cutting
 * markup at a character count leaves tags unclosed, and a teaser that opens a
 * `<figure>` it never closes takes the rest of the page inside it.
 */
export function teaserHtml(value, { trimLength = 600, summary } = {}) {
  const own = String(summary ?? (value || {}).summary ?? '').trim()
  if (own) return own

  const body = typeof value === 'string' ? value : (value || {}).processed || (value || {}).value
  const text = String(body || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
  const trimmed = trimWords(text, trimLength)
  return trimmed ? `<p>${trimmed}</p>` : ''
}
