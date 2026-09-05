/**
 * Staged edits, held until there is somewhere to send them.
 *
 * Nuxt turns every file in `store/` into a namespaced Vuex module, so this is
 * `authoringCart/*`. It is deliberately a store rather than component state:
 * an author can edit on one route and commit from another, and the cart has to
 * outlive both.
 *
 * Nothing here talks to a backend except `commit`, and that only when asked.
 * Staging works with no backend at all, which is the point: the frontend is
 * static, the backend is occasional, and losing an edit because a session
 * expired would be the worst possible behaviour.
 */

import {
  cartKey,
  changedFields,
  commitOrder,
  isEmptyResource,
  isNew,
  mergeEntry,
  newResourceId,
  patchBody,
  requestMethod,
  requestUrl,
  tidyResource,
  withoutComputed,
} from '../lib/cart.mjs'

const STORAGE_KEY = 'authoring.cart'

/** Read the cart, tolerating a browser that refuses storage. */
function readStored() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function writeStored(entries) {
  try {
    if (Object.keys(entries).length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    return true
  } catch {
    // The cart still works for this page; it just will not survive a reload.
    return false
  }
}

export const state = () => ({
  /**
   * Whether the site is in edit mode.
   *
   * Deliberately separate from being connected or signed in: an author can turn
   * editing on with no backend at all and stage changes, which is the point of
   * the cart. It only decides whether the interface offers editing.
   */
  editing: false,
  /** Whether the staged-changes drawer is open. */
  drawerOpen: false,
  /** Staged resources, keyed `type:id`. */
  entries: {},
  // Edits an author has made but not staged. Kept apart from `entries` on
  // purpose: these are not going to be committed, they are just not lost.
  drafts: {},
  /** False once a write to storage has failed, so the UI can stop promising. */
  persistent: true,
  /** Per-entry failure reasons from the last commit. */
  errors: {},
  committing: false,
})

export const getters = {
  editing: (state) => state.editing,
  drawerOpen: (state) => state.drawerOpen,
  count: (state) => Object.keys(state.entries).length,
  isEmpty: (state) => !Object.keys(state.entries).length,
  /** Everything staged, as JSON:API resource objects. */
  resources: (state) => Object.values(state.entries).map(tidyResource),
  entryFor: (state) => (type, id) => state.entries[cartKey(type, id)] || null,
  /** Staged resources that do not exist on the backend yet. */
  stagedNew: (state) => Object.values(state.entries).filter((resource) => resource.isNew),
  draftFor: (state) => (type, id) => state.drafts[cartKey(type, id)] || null,
  errorFor: (state) => (type, id) => state.errors[cartKey(type, id)] || null,
}

export const mutations = {
  setEditing(state, editing) {
    state.editing = editing
  },

  setDrawerOpen(state, open) {
    state.drawerOpen = open
  },

  setDraft(state, { key, draft }) {
    // Vue 2 cannot see a new key on a plain object, so the whole map is
    // replaced rather than mutated in place.
    state.drafts = { ...state.drafts, [key]: draft }
  },

  clearDraft(state, key) {
    const { [key]: gone, ...rest } = state.drafts
    state.drafts = rest
  },

  stage(state, { key, resource }) {
    // Vue 2 cannot see a new key on a plain object, so the whole map is
    // replaced rather than mutated in place.
    state.entries = { ...state.entries, [key]: resource }
    const { [key]: _dropped, ...rest } = state.errors
    state.errors = rest
  },

  discardOne(state, key) {
    const { [key]: _dropped, ...rest } = state.entries
    state.entries = rest
    const { [key]: _err, ...errors } = state.errors
    state.errors = errors
  },

  discardAll(state) {
    state.entries = {}
    state.errors = {}
  },

  restore(state, entries) {
    state.entries = entries
  },

  setPersistent(state, persistent) {
    state.persistent = persistent
  },

  setError(state, { key, message }) {
    state.errors = { ...state.errors, [key]: message }
  },

  setCommitting(state, committing) {
    state.committing = committing
  },
}

export const actions = {
  /** Bring back whatever the last visit staged, and whether editing was on. */
  restore({ commit }) {
    commit('restore', readStored())
    try {
      commit('setEditing', window.localStorage.getItem('authoring.editing') === '1')
    } catch {
      // No storage: editing simply starts off.
    }
  },

  setDrawerOpen({ commit }, open) {
    commit('setDrawerOpen', Boolean(open))
  },

  /** Turn editing on or off, and remember which. */
  setEditing({ commit }, editing) {
    commit('setEditing', Boolean(editing))
    try {
      if (editing) window.localStorage.setItem('authoring.editing', '1')
      else window.localStorage.removeItem('authoring.editing')
    } catch {
      // The mode simply does not survive a reload.
    }
  },

  /**
   * Stage a new entity, which does not exist in the backend yet.
   *
   * Given a client-generated id up front, because the cart is keyed by id and
   * the interface has to be able to name the thing being written before Drupal
   * has seen it. JSON:API accepts a client-supplied id on create, so the
   * placeholder becomes the real id rather than being swapped for one.
   */
  stageNew({ state, commit }, { type, attributes, relationships, onlyIfReferenced }) {
    const id = newResourceId()
    const resource = {
      type,
      id,
      isNew: true,
      // A tag invented inside a reference field is only worth creating while
      // something still points at it. A new article is not: it stands alone.
      // `tidyResource` keeps this off the wire, like `isNew`.
      onlyIfReferenced: Boolean(onlyIfReferenced),
      attributes: attributes || {},
      relationships: relationships || {},
    }
    commit('stage', { key: cartKey(type, id), resource })
    commit('setPersistent', writeStored(state.entries))
    if (Object.keys(state.entries).length === 1) commit('setDrawerOpen', true)
    return id
  },

  /**
   * Stage what changed about one entity.
   *
   * Takes the entity as it was and as the form has it, and keeps the
   * difference. Staging an edit that changes nothing is a no-op rather than an
   * empty resource, so the count means what it says.
   */
  stage({ state, commit }, { type, id, original, edited, relationships, allRelationships }) {
    const existing = state.entries[cartKey(type, id)]
    // Something staged as new keeps every field, not just what changed since
    // the form loaded: there is no saved version to differ from.
    const attributes = isNew(existing)
      ? withoutComputed({ ...edited })
      : changedFields(original, edited)
    const resource = mergeEntry(
      existing,
      {
        type,
        id,
        isNew: isNew(existing),
        attributes,
        relationships: relationships || {},
      },
      // What this form had in front of it, so a previously staged field the
      // author has since put back can be dropped rather than kept forever.
      {
        attributes: Object.keys(edited || {}),
        relationships: Object.keys(allRelationships || relationships || {}),
      }
    )

    if (isEmptyResource(resource)) return false

    // It is in the cart now, so it is no longer merely unsaved.
    commit('clearDraft', cartKey(type, id))
    commit('stage', { key: cartKey(type, id), resource })
    commit('setPersistent', writeStored(state.entries))
    // Open on the first staged change, so it is visible that something was
    // captured. Left alone after that, since closing it should stay closed.
    if (Object.keys(state.entries).length === 1) commit('setDrawerOpen', true)
    return true
  },

  /**
   * Keep an edit that has not been staged.
   *
   * Closing a form is not a decision to throw the work away. The author gets
   * the page rendered as they left it, marked unstaged, and stages it when they
   * are ready. Deliberately not part of the cart: a draft is never committed,
   * and counting it would make the drawer claim work it is not going to send.
   */
  saveDraft({ commit }, { type, id, attributes, relationships }) {
    const key = cartKey(type, id)
    const draft = { attributes: attributes || {}, relationships: relationships || {} }
    const empty =
      !Object.keys(draft.attributes).length && !Object.keys(draft.relationships).length
    if (empty) return commit('clearDraft', key)
    commit('setDraft', { key, draft })
  },

  clearDraft({ commit }, { type, id }) {
    commit('clearDraft', cartKey(type, id))
  },

  /**
   * Drop a staged resource that only existed to be referenced.
   *
   * A tag typed into a field and then taken out again should leave nothing
   * behind. Doing it here rather than in the field means the check can see the
   * whole cart: another entity may still reference the same new term, and
   * deleting it would break that one instead.
   */
  discardIfUnreferenced({ state, commit, getters }, { type, id }) {
    const entry = state.entries[cartKey(type, id)]
    if (!entry || !entry.onlyIfReferenced) return false

    const referenced = getters.resources.some((resource) =>
      Object.values(resource.relationships || {}).some((relationship) => {
        const data = (relationship || {}).data
        if (!data) return false
        return (Array.isArray(data) ? data : [data]).some((item) => item.id === id)
      })
    )
    if (referenced) return false

    commit('discardOne', cartKey(type, id))
    commit('setPersistent', writeStored(state.entries))
    return true
  },

  discardOne({ state, commit }, { type, id }) {
    commit('discardOne', cartKey(type, id))
    commit('clearDraft', cartKey(type, id))
    commit('setPersistent', writeStored(state.entries))
  },

  discardAll({ state, commit }) {
    commit('discardAll')
    for (const key of Object.keys(state.drafts)) commit('clearDraft', key)
    commit('setPersistent', writeStored(state.entries))
  },

  /**
   * Send the cart to a backend.
   *
   * One PATCH per resource, and each is dropped from the cart only once the
   * backend has accepted it. A rejected resource stays put with its reason, so
   * a partial failure leaves the author with exactly the work still to do
   * rather than an all-or-nothing retry.
   */
  async commit({ state, commit, getters }, { backendUrl, token, fetch: fetchImpl } = {}) {
    if (!backendUrl) return { ok: false, reason: 'No backend connected.' }
    if (!token) return { ok: false, reason: 'Not signed in to that backend.' }
    if (getters.isEmpty) return { ok: false, reason: 'Nothing staged.' }

    const request = fetchImpl || window.fetch.bind(window)
    commit('setCommitting', true)

    const results = { sent: 0, failed: 0 }
    // Ordered, not just iterated: a new resource another one references has to
    // reach the backend first.
    for (const resource of commitOrder(Object.values(state.entries))) {
      const key = cartKey(resource.type, resource.id)
      try {
        const response = await request(requestUrl(backendUrl, resource), {
          method: requestMethod(resource),
          headers: {
            // JSON:API's own media type, not application/json. Drupal answers
            // 415 for anything else.
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/vnd.api+json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patchBody(resource)),
        })

        if (!response.ok) {
          const detail = await response.json().catch(() => null)
          const message =
            (detail && detail.errors && detail.errors[0] && detail.errors[0].detail) ||
            `Rejected with ${response.status}.`
          commit('setError', { key, message })
          results.failed += 1
          continue
        }

        commit('discardOne', key)
        results.sent += 1
      } catch (error) {
        commit('setError', { key, message: error.message })
        results.failed += 1
      }
    }

    commit('setPersistent', writeStored(state.entries))
    commit('setCommitting', false)
    return { ok: results.failed === 0, ...results }
  },
}
