/**
 * Which fields belong out of the way, and which are the content itself.
 *
 * Drupal's own node form does this with vertical tabs down the side: the title
 * and the body are the page, while the URL alias, the publishing flags and the
 * authoring information sit in an "Advanced" column nobody looks at until they
 * need it. druxt-schema does not carry the field group configuration that
 * arrangement comes from, so the same split is made here by field name.
 *
 * Named rather than derived, because the distinction is editorial, not
 * technical. `status` is a boolean like any other; it is set apart because
 * publishing something is a different decision from writing it.
 */
const ADVANCED_FIELDS = [
  'comment',
  'created',
  'langcode',
  'menu',
  'path',
  'promote',
  'revision_log',
  'status',
  'sticky',
  'uid',
]

/** Split field ids into what the author writes, and what they set. */
export function groupFields(ids = []) {
  const content = []
  const advanced = []
  for (const id of ids) {
    ;(ADVANCED_FIELDS.includes(id) ? advanced : content).push(id)
  }
  return { content, advanced }
}

export { ADVANCED_FIELDS }
