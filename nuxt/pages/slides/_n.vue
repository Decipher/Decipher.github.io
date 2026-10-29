<template>
  <div class="deck" :data-theme="theme" data-testid="deck">
    <div ref="stage" class="deck-stage">
      <div class="deck-frame">
        <transition name="deck-fade" mode="out-in">
          <!--
            Through DruxtEntity, with the site's own wrapper kept, so the slide
            on screen is an entity the authoring layer can edit in place. The
            scoped slot replaces Druxt's field rendering with the deck's own
            reading of the body, and `wrapper` keeps the edit controls that
            the field rendering would otherwise have brought with it.
          -->
          <DruxtEntity
            v-if="current"
            :key="current.id"
            type="node--slide"
            :uuid="current.id"
            mode="default"
            :wrapper="{}"
          >
            <template #default="{ entity }">
              <DeckSlide
                :entity="entity || current"
                :index="index"
                :deck="deck"
                :qr="qr"
                :theme="theme"
              />
            </template>
          </DruxtEntity>
        </transition>
      </div>
    </div>
  </div>
</template>

<script>
import { codeBlockWarnings, keyAction, layoutOf, linkHostAllowed, orderSlides, readBody } from '../../lib/deck.mjs'

/** Where the presenter's theme choice is kept between reloads. */
const THEME_KEY = 'deck.theme'

/** Where a QR code may point, said once in the error that names the slide. */
const ALLOWED = 'https://stuar.tc or https://github.com/sponsors/Decipher'

/**
 * The QR code for a slide's link, as inline SVG, made when the site is built.
 *
 * At build time only: `qrcode` is a Node library and the result travels in the
 * page's payload, so the browser never needs it. A link to anywhere but the two
 * hosts the talk points at stops the build here, naming the slide, because a
 * QR code is the one thing on a slide that nobody can read before scanning.
 */
async function qrFor(slide) {
  const link = ((slide.attributes || {}).field_link || {}).uri
  if (!link) return ''
  if (!linkHostAllowed(link)) {
    throw new Error(
      `Slide "${slide.attributes.title}" links to ${link}, and a QR code may only point at ${ALLOWED}.`
    )
  }
  if (!process.server) return ''
  const QRCode = require('qrcode')
  return QRCode.toString(link, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 4,
    color: { dark: '#18181a', light: '#ffffff' },
  })
}

export default {
  layout: 'deck',

  /**
   * One page instance for every slide. Nuxt would otherwise key the page by
   * its path and rebuild it on each move, and a key pressed during that
   * rebuild has nobody listening. With a fixed key the instance stays, Nuxt
   * re-runs asyncData for the new slide, and the transition below crossfades.
   */
  key: 'deck',

  validate({ params }) {
    return /^\d+$/.test(params.n)
  },

  async asyncData({ $druxt, params, error }) {
    const collection = await $druxt.getCollection('node--slide', {
      sort: 'field_order',
      'filter[status]': 1,
      'page[limit]': 50,
    })
    const deck = orderSlides((collection || {}).data || [])
    const index = Number(params.n) - 1
    const current = deck[index]
    if (!current) {
      return error({ statusCode: 404, message: 'There is no such slide.' })
    }
    if (process.server) {
      const read = readBody(layoutOf(current), bodyOf(current))
      for (const warning of codeBlockWarnings(`Slide ${index + 1}`, read.code)) {
        console.warn(`[deck] ${warning}`)
      }
    }
    return { deck, index, qr: await qrFor(current) }
  },

  data: () => ({
    deck: [],
    index: 0,
    qr: '',
    theme: 'light',
  }),

  head() {
    return { title: this.current ? `${this.current.attributes.title} (${this.index + 1} of ${this.deck.length})` : 'Slides' }
  },

  computed: {
    current() {
      return this.deck[this.index] || null
    },
  },

  mounted() {
    try {
      const stored = window.localStorage.getItem(THEME_KEY)
      if (stored === 'dark' || stored === 'light') this.theme = stored
    } catch {
      // No storage, no remembered theme. The default stands.
    }
    window.addEventListener('keydown', this.onKey)
  },

  beforeDestroy() {
    window.removeEventListener('keydown', this.onKey)
  },

  methods: {
    onKey(event) {
      const action = keyAction(event)
      if (!action) return
      event.preventDefault()
      const last = this.deck.length
      const n = this.index + 1
      if (action === 'next' && n < last) this.go(n + 1)
      if (action === 'previous' && n > 1) this.go(n - 1)
      if (action === 'first') this.go(1)
      if (action === 'last') this.go(last)
      if (action === 'fullscreen') this.fullscreen()
      if (action === 'theme') this.toggleTheme()
    },
    go(n) {
      this.$router.push(`/slides/${n}`)
    },
    fullscreen() {
      const stage = this.$refs.stage
      if (!stage) return
      if (document.fullscreenElement) document.exitFullscreen()
      else if (stage.requestFullscreen) stage.requestFullscreen()
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark'
      try {
        window.localStorage.setItem(THEME_KEY, this.theme)
      } catch {
        // Not remembered, still applied.
      }
    },
  },
}

function bodyOf(slide) {
  const body = (slide.attributes || {}).body || {}
  return body.processed || body.value || ''
}
</script>
