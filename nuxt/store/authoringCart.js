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
  isDeletion,
  valuesBefore,
  withDependencies,
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
import { imageRelationship, uploadHeaders, uploadUrl } from '../lib/upload.mjs'

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
  /** Everything staged, as JSON:API resource objects, ready for the wire. */
  resources: (state) => Object.values(state.entries).map(tidyResource),
  /**
   * Everything staged, as the cart holds it.
   *
   * `resources` strips the cart's own bookkeeping, which is right for sending
   * and wrong for showing: a deletion tidied for the wire is indistinguishable
   * from an edit that changed nothing.
   */
  staged: (state) => Object.values(state.entries),
  entryFor: (state) => (type, id) => state.entries[cartKey(type, id)] || null,
  /**
   * Content that does not exist on the backend yet, staged or not.
   *
   * A listing should show something the moment it is begun, not only once it
   * is staged: staging is a decision about sending, not about existing.
   */
  stagedNew: (state) => [
    ...Object.values(state.entries).filter((resource) => resource.isNew),
    ...Object.entries(state.drafts)
      .filter(([, draft]) => draft.isNew)
      .map(([key, draft]) => {
        const [type, id] = key.split(':')
        return { type, id, isNew: true, ...draft }
      }),
  ],
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

/**
 * Upload whatever bytes a staged resource is carrying, and point its
 * relationships at the files that come back.
 *
 * Done per resource rather than up front, so a failed upload fails only the
 * change it belongs to. An uploaded file Drupal never hears about again is
 * temporary and its own cron clears it, so a half-done commit leaves rubbish
 * rather than damage.
 */
