<template>
  <footer class="deck-foot" data-testid="deck-footer">
    <!-- A refused save takes the footer over until the next save clears it. -->
    <p v-if="refused" class="deck-notice" role="status" data-testid="deck-refused">
      <strong>Save refused · 422</strong>
      <span>{{ refused }}</span>
    </p>
    <template v-else-if="closing">
      <span data-testid="deck-slogan">Thanks, Drupal Melbourne</span>
    </template>
    <template v-else>
      <DeckMark />
      <span class="deck-foot__name">Stuart Clark</span>
      <span aria-hidden="true">·</span>
      <span data-testid="deck-slogan">{{ slogan }}</span>
    </template>
    <span class="deck-foot__number" data-testid="deck-number">{{ number }} / {{ total }}</span>
  </footer>
</template>

<script>
import { siteIdentity } from '../lib/settings.mjs'

/**
 * The band under every slide: the mark, the name, the slogan, the slide number.
 *
 * The slogan is Decoupled Settings. The build bakes it in, and once a backend
 * is connected the footer asks that backend for the live value, so a slogan
 * changed in Drupal during the talk shows on whichever slide is up next. The
 * session is not here: it is on the demo slides, where it matters, and it only
 * ever renders in the browser, so the public export carries nothing about it.
 */
export default {
  props: {
    number: { type: Number, default: 1 },
    total: { type: Number, default: 1 },
    /** The closing slide thanks the room instead of naming the site. */
    closing: { type: Boolean, default: false },
    /** Why the last save was refused, or nothing. */
    refused: { type: String, default: '' },
  },
  data: () => ({ live: null }),
  computed: {
    slogan() {
      if (this.live) return this.live
      return siteIdentity((this.$config || {}).decoupledSettings, { slogan: 'Serverless Drupal' }).slogan
    },
    backendUrl() {
      const state = (this.$druxtIce && this.$druxtIce.state) || null
      return (state && state.url) || ''
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
