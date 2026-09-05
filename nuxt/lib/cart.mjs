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
 * An id for something that does not exist yet.
 *
 * New content has no id until Drupal gives it one, but the cart is keyed by id
 * and the UI has to be able to name the thing being edited. A client-generated
 * UUID solves both: JSON:API accepts a client-supplied id on create, so the
 * placeholder becomes the real id rather than being swapped for one.
 */
export function newResourceId() {
  const bytes = new Uint8Array(16)
  ;(globalThis.crypto || require('node:crypto').webcrypto).getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
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
    // Both sides stripped, not just the one being kept. A value that has
    // already been through here has no `processed`, and comparing that against
    // a freshly fetched one that still has it makes every field look edited.
    const next = withoutComputed(value)
    if (!deepEqual(withoutComputed(original[field]), next)) {
      changed[field] = next
    }
  }
  return changed
}

/**
 * Properties Drupal computes, which are never the author's to send back.
 *
 * A text field arrives as `{ value, format, processed }`, where `processed` is
 * the filtered HTML Drupal rendered from `value`. Keeping it means staging a
 * rendering of the text as it was before the edit, which is stale the moment
 * anything is typed, and which anything displaying the field prefers over the
 * value the author actually wrote. So an edit would stage correctly, commit
 * correctly, and show the old text on the page.
 */
const COMPUTED_PROPERTIES = ['processed']

