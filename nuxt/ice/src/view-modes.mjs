/**
 * The display modes a bundle actually has.
 *
 * Drupal decides these, a site can have any number of them, and the two places
 * that offer a choice of them, the preview modal and the edit panel, were
 * working from separate ideas of what was available. One of them was a
 * hardcoded three.
 *
 * `default` is always first and always present, because it is what an entity
 * renders as when nothing says otherwise, and a bundle with no display config
 * still has one.
 */
export function modesFromDisplays(displays, type) {
  const [entityType, bundle] = String(type || '').split('--')
  const found = (displays || [])
    .map((display) => display.attributes || {})
    .filter((attributes) => attributes.bundle === bundle)
    .filter((attributes) => attributes.targetEntityType === entityType)
    .map((attributes) => attributes.mode)
    .filter(Boolean)
  return [...new Set(['default', ...found])]
}

/**
 * Ask Drupal, and settle for `default` if it will not say.
 *
 * `entity_view_display--entity_view_display` is one of the resources Druxt
 * exposes to its own permission, so this works for a session that could not
 * read the display configuration any other way.
 */
export async function viewModesFor(druxt, type) {
  try {
    const displays = await druxt.getCollection('entity_view_display--entity_view_display')
    return modesFromDisplays(displays.data, type)
  } catch {
    return ['default']
  }
}
