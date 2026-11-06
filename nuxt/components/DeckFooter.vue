<template>
  <footer class="deck-foot" data-testid="deck-footer">
    <!--
      A refused save takes the footer over until the next save clears it, or
      the presenter dismisses it. A reason longer than the line drifts slowly
      sideways and back, so the whole of it can be read from the room; it
      holds still under a pointer, and under reduced motion.
    -->
    <p v-if="refused" class="deck-notice" role="status" data-testid="deck-refused">
      <strong>Save refused</strong>
      <span ref="track" class="deck-notice__track"
        ><span ref="text" class="deck-notice__text" :class="{ 'deck-notice__text--drift': drift > 0 }" :style="driftStyle">{{
          refused
        }}</span></span
      >
      <button type="button" class="deck-notice__dismiss" data-testid="deck-refused-dismiss" @click="$emit('dismiss')">Dismiss</button>
    </p>
    <template v-else-if="closing">
      <span data-testid="deck-slogan">Thanks, Drupal Melbourne</span>
    </template>
    <template v-else>
      <DeckMark />
      <span class="deck-foot__name">Stuart Clark</span>
      <span aria-hidden="true">·</span>
      <!--
        Dimmed while a connected backend is being asked, and lit for a moment
        when its answer differs from the build, so a slogan changed in Drupal
        is seen to arrive rather than to have been there all along.
      -->
      <span
        class="deck-foot__slogan"
        :class="{ 'deck-foot__slogan--asking': asking, 'deck-foot__slogan--fresh': fresh }"
        data-testid="deck-slogan"
        >{{ slogan }}</span
      >
    </template>
    <span class="deck-foot__number" data-testid="deck-number">{{ number }} / {{ total }}</span>
  </footer>
</template>

<script>
import { settingsFromDocument, siteIdentity } from '../lib/settings.mjs'

/**
 * One settings request per backend for the life of the page.
 *
 * The footer is remade on every slide, and asking the backend again each time
 * was a round trip on every move. A reload empties this, which is what the
 * settings demo asks for anyway.
 */
const settingsRequests = new Map()

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
  emits: ['dismiss'],
  data: () => ({
    live: null,
    /** A backend has been asked for the slogan and has not answered yet. */
    asking: false,
    /** The live slogan just arrived and differs from the build's. */
    fresh: false,
    /** How far the reason overflows its line, in pixels; 0 when it fits. */
    drift: 0,
  }),
  computed: {
    slogan() {
      if (this.live) return this.live
      return siteIdentity((this.$config || {}).decoupledSettings, { slogan: 'Serverless Drupal' }).slogan
    },
    backendUrl() {
      const state = (this.$druxtIce && this.$druxtIce.state) || null
      return (state && state.url) || ''
    },
    /** The drift's distance and pace: about forty pixels a second, both ways. */
    driftStyle() {
      if (!this.drift) return null
      return { '--drift': `-${this.drift}px`, '--drift-time': `${Math.max(4, this.drift / 40)}s` }
    },
  },

  watch: {
    refused: {
      immediate: true,
      handler() {
        this.$nextTick(this.measure)
      },
    },
    backendUrl: {
      immediate: true,
      handler(url) {
        if (url) this.refresh(url)
        else this.live = null
      },
    },
  },
  mounted() {
    window.addEventListener('resize', this.measure)
    // The drawer opening or closing changes the footer's width with no window
    // resize, and the drift is measured against that width.
    if (typeof window.ResizeObserver === 'function') {
      this.observer = new window.ResizeObserver(() => this.measure())
      this.observer.observe(this.$el)
    }
    // Ask the backend the page already knows about before the editing plugin
    // has finished its own connection check, which is a round trip the slogan
    // need not wait for. The later watcher asks the same endpoint and finds
    // this request in the cache.
    const early = this.rememberedBackend()
    if (early) this.refresh(early)
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.measure)
    if (this.observer) this.observer.disconnect()
  },

  methods: {
    /**
     * The backend this page was pointed at, before the plugin confirms it.
     *
     * The query string wins, then what the plugin remembered last time. Either
     * may be missing, and a page with no backend asks nobody.
     */
    rememberedBackend() {
      const query = (this.$route && this.$route.query && this.$route.query.backend) || ''
      if (query) return String(query)
      try {
        const stored = window.localStorage.getItem('authoring.backend') || ''
        if (!stored) return ''
        if (stored.startsWith('{')) return String(JSON.parse(stored).url || '')
        return stored
      } catch {
        return ''
      }
    },
    /** Measure how much of the reason does not fit on its line. */
    measure() {
      const track = this.$refs.track
      const text = this.$refs.text
      this.drift = track && text ? Math.max(0, text.scrollWidth - track.clientWidth) : 0
    },
    /**
     * Ask the connected backend what the slogan is now.
     *
     * The same endpoint the build read, with the consumer named, so a value set
     * for this frontend's consumer wins over the site-wide one.
     */
    async refresh(url) {
      if (typeof window === 'undefined' || !this.$druxt || !this.$druxt.axios) return
      if (this.live === null) this.asking = true
      try {
        const clientId = ((this.$config || {}).authoring || {}).clientId
        const endpoint = `${url.replace(/\/+$/, '')}/jsonapi/decoupled/settings`
        if (!settingsRequests.has(endpoint)) {
          settingsRequests.set(
            endpoint,
            this.$druxt.axios.get(endpoint, {
              headers: { Accept: 'application/vnd.api+json', ...(clientId ? { 'X-Consumer-ID': clientId } : {}) },
            })
          )
        }
        const { data: body } = await settingsRequests.get(endpoint)
        const slogan = siteIdentity(settingsFromDocument(body), {}).slogan
        if (slogan && slogan !== this.live) {
          const baked = siteIdentity((this.$config || {}).decoupledSettings, { slogan: 'Serverless Drupal' }).slogan
          this.live = slogan
          if (slogan !== baked) {
            this.fresh = true
            window.setTimeout(() => {
              this.fresh = false
            }, 1800)
          }
        }
      } catch {
        // The baked slogan stands. A footer is not where a request failure
        // shows. The next slide asks again rather than keeping the failure.
        settingsRequests.clear()
      } finally {
        this.asking = false
      }
    },
  },
}
</script>
