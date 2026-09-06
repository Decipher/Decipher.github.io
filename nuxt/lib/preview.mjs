/**
 * Showing content that exists only in the cart.
 *
 * A listing is built from what the backend returns, so something written in the
 * browser and not yet sent appears nowhere: an author writes an article, sees
 * the front page unchanged, and reasonably concludes it was lost.
 *
 * What this cannot do is decide whether a view would really return it. That
 * needs the view's filters evaluated against the entity, which is Drupal's job
 * and needs Drupal. New content is marked as unpublished wherever it appears,
 * so it reads as a preview of an intention rather than a claim about what is
 * live.
 *
 * The evidence used is the types a listing is already returning. An empty
 * listing returns none, which made the one case this exists for the one case it
 * could not handle: write the site's first article and the front page goes on
 * saying no content has been created. So when there is no evidence, the view's
 * own configuration is read instead.
 */

/**
 * Whether a listing showing these types would plausibly show this resource.
 *
 * `types` is an exact list, from results or from a bundle filter. `entityTypes`
 * is the looser fallback: a view over nodes with no bundle filter returns any
 * bundle of node, so `node` accepts `node--article`.
 */
export function listingAccepts(accepted, resource) {
  if (!resource || !resource.type) return false
  const { types = [], entityTypes = [] } = Array.isArray(accepted)
    ? { types: accepted }
    : accepted || {}
  if (types.length) return types.includes(resource.type)
  const entityType = String(resource.type).split('--')[0]
  return entityTypes.includes(entityType)
}

/**
 * What a view says it lists, when it has returned nothing to go on.
 *
 * Every filter carries the entity type it applies to, and a `bundle` filter
 * names the bundles. Druxt reads the same filters to decide which `fields[]` to
 * ask for, so this is the view describing itself rather than a guess.
 */
export function listingTypes(display) {
  const filters = Object.values(((display || {}).display_options || {}).filters || {})
  const entityTypes = [...new Set(filters.map((filter) => filter.entity_type).filter(Boolean))]
  const types = []
  for (const filter of filters) {
    if (filter.plugin_id === 'bundle' && filter.value) {
      for (const bundle of Object.keys(filter.value)) types.push(`${filter.entity_type}--${bundle}`)
    }
  }
  return { types, entityTypes }
}

/**
 * Whether the resource plainly fails one of the view's filters.
 *
 * Only boolean filters, and only where the resource actually carries the field.
 * A new article that was never promoted has no `promote` attribute in the cart
 * at all, and Drupal's default for it is on, so absence has to read as "do not
 * know" rather than as "no". Unticking "Promoted" is a value, and that one is
 * worth honouring: the author has said where it does not belong.
 */
export function failsFilters(display, resource) {
  const attributes = (resource || {}).attributes || {}
  const filters = Object.values(((display || {}).display_options || {}).filters || {})
  return filters.some((filter) => {
    if (filter.plugin_id !== 'boolean' || !filter.field) return false
    const value = attributes[filter.field]
    if (value === undefined) return false
    return Boolean(Number(filter.value)) !== Boolean(value)
  })
}

/**
 * New content to add to a listing, in the order an author expects.
 *
 * Newest first, matching how a front page is usually sorted, and never
 * duplicating something the backend has already returned.
 */
export function previewsFor(results = [], staged = [], display) {
  // Results first, configuration second: what a view has actually returned
  // beats what its configuration suggests it might.
  //
  // The backend's rows only. Rows put here by a previous pass are marked, and
  // counting them made a listing's idea of what it accepts depend on what had
  // already been added to it: stage a page into an empty front page and it was
  // taken, stage an article first and the same page was refused. Which of those
  // happened came down to the order somebody wrote things in.
  const fromResults = [...new Set(results.filter((r) => !r.__staged).map((r) => r.type))]
  const accepted = fromResults.length ? { types: fromResults } : listingTypes(display)
  const present = new Set(results.map((result) => result.id))
  return staged
    .filter((resource) => resource.isNew && !resource.deleted)
    .filter((resource) => !present.has(resource.id))
    .filter((resource) => listingAccepts(accepted, resource))
    .filter((resource) => !failsFilters(display, resource))
    .reverse()
}

/**
 * A staged resource as a JSON:API document Druxt can render.
 *
 * The store is seeded with this so `DruxtEntity` finds it in cache and never
 * asks the backend for a uuid the backend has never heard of, which is a 404
 * and an entity that renders as nothing.
 */
export function asResource(resource) {
  return {
    // Druxt only trusts a cached resource that is marked complete. Without
    // this it fetches anyway, and the backend has never heard of this uuid, so
    // the row renders as a 404 instead of as the content just written.
    _druxt_full: true,
    data: {
      type: resource.type,
      id: resource.id,
      attributes: { ...(resource.attributes || {}) },
      relationships: { ...(resource.relationships || {}) },
    },
  }
}