async function sendFiles(resource, { backendUrl, token, request }) {
  const files = resource.files || {}
  if (!Object.keys(files).length) return { resource }

  const relationships = { ...(resource.relationships || {}) }
  for (const [field, file] of Object.entries(files)) {
    try {
      const response = await request(uploadUrl(backendUrl, resource.type, field), {
        method: 'POST',
        headers: uploadHeaders(file.name, token),
        body: dataUrlToBlob(file.dataUrl, file.type),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        return {
          error:
            (detail && detail.errors && detail.errors[0] && detail.errors[0].detail) ||
            `The image was refused with ${response.status}.`,
        }
      }
      const body = await response.json()
      const existing = ((relationships[field] || {}).data || {}).meta || {}
      relationships[field] = imageRelationship(body.data.id, existing.alt, existing)
    } catch (error) {
      return { error: `The image could not be sent: ${error.message}` }
    }
  }

  return { resource: { ...resource, relationships } }
}

/** A data URL back into bytes, because that is what the upload route wants. */
function dataUrlToBlob(dataUrl, type) {
  const base64 = String(dataUrl).split(',')[1] || ''
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: type || 'application/octet-stream' })
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
    // Edit mode is a mode, and the drawer is its surface: it holds the changes
    // and the way to add content. Turning the mode on and finding neither is
    // how adding became unreachable from every page but one.
    commit('setDrawerOpen', Boolean(editing))
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
  /**
   * Begin a new piece of content, without staging it.
   *
   * Pressing Add is not a decision to commit anything: it is opening a form.
   * The resource is held unstaged, the same as any other edit that has not been
   * staged, so the page shows it and the drawer does not claim it is going to
   * be sent.
   */
  draftNew({ state, commit }, { type, attributes, relationships }) {
    const id = newResourceId()
    commit('setDraft', {
      key: cartKey(type, id),
      draft: {
        isNew: true,
        attributes: attributes || {},
        relationships: relationships || {},
        files: {},
      },
    })
    return id
  },

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
  stage({ state, commit }, { type, id, original, edited, relationships, allRelationships, files }) {
    const key = cartKey(type, id)
    const existing = state.entries[key]
    // From the draft too: content begun and never staged lives there, and
    // forgetting it is new turns its create into a PATCH against nothing.
    const wasNew = isNew(existing) || Boolean((state.drafts[key] || {}).isNew)
    // Something staged as new keeps every field, not just what changed since
    // the form loaded: there is no saved version to differ from.
    const attributes = wasNew
      ? withoutComputed({ ...edited })
      : changedFields(original, edited)
    const resource = mergeEntry(
      existing,
      {
        type,
        id,
        isNew: wasNew,
        attributes,
        relationships: relationships || {},
        // Bytes chosen in the browser, kept off the wire by `tidyResource` and
        // uploaded when this is committed.
        files: { ...((existing || {}).files || {}), ...(files || {}) },
        before: {
          ...valuesBefore(original || {}, attributes),
          ...valuesBefore((allRelationships || {}), relationships || {}),
        },
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
  saveDraft({ state, commit }, { type, id, attributes, relationships, files }) {
    const key = cartKey(type, id)
    // An unstaged deletion has no fields and is not nothing, so it survives a
    // form being closed over it.
    const existing = state.drafts[key] || {}
    const deleted = Boolean(existing.deleted)
    const draft = {
      deleted,
      isNew: Boolean(existing.isNew),
      attributes: attributes || {},
      relationships: relationships || {},
      // Bytes for a picture chosen and not staged. Without these the file is
      // gone the moment the form closes, and the field points at an id nothing
      // can resolve.
      files: files || {},
    }
    const empty =
      !deleted &&
      !draft.isNew &&
      !Object.keys(draft.attributes).length &&
      !Object.keys(draft.relationships).length &&
      !Object.keys(draft.files).length
    if (empty) return commit('clearDraft', key)
    commit('setDraft', { key, draft })
  },

  clearDraft({ commit }, { type, id }) {
    commit('clearDraft', cartKey(type, id))
  },

  /**
   * Stage the removal of something.
   *
   * Staged like any other change so it can be reviewed and reversed. Content
   * the author created and never committed is simply dropped instead: there is
   * nothing on the backend to delete, and asking it to remove something it has
   * never heard of is a 404 the author cannot act on.
   */
  stageDeletion({ state, commit }, { type, id }) {
    const key = cartKey(type, id)
    const existing = state.entries[key]

    if (isNew(existing)) {
      commit('discardOne', key)
      commit('clearDraft', key)
      commit('setPersistent', writeStored(state.entries))
      return 'dropped'
    }

    // Whatever was staged for it is replaced: editing a field and then deleting
    // the thing means the edit was never going to matter.
    commit('stage', { key, resource: { type, id, deleted: true } })
    commit('clearDraft', key)
    commit('setPersistent', writeStored(state.entries))
    if (Object.keys(state.entries).length === 1) commit('setDrawerOpen', true)
    return 'staged'
  },

  /**
   * Move a staged change back to being merely unsaved.
   *
   * The two states already exist, so unstaging is moving between them rather
   * than a third thing. The edit is not lost and the page still shows it; it
   * simply stops being part of what the next commit sends.
   */
  unstage({ state, commit }, { type, id }) {
    const key = cartKey(type, id)
    const entry = state.entries[key]
    if (!entry) return false

    // A removal has no fields, but it is still an intention worth keeping: an
    // author unticking it means "not in this commit", not "forget I said it".
    // Calling it off is what Discard is for.
    if (isDeletion(entry)) {
      commit('setDraft', {
        key,
        draft: { deleted: true, attributes: {}, relationships: {}, files: {} },
      })
      commit('discardOne', key)
      commit('setPersistent', writeStored(state.entries))
      return true
    }

    const existing = state.drafts[key] || {}
    commit('setDraft', {
      key,
      draft: {
        attributes: { ...(entry.attributes || {}), ...(existing.attributes || {}) },
        relationships: { ...(entry.relationships || {}), ...(existing.relationships || {}) },
        files: { ...(entry.files || {}), ...(existing.files || {}) },
      },
    })
    commit('discardOne', key)
    commit('setPersistent', writeStored(state.entries))
    return true
  },

  /**
   * Move an unstaged edit into the cart.
   *
   * The mirror of `unstage`. A draft already holds the difference from what the
   * backend has, so staging it is moving it between the two maps rather than
   * working anything out again.
   */
  stageDraft({ state, commit }, { type, id }) {
    const key = cartKey(type, id)
    const draft = state.drafts[key]
    if (!draft) return false

    if (draft.deleted) {
      commit('clearDraft', key)
      commit('stage', { key, resource: { type, id, deleted: true } })
      commit('setPersistent', writeStored(state.entries))
      return true
    }

    const existing = state.entries[key]
    const resource = mergeEntry(existing, {
      type,
      id,
      // From the draft as well: content begun and not yet staged is new, and
      // forgetting that turns its create into a PATCH against nothing.
      isNew: isNew(existing) || Boolean(draft.isNew),
      attributes: draft.attributes || {},
      relationships: draft.relationships || {},
      files: draft.files || {},
    })
    commit('clearDraft', key)
    commit('stage', { key, resource })
    commit('setPersistent', writeStored(state.entries))
    return true
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
  async commit({ state, commit, getters }, { backendUrl, token, fetch: fetchImpl, ids } = {}) {
    if (!backendUrl) return { ok: false, reason: 'No backend connected.' }
    if (!token) return { ok: false, reason: 'Not signed in to that backend.' }
    if (getters.isEmpty) return { ok: false, reason: 'Nothing staged.' }

    const request = fetchImpl || window.fetch.bind(window)
    const all = Object.values(state.entries)
    // A selection is expanded to what it cannot be sent without, so choosing an
    // article that references a new tag chooses the tag as well.
    const chosen = ids ? new Set(withDependencies(ids, all)) : null
    const sending = chosen ? all.filter((resource) => chosen.has(resource.id)) : all
    if (!sending.length) return { ok: false, reason: 'Nothing selected.' }

    commit('setCommitting', true)

    const results = { sent: 0, failed: 0 }
    // Ordered, not just iterated: a new resource another one references has to
    // reach the backend first.
    for (const resource of commitOrder(sending)) {
      const key = cartKey(resource.type, resource.id)
      try {
        // Bytes first. The relationship names a file that has to exist, and the
        // upload is a different kind of request to a different URL.
        const uploaded = await sendFiles(resource, { backendUrl, token, request })
        if (uploaded.error) {
          commit('setError', { key, message: uploaded.error })
          results.failed += 1
          continue
        }
        const ready = uploaded.resource

        const body = patchBody(ready)
        const response = await request(requestUrl(backendUrl, ready), {
          method: requestMethod(ready),
          headers: {
            // JSON:API's own media type, not application/json. Drupal answers
            // 415 for anything else.
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/vnd.api+json',
            Authorization: `Bearer ${token}`,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
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
