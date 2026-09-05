/**
 * Resolve which backend this static site is talking to, at runtime.
 *
 * The site is generated with no backend behind it, and the backend it will
 * eventually be edited against does not exist when the site is built. So the
 * backend is a runtime parameter, not a build-time one: anything that answers
 * JSON:API, allows this origin, and carries a consumer for this site's callback
 * is a valid backend, whether it runs in CI or on the author's laptop.
 *
 * The decisions live in lib/authoring.mjs, where they are unit tested without a
 * browser. This file is the browser half: storage, the query string, and state.
 */

import Vue from 'vue'

import { asResource, previewsFor } from '../lib/preview.mjs'

import {
  checkConformance,
  normaliseUrl,
  readSessionRecord,
  resolveSource,
} from '../lib/authoring.mjs'

const STORAGE_KEY = 'authoring.backend'

/**
 * Read and write the remembered backend, tolerating a browser that refuses.
 *
 * Private windows, cleared site data and "block site data" settings make
 * localStorage throw on access rather than return null, so both directions are
 * guarded. A browser that cannot store one still works; it just forgets the
 * backend on reload.
 */
function readStored() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || null
  } catch {
    return null
  }
}

function writeStored(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Not fatal: the choice simply does not survive a reload.
  }
}

/**
 * Point Druxt's own client at the connected backend.
 *
 * The generated site has a backend URL baked into it from build time, which is
 * whatever machine ran `nuxt generate` - usually a localhost that means nothing
 * to a visitor. And with `druxt.proxy.api` on, the client makes origin-relative
 * requests, which only work where something is proxying them. Neither is the
 * backend the author just connected to.
 *
 * So on connect the client is re-pointed. Without this, connecting a backend
 * only affects signing in: the page still shows whatever content was baked at
 * build time, and nothing written since appears at all.
 */
function pointClientAt(context, url) {
  for (const client of druxtClients(context)) {
    if (client.options) client.options.baseUrl = url
    if (client.axios) client.axios.defaults.baseURL = url
    // Druxt caches the JSON:API index per client. It describes a different site
    // now, so it has to be discarded or the first request uses the old one.
    client.index = {}
  }
}

/**
 * Every Druxt client in the app, because there is more than one.
 *
 * `druxt` injects `$druxt`, and `druxt-router` injects a `$druxtRouter` built
 * around a second `DruxtClient` of its own, with the build-time base URL baked
 * into it. Repointing only the first leaves route lookups going to whichever
 * machine ran `nuxt generate`, which is a localhost that means nothing here.
 */
function druxtClients(context) {
  const app = (context.app || context) || {}
  const found = [app.$druxt || context.$druxt]
  const router = app.$druxtRouter || context.$druxtRouter
  // Injected as a function returning the instance, not as the instance.
  const instance = typeof router === 'function' ? router() : router
  if (instance) found.push(instance.druxt || instance)
  return found.filter(Boolean)
}

/**
 * Stop Druxt talking to the machine that built the site.
 *
 * `nuxt generate` bakes its own backend URL into the bundle, which for a
 * serverless build is whatever ran the build: usually a localhost that means
 * nothing to a visitor. With the API proxy off, every visitor's browser would
 * try to reach it and fail. A full static build already carries its content in
 * the payload, so those requests have nothing to offer even when they succeed.
 *
 * So Druxt is held quiet until a backend is actually connected. The rejection
 * is marked, and callers can tell it apart from a real network failure.
 */
function holdClientUntilConnected(context, state) {
  const client = (context.app && context.app.$druxt) || context.$druxt
  if (!client || !client.axios || client.axios.__authoringGuard) return
  client.axios.__authoringGuard = true
  client.axios.interceptors.request.use((config) => {
    if (state.status !== 'connected') {
      const error = new Error('No backend connected; request not sent.')
      error.isAuthoringHold = true
      return Promise.reject(error)
    }
    return config
  })
}

/**
 * Throw away what the build baked in, and fetch it again from the backend.
 *
 * A full static build ships its rendered result in `window.__NUXT__`, and Nuxt
 * hydrates from it: `fetch()` never runs again, so nothing written since the
 * build can appear no matter what the client is pointed at. Druxt's own Vuex
 * caches are baked in too, and they hold the *build machine's* URLs, so even a
 * component that did refetch would be handed a route pointing at localhost.
 *
 * Clearing `__NUXT__` instead does not work, and failed quietly: Nuxt decides
 * whether it is hydrating from a `data-fetch-key` attribute in the HTML, not
 * from the payload, so it still hydrates, finds nothing where the fetch state
 * should be, and leaves the component with no model and no pending state. Its
 * `fetch()` then never runs at all. DruxtRouter renders nothing from there, and
 * throws reading `model.error` on the way past.
 *
 * So let it hydrate, then empty the caches and ask every component to fetch
 * again. The page briefly shows what was built, which is the correct thing to
 * show until a backend answers.
 */
