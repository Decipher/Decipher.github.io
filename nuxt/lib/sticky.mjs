/**
 * How much of the top of the viewport this site has already spoken for.
 *
 * The header is pinned there, and on a page with a trail the breadcrumb bar is
 * pinned under it. Anything else that wants to pin itself has to start below
 * both, and there are three of them now: CKEditor's toolbar, the edit panel,
 * and whatever comes next. Each measuring the stack for itself is three chances
 * to disagree.
 *
 * Measured rather than written down. The breadcrumb bar only exists on pages
 * that have a trail, so the stack is 64 on the front page and 109 on an
 * article, and a constant would be wrong on one of them.
 */

/** The bands this site pins to the top. In order, because they stack. */
export const STICKY_BANDS = '.druxt-region-top, .druxt-region-bar'

/** The custom property everything else reads, so the number is decided once. */
export const STICKY_VARIABLE = '--sticky-top'

/**
 * Total height of the bands currently pinned.
 *
 * A band that is present but not sticky does not count: the same markup is used
 * at widths where the header scrolls away, and counting it would leave a gap
 * the size of a header under everything.
 */
export function stickyOffset(document, window) {
  if (!document || typeof document.querySelectorAll !== 'function') return 0
  const view = window || (typeof globalThis !== 'undefined' ? globalThis.window : null)
  if (!view || typeof view.getComputedStyle !== 'function') return 0

  let offset = 0
  for (const band of document.querySelectorAll(STICKY_BANDS)) {
    if (view.getComputedStyle(band).position !== 'sticky') continue
    offset += band.getBoundingClientRect().height
  }
  return Math.round(offset)
}

/**
 * Publish the measurement, so CSS can use it too.
 *
 * A custom property rather than a value passed around, because most of the
 * things that need it are stylesheets rather than scripts: a panel that wants
 * to be as tall as the space left needs it inside a `calc`, and cannot ask a
 * component for it.
 */
export function publishStickyOffset(document, window) {
  if (!document || !document.documentElement) return 0
  const offset = stickyOffset(document, window)
  document.documentElement.style.setProperty(STICKY_VARIABLE, `${offset}px`)
  return offset
}
