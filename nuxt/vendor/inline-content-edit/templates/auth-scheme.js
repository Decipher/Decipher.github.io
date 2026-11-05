/**
 * druxt-auth's authorization code scheme, pointed at the backend this module
 * connected to.
 *
 * nuxt/auth reads a strategy's endpoints when it uses them, not when the site
 * is built, so the three moments that matter are covered here: `mounted()`,
 * which exchanges the code on the way back from the backend, `login()`, which
 * sends the browser there, and `refreshTokens()`, which renews the session.
 * The backend comes from `$druxtIce` once it has connected, and from the
 * record it keeps in storage until then, which is the case on the callback
 * page: the plugin that connects is still checking the backend while nuxt/auth
 * exchanges the code, and the record is what says where the code came from.
 *
 * Tokens belong to the backend that issued them. Before the strategy is
 * pointed at a different backend, tokens the previous one issued are dropped,
 * so a refresh token is never posted to a backend that did not mint it. They
 * are dropped without signing out of Drupal, which `reset()` would do.
 */
import DrupalScheme from 'druxt-auth/templates/drupal-scheme.js'
import {
  backendFor,
  ISSUER_KEY,
  pointStrategyAt,
  safeStorage,
  tokensAreForeign,
} from '@druxt-contrib/inline-content-edit'

export default class DruxtIceScheme extends DrupalScheme {
  /** Follow the connection, when there is one to follow. */
  follow() {
    if (typeof window === 'undefined') return false
    const backend = backendFor(this.$auth.ctx, safeStorage(window))
    this.dropForeignTokens(backend)
    return pointStrategyAt(this.options, backend)
  }

  /** Drop tokens another backend issued, before this one could be asked with them. */
  dropForeignTokens(backend) {
    const storage = this.$auth.$storage
    const issuer = storage.getUniversal(ISSUER_KEY)
    if (!tokensAreForeign(issuer, backend)) return false
    this.token.reset()
    this.refreshToken.reset()
    storage.setUniversal(ISSUER_KEY, false)
    return true
  }

  /** Record which backend the tokens in hand came from. */
  recordIssuer() {
    if (!this.token.get()) return
    const backend = backendFor(this.$auth.ctx, safeStorage(window))
    if (backend) this.$auth.$storage.setUniversal(ISSUER_KEY, backend.url)
  }

  async mounted() {
    this.follow()
    const result = await super.mounted()
    this.recordIssuer()
    return result
  }

  async login(options) {
    this.follow()
    return super.login(options)
  }

  async refreshTokens() {
    this.follow()
    const result = await super.refreshTokens()
    this.recordIssuer()
    return result
  }
}
