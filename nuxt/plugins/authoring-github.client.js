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
import { readStoredToken, writeStoredToken } from '../lib/github.mjs'

const readStored = () => readStoredToken(window.sessionStorage)
const writeStored = (value) => writeStoredToken(window.sessionStorage, value)

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
    // The session this dispatch brought up, once it publishes itself. Kept
    // apart from what the site is connected to, which may be something else
    // entirely.
    started: null,
    workflow: config.workflow || 'authoring.yml',
    // The run a dispatch started, once it can be found. There is no run id in
    // the dispatch response, so this arrives a few seconds late.
    run: null,
    starting: false,
    // Why a run lookup stopped, said where a signed-in author can read it.
    // `error` is only shown to somebody signed out, and this happens to
    // somebody signed in.
    runError: null,
  })

  /**
   * Which sign-in the loops below belong to.
   *
   * Polling a run and waiting for a backend both outlive the thing that started
   * them: they keep going for tens of minutes, and a poll already in flight when
   * somebody signs out lands afterwards and writes the state back. Each loop
   * takes a copy of this on the way in and stops when it no longer matches, so
   * signing out or signing in again ends the old ones rather than racing them.
   */
  let generation = 0

  const github = {
    state,

    get signedIn() {
      return state.status === 'signed-in'
    },

    async signIn(token, repository) {
      const mine = ++generation
      state.status = 'checking'
      state.error = null

      const result = await checkAccess({
        repository: repository || state.repository,
        token,
        workflow: state.workflow,
        fetch: window.fetch.bind(window),
      })

      // Signed out, or signed in as somebody else, while this was in the air.
      // Writing now would sign the old token back in, silently.
      if (mine !== generation) return false

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
      // A new dispatch ends the watchers of the last one. Two of them writing
      // the same state is how the button ends up describing a run nobody is
      // waiting for.
      const mine = ++generation
      state.starting = true
      state.run = null
      state.started = null
      state.runError = null
      const since = new Date().toISOString()

      const result = await startBackend({
        repository: state.repository,
        token: state.token,
        workflow: state.workflow,
        ref: state.defaultBranch,
        minutes,
        // Where this site actually is, which is not always where it is
        // deployed: a tunnel or a preview build is a different origin, and the
        // backend has to allow the one asking.
        origin: window.location.origin,
        fetch: window.fetch.bind(window),
      })

      if (mine !== generation) return result
      if (!result.ok) {
        state.starting = false
        return result
      }

      github.watchRun(since, mine)
      // The backend announces itself by publishing where it is, and the app
      // only read that when it started. A backend begun from here appears
      // minutes later, so look again until it does.
      github.awaitBackend(mine)
      return result
    },

    /**
     * Wait for the backend this dispatch is bringing up.
     *
     * Stops on connecting, and stops when the run does: a run that has ended
     * without a session is one that failed, and polling on would be waiting
     * for something nobody is making.
     */
    async awaitBackend(mine = generation) {
      const app = window.$nuxt
      const deadline = Date.now() + 20 * 60 * 1000
      const look = async () => {
        if (mine !== generation || Date.now() > deadline) return
        const found = app && app.$authoring && (await app.$authoring.discover())
        if (mine !== generation) return
        if (found) {
          state.started = found
          if (found.connected) return
        }
        if (state.run && runIsFinished(state.run)) return
        window.setTimeout(look, 10000)
      }
      window.setTimeout(look, 8000)
    },

    /** Poll for the run, then for its result, and stop when it stops. */
    async watchRun(since, mine = generation) {
      const deadline = Date.now() + 90 * 60 * 1000
      // A lookup can fail for a moment and come back. It can also fail because
      // the token lost its Actions permission, and polling that for ninety
      // minutes says "Building..." the whole time about a run nobody looked up.
      const ALLOWED_FAILURES = 3
      let failures = 0
      const poll = async () => {
        if (mine !== generation) return
        if (Date.now() > deadline) {
          state.starting = false
          state.runError = 'Gave up waiting for the run.'
          return
        }
        const found = await findRun({
          repository: state.repository,
          token: state.token,
          workflow: state.workflow,
          since,
          fetch: window.fetch.bind(window),
        })
        if (mine !== generation) return
        if (!found.ok) {
          failures++
          if (failures > ALLOWED_FAILURES) {
            state.starting = false
            state.runError = found.reason || 'Could not find the run.'
            return
          }
        }
        else {
          failures = 0
        }
        if (found.ok && found.run) {
          state.run = found.run
          if (runIsFinished(found.run)) {
            state.starting = false
            return
          }
        }
        // A session job runs for as long as the session, so waiting for it to
        // finish is waiting for the backend to be torn down. The session having
        // published itself is what "started" means.
        if (state.started) {
          state.starting = false
          return
        }
        window.setTimeout(poll, state.run ? 15000 : 5000)
      }
      poll()
    },

    signOut() {
      // Ends the watchers first, so nothing in flight writes a run or a session
      // back over the state this is about to clear.
      generation++
      Object.assign(state, {
        token: null,
        login: null,
        status: 'idle',
        error: null,
        canStartBackend: false,
        // The session this dispatch brought up, once it publishes itself. Kept
        // apart from what the site is connected to, which may be something else
        // entirely.
        started: null,
        // Signing out and back in should offer to start a backend, not show a
        // disabled button waiting on the last sign-in's run.
        run: null,
        starting: false,
        runError: null,
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
