<template>
  <footer class="deck-foot" data-testid="deck-footer">
    <span data-testid="deck-slogan">{{ slogan }}</span>
    <client-only>
      <span v-if="session" data-testid="deck-session">{{ session }}</span>
    </client-only>
    <span data-testid="deck-number">{{ number }} / {{ total }}</span>
  </footer>
</template>

<script>
import { siteIdentity } from '../lib/settings.mjs'

/**
 * The band under every slide: the slogan, the session, the slide number.
 *
 * The slogan is Decoupled Settings. The build bakes it in, and once a backend
 * is connected the footer asks that backend for the live value, so a slogan
 * changed in Drupal during the talk shows on whichever slide is up next. The
 * session line only ever renders in the browser, from what the authoring
 * layer knows, so the public export carries nothing about sessions at all.
 */
export default {
  props: {
    number: { type: Number, default: 1 },
    total: { type: Number, default: 1 },
  },
  data: () => ({ live: null, now: Date.now() }),
  computed: {
    slogan() {
      if (this.live) return this.live
      return siteIdentity((this.$config || {}).decoupledSettings, { slogan: 'Serverless Drupal' }).slogan
    },
    state() {
      return (this.$druxtIce && this.$druxtIce.state) || null
    },
    backendUrl() {
      return (this.state && this.state.url) || ''
    },
    session() {
      if (!this.state || !this.state.url) return ''
      if (!this.state.expiresAt) return 'Session live'
      const ends = new Date(this.state.expiresAt)
      if (Number.isNaN(ends.getTime())) return 'Session live'
      const hhmm = ends.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      return `Session live, ends ${hhmm}`
    },
  },
  watch: {
    backendUrl: {
      immediate: true,
      handler(url) {
        if (url) this.refresh(url)
        else this.live = null
      },
    },
  },
  methods: {
    /**
     * Ask the connected backend what the slogan is now.
     *
     * The same endpoint the build read, with the consumer named, so a value set
     * for this frontend's consumer wins over the site-wide one.
     */
    async refresh(url) {
      if (typeof window === 'undefined' || !this.$druxt || !this.$druxt.axios) return
      try {
        const clientId = ((this.$config || {}).authoring || {}).clientId
        const { data: body } = await this.$druxt.axios.get(`${url.replace(/\/+$/, '')}/jsonapi/decoupled/settings`, {
          headers: { Accept: 'application/vnd.api+json', ...(clientId ? { 'X-Consumer-ID': clientId } : {}) },
        })
        const data = Array.isArray(body.data) ? body.data[0] : body.data
        const slogan = siteIdentity((data || {}).attributes, {}).slogan
        if (slogan) this.live = slogan
      } catch {
        // The baked slogan stands. A footer is not where a request failure shows.
      }
    },
  },
}
</script>
