/**
 * Between what JSON:API sends and what a date input accepts.
 *
 * Drupal sends a timestamp field as ISO 8601 with an offset,
 * `2026-09-04T14:30:00+00:00`. `<input type="datetime-local">` will not take
 * that: it wants `YYYY-MM-DDTHH:mm` and nothing else, so it silently shows an
 * empty field rather than complaining, and the author sees a date field that
 * cannot hold the date it was given.
 */

/** ISO 8601 to what a `datetime-local` input will display. */
export function toDateInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  // The input has no timezone, so it shows local time, which is what an author
  // means by "when this was created".
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** What the input holds, back to what Drupal accepts. */
export function fromDateInput(local) {
  if (!local) return null
  const date = new Date(local)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}