/**
 * Run something once the app has mounted, or straight away if it already has.
 *
 * `onNuxtReady` only fires once, so anything registered after it has already
 * run would otherwise never happen. Connecting a backend by hand is exactly
 * that case.
 */
let nuxtIsReady = false
let readyRegistered = false
const waitingForReady = []
function whenReady(fn) {
  if (nuxtIsReady) return fn()
  waitingForReady.push(fn)
  if (readyRegistered) return
  readyRegistered = true
  const flush = () => {
    nuxtIsReady = true
    waitingForReady.splice(0).forEach((waiting) => waiting())
  }
  if (typeof window.onNuxtReady === 'function') window.onNuxtReady(flush)
  else flush()
}

/**
 * Put content that exists only in the cart into the listings that would show it.
 *
 * Two steps, because Druxt renders a listing's rows by uuid: the resource is
 * seeded into Druxt's own store so `DruxtEntity` finds it in cache and never
 * asks the backend for a uuid it has never heard of, and then added to the
 * results of any view already showing that type. From there it renders through
 * the same wrapper as everything else and gets its label, badges and controls
 * for nothing.
 *
 * What this does not do is decide whether a view would really return it. That
 * means evaluating the view's filters against the entity, which is Drupal's
 * job. Matching the type a listing is already showing is right for the common
 * case and wrong for a filtered view, so new content is marked unpublished
 * wherever it appears: it reads as an intention, not as a claim about what is
 * live.
 */
function previewStagedContent(store) {
  const app = window.$nuxt
  if (!app || !store) return

  const staged = store.getters['authoringCart/stagedNew'] || []
  const druxt = store.state.druxt
  if (druxt) {
    for (const resource of staged) {
      if (!druxt.resources[resource.type]) Vue.set(druxt.resources, resource.type, {})
      // Keyed by language prefix, which is `undefined` for a site with one
      // language: the same key `getResource` looks under.
      Vue.set(druxt.resources[resource.type], resource.id, { undefined: asResource(resource) })
    }
  }

  /**
   * Anything already on screen for this resource has a model from when it was
   * seeded, and the store changing does not reach it. Told directly, so a title
   * appears as it is typed rather than when the page is next rebuilt.
   */
  const byId = new Map(staged.map((resource) => [resource.id, resource]))
  const refreshRows = (vm) => {
    if (vm.$options.name === 'DruxtEntity' && byId.has(vm.uuid)) {
      const resource = byId.get(vm.uuid)
      const model = asResource(resource).data
      if (JSON.stringify(vm.model) !== JSON.stringify(model)) vm.model = model
    }
    vm.$children.forEach(refreshRows)
  }
  refreshRows(app)

  const visit = (vm) => {
    // `results` is a computed over `resource.data`, so the rows have to be put
    // where they are read from rather than where they are read.
    if (vm.$options.name === 'DruxtView' && vm.resource && Array.isArray(vm.resource.data)) {
      const rows = vm.resource.data
      const previews = previewsFor(rows, staged)
      const already = new Set(rows.map((row) => row.id))
      const missing = previews.filter((resource) => !already.has(resource.id))
      // Removed as well as added: discarding new content has to take it back
      // off the page it was put on.
      const kept = rows.filter((row) => !row.__staged || staged.some((s) => s.id === row.id))

      if (missing.length || kept.length !== rows.length) {
        vm.resource = {
          ...vm.resource,
          data: [
            ...missing.map((resource) => ({
              type: resource.type,
              id: resource.id,
              __staged: true,
            })),
            ...kept,
          ],
        }
      }
    }
    vm.$children.forEach(visit)
  }
  visit(app)
}

function refreshFromBackend() {
  // `window.$nuxt`, not the plugin's `context.app`: the refresh walks mounted
  // components, and the context's app is the root options object rather than
  // the instance built from them.
  const app = window.$nuxt
  if (!app) return
  const store = app.$store
  // No mutations exist for this: the stores only ever add. Assigning the whole
  // object keeps it reactive, because the property itself already is.
  const router = (store || {}).state && store.state.druxtRouter
  if (router) {
    router.routes = {}
    router.entities = {}
    router.route = {}
    router.redirect = null
  }
  const druxt = (store || {}).state && store.state.druxt
  if (druxt) {
    druxt.collections = {}
    druxt.resources = {}
  }
  // The JSON:API index is held on the client rather than in the store, and it
  // is a map of the old backend's URLs.
  if (app.$druxt) app.$druxt.index = {}

  const refetch = (vm) => {
    if (typeof vm.$fetch === 'function' && vm.$options.fetch) vm.$fetch()
    vm.$children.forEach(refetch)
  }
  refetch(app)
}

