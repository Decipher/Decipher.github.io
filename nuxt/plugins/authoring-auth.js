/**
 * OAuth 2 authorisation code flow with PKCE, against whichever backend the
 * site is currently pointed at.
 *
 * Hand-rolled rather than @nuxtjs/auth-next. The module is built to be
 * configured at build time with one fixed endpoint, and here the endpoint is
 * not known until the browser resolves a backend. Working around that is more
 * code than the flow itself, which is a redirect, a code exchange and a token
 * in memory.
 *
 * The token lives in sessionStorage, not memory and not localStorage. In memory
 * it did not survive a page navigation, so signing in and then going anywhere
 * logged you straight back out. localStorage would outlive the backend it
 * belongs to, on a shared machine, for a token nobody can revoke. sessionStorage
 * lasts exactly as long as the tab, which is about as long as the session it
 * came from.
 */

import Vue from 'vue'

import { base64Url, callbackUrl } from '../lib/authoring.mjs'

const VERIFIER_KEY = 'authoring.verifier'
const RETURN_KEY = 'authoring.return'
const TOKEN_KEY = 'authoring.token'

function randomVerifier() {
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function challengeFor(verifier) {
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  )
  return base64Url(digest)
}

export default function (context, inject) {
  const authoring = context.$authoring
  const base = context.$config._app ? context.$config._app.basePath : '/'
  const routerBase = base || '/'

  // Observable for the same reason as the backend state: the UI switches on
  // `authenticated`, which only changes after a token comes back.
  // Restored on load, so a navigation or a reload does not sign you out.
  let restored = null
  try {
    restored = JSON.parse(window.sessionStorage.getItem(TOKEN_KEY))
  } catch {
    restored = null
  }

  const auth = Vue.observable({
    token: (restored && restored.token) || null,
    account: (restored && restored.account) || null,

    get authenticated() {
      return Boolean(auth.token)
    },

    /** Send the browser to the backend's authorisation endpoint. */
    async login() {
      const backend = authoring.state.url
      const clientId = authoring.state.clientId
      if (!backend) throw new Error('No backend connected.')
      if (!clientId) throw new Error('No OAuth client ID for this backend.')

      const verifier = randomVerifier()
      window.sessionStorage.setItem(VERIFIER_KEY, verifier)
      window.sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search)

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: callbackUrl(window.location.origin, routerBase),
        code_challenge: await challengeFor(verifier),
        code_challenge_method: 'S256',
      })
      window.location.assign(`${backend}/oauth/authorize?${params}`)
    },

    /** Exchange the code the backend just sent us for a token. */
    async completeLogin(code) {
      const backend = authoring.state.url
      const verifier = window.sessionStorage.getItem(VERIFIER_KEY)
      if (!backend) throw new Error('No backend connected.')
      if (!verifier) throw new Error('No PKCE verifier: start the login again.')

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: authoring.state.clientId,
        redirect_uri: callbackUrl(window.location.origin, routerBase),
        code_verifier: verifier,
        code,
      })

      const response = await fetch(`${backend}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      window.sessionStorage.removeItem(VERIFIER_KEY)

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.error_description || detail.error || `Token request failed (${response.status}).`)
      }

      const payload = await response.json()
      auth.token = payload.access_token
      await auth.loadAccount()
      persist()
      applyToken()
      return auth.token
    },

    /** Who the token belongs to, so the UI can say so. */
    async loadAccount() {
      const backend = authoring.state.url
      try {
        const response = await fetch(`${backend}/oauth/userinfo`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        })
        auth.account = response.ok ? await response.json() : null
      } catch {
        auth.account = null
      }
    },

    /** Where the user was before they logged in. */
    consumeReturnPath() {
      const path = window.sessionStorage.getItem(RETURN_KEY)
      window.sessionStorage.removeItem(RETURN_KEY)
      return path || routerBase
    },

    logout() {
      auth.token = null
      auth.account = null
      try {
        window.sessionStorage.removeItem(TOKEN_KEY)
      } catch {
        // Nothing stored, nothing to clear.
      }
      applyToken()
    },
  })

  function persist() {
    try {
      window.sessionStorage.setItem(
        TOKEN_KEY,
        JSON.stringify({ token: auth.token, account: auth.account })
      )
    } catch {
      // Not fatal: the sign-in simply does not survive a reload.
    }
  }

  /**
   * Put the bearer token on the Druxt client, or take it off again.
   *
   * Druxt sets common headers on its own axios instance, so every request it
   * makes from here on carries the token. Without this the client stays
   * anonymous and an author sees only what a visitor would.
   */
  function applyToken() {
    const client = context.app.$druxt || context.$druxt
    if (!client || !client.axios) return
    if (auth.token) {
      client.axios.defaults.headers.common.Authorization = `Bearer ${auth.token}`
    } else {
      delete client.axios.defaults.headers.common.Authorization
    }
  }

  auth.applyToken = applyToken

  // A restored token has to reach the client too, not just the UI.
  applyToken()

  inject('authoringAuth', auth)
}