export function withoutComputed(value) {
  if (Array.isArray(value)) return value.map(withoutComputed)
  if (!value || typeof value !== 'object') return value
  const kept = {}
  for (const [key, item] of Object.entries(value)) {
    if (!COMPUTED_PROPERTIES.includes(key)) kept[key] = item
  }
  return kept
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
export function mergeEntry(existing, incoming, considered = {}) {
  if (!existing) return incoming
  return {
    ...existing,
    // Carried through: without it a second edit to unsaved content would be
    // sent as a PATCH against an entity the backend has never seen.
    isNew: Boolean(existing.isNew || incoming.isNew),
    files: { ...(existing.files || {}), ...(incoming.files || {}) },
    // What the backend had, kept from the first edit onwards so the drawer can
    // show a change rather than only its result. Existing wins: the first one
    // recorded is the one the backend actually holds.
    before: { ...(incoming.before || {}), ...(existing.before || {}) },
    attributes: {
      ...withoutReverted(existing.attributes, incoming.attributes, considered.attributes),
      ...(incoming.attributes || {}),
    },
    relationships: {
      ...withoutReverted(
        existing.relationships,
        incoming.relationships,
        considered.relationships
      ),
      ...(incoming.relationships || {}),
    },
  }
}

/**
 * Drop what the author has since put back the way it was.
 *
 * A staged edit is a delta, so a field the author reverts stops appearing in
 * the new one. Merging on top of what was staged before would then keep the
 * old value forever: the form shows the original, the cart holds the edit, and
 * committing writes back a change nobody can see any more.
 *
 * `considered` is the set of fields the form actually had in front of it. A
 * field absent from that is not reverted, it was simply not on this form, so it
 * stays staged.
 */
function withoutReverted(staged, incoming, considered) {
  if (!staged) return {}
  if (!Array.isArray(considered)) return { ...staged }
  const kept = {}
  for (const [field, value] of Object.entries(staged)) {
    const reverted = considered.includes(field) && !(field in (incoming || {}))
    if (!reverted) kept[field] = value
  }
  return kept
}

/** Drop the empty halves, so a resource carries no bare `attributes: {}`. */
export function tidyResource(resource) {
  // `isNew`, `deleted` and `files` are the cart's own bookkeeping, not part of
  // the JSON:API document, so they never reach the wire.
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
  // A removal changes everything about the thing, and carries no fields at all.
  if (isDeletion(resource)) return false
  // Nor is content that does not exist yet: bringing it into being is the
  // change, whatever is in it. An author who pressed Add and then Done meant
  // the article to exist, and Drupal will say if it is missing a title.
  if (isNew(resource)) return false
  // Bytes waiting to be uploaded are a change, even though they are not part of
  // the document that gets sent.
  if (Object.keys((resource || {}).files || {}).length) return false
  const tidy = tidyResource(resource)
  return !tidy.attributes && !tidy.relationships
}

/**
 * Whether a staged resource is something new.
 *
 * Decides the verb and the URL on commit: new content is POSTed to the
 * collection, an edit is PATCHed to the entity.
 */
export function isNew(resource) {
  return Boolean(resource && resource.isNew)
}

/** POST for something new, PATCH for an edit. */
export function requestMethod(resource) {
  if (isDeletion(resource)) return 'DELETE'
  return isNew(resource) ? 'POST' : 'PATCH'
}

/**
 * Whether this staged change is a removal.
 *
 * Deleting is staged like everything else rather than done on the spot: an
 * author should be able to change their mind, and a deletion nobody reviewed is
 * the one edit that cannot be undone from a pull request.
 */
export function isDeletion(resource) {
  return Boolean((resource || {}).deleted)
}

/**
 * The PATCH body for one staged resource.
 *
 * JSON:API wraps the resource in `data`, and the id has to be in the body as
 * well as the URL or Drupal rejects the request.
 */
export function patchBody(resource) {
  // A DELETE carries nothing. Drupal answers 422 to a body it did not ask for.
  if (isDeletion(resource)) return null
  return { data: tidyResource(resource) }
}

/** Where that PATCH goes, given a backend and its resource type. */
export function patchUrl(backendUrl, type, id) {
  return `${collectionUrl(backendUrl, type)}/${id}`
}

/** The collection a resource type lives at, which is where new content is POSTed. */
export function collectionUrl(backendUrl, type) {
  // JSON:API types are `entity_type--bundle`, and the path is the two parts
  // separated by a slash.
  const [entityType, bundle] = type.split('--')
  const path = bundle ? `${entityType}/${bundle}` : entityType
  return `${backendUrl.replace(/\/+$/, '')}/jsonapi/${path}`
}

/** Where one staged resource is sent, given what it is. */
export function requestUrl(backendUrl, resource) {
  return isNew(resource) && !isDeletion(resource)
    ? collectionUrl(backendUrl, resource.type)
    : patchUrl(backendUrl, resource.type, resource.id)
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
  const keys = Object.keys(entries).sort()
  // Dependency order, not key order: whatever applies this document has to
  // create a tag before the article that references it, and working that out
  // again on the other side is the same graph computed twice.
  const resources = commitOrder(keys.map((key) => entries[key])).map(tidyResource)

  return {
    // Versioned from the start: whatever consumes this on the Drupal side has
    // to be able to tell which shape it is reading.
    version: 1,
    generatedAt: generatedAt || new Date().toISOString(),
    resources,
    // Deletions carry no fields, so without this they are indistinguishable
    // from an edit that changed nothing.
    deletions: keys
      .filter((key) => isDeletion(entries[key]))
      .map((key) => ({ type: entries[key].type, id: entries[key].id })),
    // The bytes, so the document stands on its own. A change request naming a
    // file id with the file nowhere in it cannot be applied by anything.
    files: keys.flatMap((key) =>
      Object.entries(entries[key].files || {}).map(([field, file]) => ({
        resource: { type: entries[key].type, id: entries[key].id },
        field,
        id: file.id,
        name: file.name,
        contentType: file.type,
        data: file.dataUrl,
      }))
    ),
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

/**
 * The order to send staged resources in.
 *
 * A tag created while writing an article is two staged resources: the term, and
 * the article that now references it. Sent the other way round, the article
 * references a term the backend has never heard of and the whole edit is
 * rejected for a reason that has nothing to do with what the author did.
 *
 * So anything referenced by another staged resource goes first. Depth first, so
 * a chain of new references still comes out in order, and cycle safe, because a
 * pair of resources referencing each other is a stalled commit rather than a
 * hung browser.
 */
export function commitOrder(resources = []) {
  const byId = new Map(resources.map((resource) => [resource.id, resource]))

  const referencedBy = (resource) =>
    Object.values(resource.relationships || {}).flatMap((relationship) => {
      const data = (relationship || {}).data
      if (!data) return []
      return (Array.isArray(data) ? data : [data]).map((item) => item.id)
    })

  const ordered = []
  const done = new Set()
  const visiting = new Set()

  const visit = (resource) => {
    if (done.has(resource.id) || visiting.has(resource.id)) return
    visiting.add(resource.id)
    for (const id of referencedBy(resource)) {
      const dependency = byId.get(id)
      if (dependency) visit(dependency)
    }
    visiting.delete(resource.id)
    done.add(resource.id)
    ordered.push(resource)
  }

  resources.forEach(visit)
  return ordered
}

/**
 * What each staged resource needs sent with it.
 *
 * Only staged resources count. Almost every reference is to content that
 * already exists on the backend, and waiting for those would mean never
 * sending anything.
 */
export function dependencyMap(resources = []) {
  const staged = new Set(resources.map((resource) => resource.id))
  const map = new Map()
  for (const resource of resources) {
    const needs = new Set()
    for (const relationship of Object.values(resource.relationships || {})) {
      const data = (relationship || {}).data
      if (!data) continue
      for (const item of Array.isArray(data) ? data : [data]) {
        if (item && item.id !== resource.id && staged.has(item.id)) needs.add(item.id)
      }
    }
    map.set(resource.id, [...needs])
  }
  return map
}

/**
 * A selection, plus everything it cannot be sent without.
 *
 * Choosing an article that references a tag which does not exist yet is
 * choosing the tag too, whether or not the author ticked it. The alternative is
 * a commit that fails on a reference the author cannot see.
 */
export function withDependencies(selected = [], resources = []) {
  const map = dependencyMap(resources)
  const out = new Set()
  const visit = (id) => {
    if (out.has(id)) return
    out.add(id)
    for (const needed of map.get(id) || []) visit(needed)
  }
  selected.forEach(visit)
  return [...out]
}

/**
 * Which selected resources would break if this one were left behind.
 *
 * Used to refuse rather than to correct: silently re-ticking something the
 * author just unticked is its own kind of wrong, and the reason is worth
 * saying.
 */
export function requiredBy(id, selected = [], resources = []) {
  const map = dependencyMap(resources)
  return selected.filter((other) => other !== id && (map.get(other) || []).includes(id))
}

/**
 * What the backend held for the fields a change touches.
 *
 * Kept so the drawer can show a change rather than only its outcome: a staged
 * resource is a delta, and a delta on its own says what a field will be without
 * saying what it was.
 */
export function valuesBefore(original = {}, changed = {}) {
  const before = {}
  for (const field of Object.keys(changed)) {
    before[field] = withoutComputed(original[field])
  }
  return before
}
