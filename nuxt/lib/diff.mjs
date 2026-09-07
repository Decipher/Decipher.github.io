/**
 * Showing what changed in a long value, rather than the first hundred
 * characters of two values that both start the same way.
 *
 * The drawer used to print the old value and the new one, each cut short. That
 * works for a title and is useless for a body: an author who changed one word
 * in the fourth paragraph saw two identical-looking openings and no way to tell
 * what they had done.
 *
 * Deliberately not a full diff. Trimming the words the two versions share at
 * each end leaves exactly the part that changed, which is what an edit almost
 * always is: something inserted, removed or replaced in one place. It costs one
 * pass over each version, where a real longest-common-subsequence diff on a
 * body of a few thousand words is millions of comparisons for a nicer answer to
 * a question nobody asked.
 *
 * The cost is honest and worth stating: two separate edits far apart are shown
 * as one change spanning both, because everything between them is inside the
 * changed region. That reads as more changed than really did, which is the safe
 * direction to be wrong in.
 */

/** Split into words, keeping the whitespace so the text can be put back. */
export function words(value) {
  return String(value == null ? '' : value).split(/(\s+)/).filter((part) => part !== '')
}

/**
 * What changed, as the unchanged head, the two middles, and the unchanged tail.
 *
 * Either middle can be empty: an insertion has nothing removed, a deletion has
 * nothing added.
 */
export function changedRegion(before, after) {
  const from = words(before)
  const to = words(after)

  let head = 0
  while (head < from.length && head < to.length && from[head] === to[head]) head += 1

  let tail = 0
  while (
    tail < from.length - head &&
    tail < to.length - head &&
    from[from.length - 1 - tail] === to[to.length - 1 - tail]
  ) {
    tail += 1
  }

  return {
    head: from.slice(0, head),
    removed: from.slice(head, from.length - tail),
    added: to.slice(head, to.length - tail),
    tail: tail ? from.slice(from.length - tail) : [],
  }
}

/**
 * The changed region with a few words either side, and a mark where text was cut.
 *
 * Context so the change can be placed in the text: "the" replaced by "a" says
 * nothing without the words around it.
 */
export function diffLines(before, after, { context = 6 } = {}) {
  const region = changedRegion(before, after)
  if (!region.removed.length && !region.added.length) return null

  const lead = region.head.slice(-context * 2)
  const trail = region.tail.slice(0, context * 2)
  const elidedStart = region.head.length > lead.length
  const elidedEnd = region.tail.length > trail.length

  const join = (parts) => parts.join('')
  const wrap = (middle) => {
    if (!middle.length) return null
    return `${elidedStart ? '...' : ''}${join(lead)}${join(middle)}${join(trail)}${elidedEnd ? '...' : ''}`
  }

  return {
    removed: wrap(region.removed),
    added: wrap(region.added),
    // The words either side, so a caller can show them dimmed if it wants to.
    lead: join(lead),
    trail: join(trail),
  }
}

/** Whether a value is long enough that showing all of it says nothing. */
export function isLong(value, limit = 120) {
  return String(value == null ? '' : value).length > limit
}
