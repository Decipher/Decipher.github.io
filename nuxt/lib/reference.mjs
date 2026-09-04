/**
 * Resolving what an entity reference field points at, and how to search it.
 *
 * Drupal's autocomplete widget knows its target from the field definition and
 * queries the entity type directly. JSON:API has no autocomplete endpoint, so
 * the same thing is done with a filter, which means working out three things
 * the widget gets for free: which resource type to search, which field holds
 * the label, and how to match.
 *
 * The field settings come from druxt-schema, which keeps them in two places:
 * `settings.storage` is the field storage config, `settings.config` is the
 * field config. Which one holds what is not obvious, so, from a real article:
 *
 *   field.storage.node.field_tags  settings: { target_type: taxonomy_term }
 *   field.field.node.article.field_tags
 *     settings: { handler: 'default:taxonomy_term',
 *                 handler_settings: { target_bundles: { tags: tags } } }
 *
 * A base field such as `uid` has neither, so both come back empty and the
 * target has to be recognised by name.
 */

/** The label field for an entity type, which JSON:API does not announce. */
const LABEL_FIELDS = {
  node: 'title',
  taxonomy_term: 'name',
  user: 'display_name',
  media: 'name',
  block_content: 'info',
}

/**
 * Label fields that cannot be filtered on, and what to filter on instead.
 *
 * A user is labelled by `display_name`, which is computed rather than stored.
 * Filtering on it is a 500 from Drupal, so the search uses `name`, which is
 * what Drupal's own user autocomplete matches.
 */
const FILTER_FIELDS = {
  user: 'name',
}

/**
 * Base fields that reference something, and what they reference.
 *
 * Configurable fields say what they target. Base fields have no field config
 * and no field storage config, so there is nothing to read and the only way to
 * know is to recognise the field.
 */
const BASE_FIELD_TARGETS = {
  uid: 'user--user',
  revision_uid: 'user--user',
}

export function labelFieldFor(entityType) {
  return LABEL_FIELDS[entityType] || 'name'
}

export function filterFieldFor(entityType) {
  return FILTER_FIELDS[entityType] || labelFieldFor(entityType)
}

/** The label to show for a resource, whatever kind it is. */
export function labelOf(resource) {
  const attributes = (resource || {}).attributes || {}
  const type = String((resource || {}).type || '').split('--')[0]
  return (
    attributes[labelFieldFor(type)] ||
    attributes.title ||
    attributes.name ||
    attributes.display_name ||
    (resource || {}).id ||
    ''
  )
}

/** The entity type a field references, from wherever the field records it. */
function targetEntityType(schema) {
  const settings = (schema || {}).settings || {}
  const stored = (settings.storage || {}).target_type
  if (stored) return stored

  // `default:taxonomy_term` and friends name the target in the handler id.
  const handler = (settings.config || {}).handler
  return handler ? String(handler).split(':').slice(1).join(':') || null : null
}

/**
 * Which JSON:API resource types a reference field can point at.
 *
 * In order: what the field already references, which is definitive; the bundles
 * the field is configured to allow; every bundle of the target entity type,
 * read off the JSON:API index; and finally the base field's known target.
 *
 * The index comes before the base field list because a configurable field with
 * no bundle restriction really can point at any of them, and picking one would
 * silently hide the rest.
 */
export function targetResourceTypes(schema, existing, index) {
  const fromExisting = (Array.isArray(existing) ? existing : [existing])
    .filter(Boolean)
    .map((item) => item.type)
    .filter(Boolean)
  if (fromExisting.length) return [...new Set(fromExisting)]

  const settings = (schema || {}).settings || {}
  const entityType = targetEntityType(schema)

  if (entityType) {
    const bundles = ((settings.config || {}).handler_settings || {}).target_bundles
    if (bundles && Object.keys(bundles).length) {
      return Object.keys(bundles).map((bundle) => `${entityType}--${bundle}`)
    }

    const available = Object.keys(index || {}).filter((type) =>
      type.startsWith(`${entityType}--`)
    )
    return available.length ? available : [`${entityType}--${entityType}`]
  }

  const base = BASE_FIELD_TARGETS[(schema || {}).id]
  return base ? [base] : []
}

/** The JSON:API collection URL for a resource type. */
function collectionUrl(backendUrl, resourceType) {
  const [entityType, bundle] = String(resourceType).split('--')
  const path = bundle ? `${entityType}/${bundle}` : entityType
  return `${String(backendUrl).replace(/\/+$/, '')}/jsonapi/${path}`
}

/**
 * The search request for one resource type.
 *
 * Uses the field's own `match_operator` and `match_limit`, so the frontend
 * matches the way the site was configured rather than imposing its own.
 * `CONTAINS` is Drupal's default and what its autocomplete does.
 */
export function autocompleteUrl(backendUrl, resourceType, query, schema = {}) {
  const display = (schema.settings || {}).display || {}
  const operator = display.match_operator || 'CONTAINS'
  const limit = display.match_limit || 10
  const field = filterFieldFor(String(resourceType).split('--')[0])

  const params = new URLSearchParams()
  params.set('filter[q][condition][path]', field)
  params.set('filter[q][condition][operator]', operator)
  params.set('filter[q][condition][value]', query)
  params.set('page[limit]', String(limit))

  return `${collectionUrl(backendUrl, resourceType)}?${params}`
}

/**
 * The request that turns referenced ids into labels.
 *
 * A relationship carries a type and an id and nothing readable, so a field
 * that already references something would otherwise show the author a UUID.
 */
export function labelsUrl(backendUrl, resourceType, ids) {
  const params = new URLSearchParams()
  params.set('filter[ids][condition][path]', 'id')
  params.set('filter[ids][condition][operator]', 'IN')
  for (const [index, id] of (ids || []).entries()) {
    params.append(`filter[ids][condition][value][${index}]`, id)
  }
  return `${collectionUrl(backendUrl, resourceType)}?${params}`
}

/** A relationship value, in the shape JSON:API expects back. */
export function toRelationship(items, multiple) {
  const data = (items || []).map(({ type, id }) => ({ type, id }))
  return { data: multiple ? data : data[0] || null }
}