export default async function (context, inject) {
  const config = (context.$config && context.$config.authoring) || {}

  // Vue.observable, not a plain object: components read this in computed
  // properties, and a plain object injected through `inject` is not tracked, so
  // connecting or disconnecting would change the state without ever
  // re-rendering the UI that reports it.
  const state = Vue.observable({
    url: null,
    clientId: config.clientId || null,
    expiresAt: null,
    source: null,
    status: 'idle',
    error: null,
  })

  const authoring = {
    state,

    get connected() {
      return state.status === 'connected'
    },

    async connect(url, source = 'manual') {
      state.status = 'checking'
      state.error = null

      const result = await checkConformance(url, {
        fetch: window.fetch.bind(window),
        origin: window.location.origin,
      })

      if (!result.ok) {
        state.status = 'error'
        state.error = result.reason
        return false
      }

      state.url = normaliseUrl(url)
      state.source = source
      state.status = 'connected'
      pointClientAt(context, state.url)
      writeStored({ url: state.url, clientId: state.clientId, expiresAt: state.expiresAt })
      // What is on screen came from the build. Replace it with what this
      // backend says, now that there is one to ask.
      whenReady(refreshFromBackend)
      return true
    },

    /**
     * Look again for a published session, and connect to it.
     *
     * The record is read once while the app starts, which is the wrong and only
     * moment if the backend is started from the site: at load time there was no
     * session, and nothing looked again. A backend can appear minutes after the
     * page did.
     */
    async discover({ connect = true } = {}) {
      if (!config.sessionRecordUrl) return null
      const published = await readSessionRecord(config.sessionRecordUrl, {
        fetch: window.fetch.bind(window),
      })
      if (!published || !published.url) return null
      if (state.status === 'connected' && state.url === normaliseUrl(published.url)) {
        return { ...published, connected: true }
      }

      // Not switched out from under the author. Someone editing against a local
      // backend has chosen it, and moving them to another one because a session
      // started somewhere is the interface deciding something that is theirs to
      // decide.
      if (!connect || state.status === 'connected') {
        return { ...published, connected: false }
      }

      if (published.expiresAt) state.expiresAt = published.expiresAt
      if (published.clientId) state.clientId = published.clientId
      const ok = await authoring.connect(published.url, 'published')
      return { ...published, connected: ok }
    },

    /** Connect to a session already found, when the author asks for it. */
    async connectPublished(published) {
      if (!published || !published.url) return false
      if (published.expiresAt) state.expiresAt = published.expiresAt
      if (published.clientId) state.clientId = published.clientId
      return authoring.connect(published.url, 'published')
    },

    disconnect() {
      Object.assign(state, {
        url: null,
        expiresAt: null,
        source: null,
        status: 'idle',
        error: null,
      })
      writeStored(null)
    },
  }

  holdClientUntilConnected(context, state)
  inject('authoring', authoring)

  // Bring back whatever the last visit staged. Deliberately independent of any
  // backend: the cart is not a property of a session, and an author whose
  // session expired mid-edit should find their work still there.
  //
  // After the app is ready, not here. Nuxt replays the Vuex state baked into
  // `window.__NUXT__` while it mounts, which happens after plugins run, so a
  // restore done now is silently overwritten by the empty cart from build time.
  // The store ended up holding the right entries while the page rendered as
  // though it held none.
  if (context.store) {
    whenReady(() => context.store.dispatch('authoringCart/restore'))

    // Whenever the cart changes, and once the app is up. Cheap: it walks the
    // mounted components and only writes when something is actually missing.
    context.store.subscribe((mutation) => {
      if (String(mutation.type).startsWith('authoringCart/')) {
        whenReady(() => previewStagedContent(context.store))
      }
    })
    whenReady(() => previewStagedContent(context.store))
  }

  const params = new URLSearchParams(window.location.search)
  const chosen = resolveSource({
    query: params.get('backend'),
    stored: readStored(),
    published: await readSessionRecord(config.sessionRecordUrl, {
      fetch: window.fetch.bind(window),
    }),
  })

  if (!chosen) return

  if (chosen.expiresAt) state.expiresAt = chosen.expiresAt
  if (chosen.clientId) state.clientId = chosen.clientId

  await authoring.connect(chosen.url, chosen.source)
}
