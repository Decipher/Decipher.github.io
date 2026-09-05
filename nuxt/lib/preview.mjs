/**
 * Showing content that exists only in the cart.
 *
 * A listing is built from what the backend returns, so something written in the
 * browser and not yet sent appears nowhere: an author writes an article, sees
 * the front page unchanged, and reasonably concludes it was lost.
 *
 * What this cannot do is decide whether a view would really return it. That
 * needs the view's filters evaluated against the entity, which is Drupal's job
 * and needs Drupal. This matches on the resource type a listing is already
 * showing, which is right for the common case and wrong for a view with
 * filters. New content is marked as unpublished wherever it appears, so it
 * reads as a preview of an intention rather than a claim about what is live.
 */

/**
 * Whether a listing showing these types would plausibly show this resource.
 *
 * The types a view is already returning, rather than its configuration: the
 * configuration would have to be interpreted, and the results are evidence.
 */
export function listingAccepts(resultTypes, resource) {
  if (!resource || !resource.type) return false
  return resultTypes.includes(resource.type)
}

/**
 * New content to add to a listing, in the order an author expects.
 *
 * Newest first, matching how a front page is usually sorted, and never
 * duplicating something the backend has already returned.
 */
export function previewsFor(results = [], staged = []) {
  const types = [...new Set(results.map((result) => result.type))]
  const present = new Set(results.map((result) => result.id))
  return staged
    .filter((resource) => resource.isNew && !resource.deleted)
    .filter((resource) => !present.has(resource.id))
    .filter((resource) => listingAccepts(types, resource))
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
