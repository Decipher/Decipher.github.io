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

import { checkAccess, startBackend } from '../lib/github-client.mjs'

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

    async startBackend(minutes) {
      return startBackend({
        repository: state.repository,
        token: state.token,
        workflow: state.workflow,
        ref: state.defaultBranch,
        minutes,
        fetch: window.fetch.bind(window),
      })
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
