/**
 * The authoring cart's decisions, with no browser and no Vuex in them.
 *
 * What an author stages is a JSON:API resource object: a `type`, an `id`, and
 * only the fields they actually changed. That is deliberately the same shape
 * Drupal accepts in a PATCH body and the same shape a content pull request
 * carries, so a cart can be sent to a backend or turned into a change request
 * without being converted first.
 *
 * Keeping this here rather than in the store module means the merging and diff
 * rules can be tested directly, which matters: they are where the subtle bugs
 * live.
 */

/** One cart entry per entity, so repeated edits to one thing do not stack. */
export function cartKey(type, id) {
  return `${type}:${id}`
}

/**
 * Reduce an edited entity to only what changed.
 *
 * Sending the whole entity back would overwrite fields the author never looked
 * at with whatever the page happened to be holding, which is how a stale form
 * quietly reverts someone else's work.
 */
export function changedFields(original = {}, edited = {}) {
  const changed = {}
  for (const [field, value] of Object.entries(edited)) {
    if (!deepEqual(original[field], value)) {
      changed[field] = value
    }
  }
  return changed
}

/** Structural comparison, so field values are compared by content. */
export function deepEqual(a, b) {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => deepEqual(a[key], b[key]))
}

/**
 * Fold a new edit into whatever is already staged for that entity.
 *
 * Later edits win field by field rather than replacing the entry, so changing
 * the title and then the body leaves both staged, not just the body.
 */
export function mergeEntry(existing, incoming) {
  if (!existing) return incoming
  return {
    ...existing,
    attributes: { ...(existing.attributes || {}), ...(incoming.attributes || {}) },
    relationships: {
      ...(existing.relationships || {}),
      ...(incoming.relationships || {}),
    },
  }
}

/** Drop the empty halves, so a resource carries no bare `attributes: {}`. */
export function tidyResource(resource) {
  const out = { type: resource.type, id: resource.id }
  if (resource.attributes && Object.keys(resource.attributes).length) {
    out.attributes = resource.attributes
  }
  if (resource.relationships && Object.keys(resource.relationships).length) {
    out.relationships = resource.relationships
  }
  return out
}

/** True when there is nothing worth sending. */
export function isEmptyResource(resource) {
  const tidy = tidyResource(resource)
  return !tidy.attributes && !tidy.relationships
}

/**
 * The PATCH body for one staged resource.
 *
 * JSON:API wraps the resource in `data`, and the id has to be in the body as
 * well as the URL or Drupal rejects the request.
 */
export function patchBody(resource) {
  return { data: tidyResource(resource) }
}

/** Where that PATCH goes, given a backend and its resource type. */
export function patchUrl(backendUrl, type, id) {
  // JSON:API types are `entity_type--bundle`, and the path is the two parts
  // separated by a slash.
  const [entityType, bundle] = type.split('--')
  const path = bundle ? `${entityType}/${bundle}` : entityType
  return `${backendUrl.replace(/\/+$/, '')}/jsonapi/${path}/${id}`
}

/**
 * The cart as a document that can be committed without a backend.
 *
 * The second thing a cart is for. With a backend it becomes PATCH requests;
 * without one it becomes a file in a change request, which is the only way to
 * propose an edit to a site whose backend is switched off most of the time.
 *
 * Sorted by key so the same edits always produce the same bytes: an export that
 * reordered itself would show as a change in every diff.
 */
export function exportCart(entries, { generatedAt } = {}) {
  const resources = Object.keys(entries)
    .sort()
    .map((key) => tidyResource(entries[key]))

  return {
    // Versioned from the start: whatever consumes this on the Drupal side has
    // to be able to tell which shape it is reading.
    version: 1,
    generatedAt: generatedAt || new Date().toISOString(),
    resources,
  }
}

/**
 * A commit message describing what the cart holds.
 *
 * Says what changed rather than that something did, so a change request is
 * readable in a list without opening it.
 */
export function exportSummary(entries) {
  const resources = Object.values(entries)
  if (!resources.length) return 'chore(content): no changes'

  const types = [...new Set(resources.map((r) => r.type.split('--')[0]))].sort()
  const count = resources.length
  const noun = count === 1 ? 'entity' : 'entities'
  return `chore(content): edit ${count} ${noun} (${types.join(', ')})`
}
