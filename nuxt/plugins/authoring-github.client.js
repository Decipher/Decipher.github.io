/**
 * Signing in to GitHub, so a change can leave without a backend.
 *
 * A token the author supplies, not an OAuth flow, and that is a finding rather
 * than a shortcut. GitHub's device flow endpoints on github.com send no CORS
 * headers, so a browser cannot reach them at all: the request fails before it
 * is made. Every other GitHub flow needs a client secret, which needs a server,
 * which is the thing this is here to remove. `api.github.com` does allow
 * cross-origin requests, so everything after sign-in works from a static page.
 *
 * Held in `sessionStorage`, like the Drupal token: closing the tab ends it. A
 * repository-scoped token in a browser is a real thing to be careful with, so
 * it does not outlive the session that asked for it.
 */
import Vue from 'vue'

import { checkAccess, findRun, runIsFinished, startBackend } from '../lib/github-client.mjs'

const TOKEN_KEY = 'authoring.github'

function readStored() {
  try {
    return JSON.parse(window.sessionStorage.getItem(TOKEN_KEY)) || null
  } catch {
    return null
  }
}

function writeStored(value) {
  try {
    if (value) window.sessionStorage.setItem(TOKEN_KEY, JSON.stringify(value))
    else window.sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Not fatal: the sign-in simply does not survive a reload.
  }
}

export default function (context, inject) {
  const config = (context.$config && context.$config.authoring) || {}

  // Observable, not a plain object: components read this in computed properties
  // and would otherwise never re-render when it changes.
  const state = Vue.observable({
    repository: config.repository || null,
    token: null,
    login: null,
    defaultBranch: 'main',
    status: 'idle',
    error: null,
    // Whether this token may start a backend, which needs Actions on top of
    // the two permissions proposing a change needs.
    canStartBackend: false,
    workflow: config.workflow || 'authoring.yml',
    // The run a dispatch started, once it can be found. There is no run id in
    // the dispatch response, so this arrives a few seconds late.
    run: null,
    starting: false,
  })

  const github = {
    state,

    get signedIn() {
      return state.status === 'signed-in'
    },

    async signIn(token, repository) {
      state.status = 'checking'
      state.error = null

      const result = await checkAccess({
        repository: repository || state.repository,
        token,
        workflow: state.workflow,
        fetch: window.fetch.bind(window),
      })

      if (!result.ok) {
        state.status = 'error'
        state.error = result.reason
        state.login = result.login || null
        return false
      }

      state.token = token
      state.repository = repository || state.repository
      state.login = result.login
      state.defaultBranch = result.defaultBranch || 'main'
      state.canStartBackend = Boolean(result.canStartBackend)
      state.status = 'signed-in'
      writeStored({ token, repository: state.repository })
      return true
    },

    /**
     * Start a backend, and keep watching until it is no longer starting.
     *
     * The button stays out of action for as long as a run is queued or going,
     * because dispatching a second one queues it behind the first rather than
     * doing anything useful.
     */
    async startBackend(minutes) {
      state.starting = true
      state.run = null
      const since = new Date().toISOString()

      const result = await startBackend({
        repository: state.repository,
        token: state.token,
        workflow: state.workflow,
        ref: state.defaultBranch,
        minutes,
        fetch: window.fetch.bind(window),
      })

      if (!result.ok) {
        state.starting = false
        return result
      }

      github.watchRun(since)
      return result
    },

    /** Poll for the run, then for its result, and stop when it stops. */
    async watchRun(since) {
      const deadline = Date.now() + 90 * 60 * 1000
      const poll = async () => {
        if (Date.now() > deadline) {
          state.starting = false
          return
        }
        const found = await findRun({
          repository: state.repository,
          token: state.token,
          workflow: state.workflow,
          since,
          fetch: window.fetch.bind(window),
        })
        if (found.ok && found.run) {
          state.run = found.run
          if (runIsFinished(found.run)) {
            state.starting = false
            return
          }
        }
        window.setTimeout(poll, state.run ? 15000 : 5000)
      }
      poll()
    },

    signOut() {
      Object.assign(state, {
        token: null,
        login: null,
        status: 'idle',
        error: null,
        canStartBackend: false,
      })
      writeStored(null)
    },
  }

  inject('authoringGithub', github)

  // Pick up a sign-in from earlier in this session. Checked rather than
  // trusted: access can have been withdrawn since, and finding that out when a
  // pull request fails is finding out too late.
  const stored = readStored()
  if (stored && stored.token) github.signIn(stored.token, stored.repository)
}
