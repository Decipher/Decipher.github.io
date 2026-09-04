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
  const client = (context.app && context.app.$druxt) || context.$druxt
  if (!client) return
  if (client.options) client.options.baseUrl = url
  if (client.axios) client.axios.defaults.baseURL = url
  // Druxt caches the JSON:API index per client. It describes a different site
  // now, so it has to be discarded or the first request uses the old one.
  client.index = {}
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
 * Make Nuxt re-run the page's own data fetching instead of hydrating.
 *
 * A full static build ships the rendered result in `window.__NUXT__`, and Nuxt
 * hydrates straight from it: `asyncData` and `fetch` never run again on the
 * client, so nothing written since the build can appear no matter what the
 * client is pointed at. Clearing Druxt's caches does not help, because nothing
 * asks it for anything.
 *
 * Plugins run before the app mounts, which is the last moment this can be
 * changed. Dropping `serverRendered` makes Nuxt treat the page as un-rendered
 * and fetch it properly.
 *
 * Only when a backend is connected. A visitor with none keeps the static
 * payload, which is the whole point of the build.
 */
function bypassStaticPayload() {
  const payload = window.__NUXT__
  if (!payload || payload.serverRendered === false) return false
  payload.serverRendered = false
  delete payload.data
  delete payload.fetch
  return true
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
      return true
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

  // Before connecting, so the app has not mounted yet and the page will fetch
  // rather than hydrate.
  bypassStaticPayload()

  await authoring.connect(chosen.url, chosen.source)
}
