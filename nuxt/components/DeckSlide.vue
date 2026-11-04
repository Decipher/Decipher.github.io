<template>
  <section
    class="deck-slide"
    :class="[`deck-slide--${layout}`, { 'deck-slide--editing': editing }]"
    :data-layout="layout"
    data-testid="deck-slide"
  >
    <!-- The top band: the session line while editing, and the controls when a backend is about. -->
    <div class="deck-top">
      <client-only>
        <template v-if="backend && !preview">
          <span v-if="editing" class="deck-top__session" data-testid="deck-editing">
            <strong>Editing</strong>
            <span>slide {{ String(index + 1).padStart(2, '0') }} · {{ layout }}</span>
          </span>
          <AuthoringLoginTrigger />
          <AuthoringEditToggle />
          <AuthoringCartToggle />
        </template>
      </client-only>
    </div>
    <div class="deck-gutter" aria-hidden="true"></div>

    <div class="deck-body" v-bind="bodyAnchors">
      <!-- intro: the event line, the title, the speaker, and the QR code to stuar.tc. -->
      <template v-if="layout === 'intro'">
        <div class="deck-intro">
          <p class="deck-eyebrow">{{ read.rest[1] || 'Drupal Melbourne' }}</p>
          <h1 class="deck-title deck-title--display">{{ title }}</h1>
          <div class="deck-speaker">
            <span class="deck-speaker__name">{{ read.lead }}</span>
            <span v-if="read.rest[0]" class="deck-speaker__role">{{ read.rest[0] }}</span>
          </div>
        </div>
        <DeckQr v-if="qr" :svg="qr" :caption="linkTitle" />
      </template>

      <!-- statement: the bar, one sentence, and a line under it. -->
      <template v-else-if="layout === 'statement'">
        <div class="deck-bar" aria-hidden="true"></div>
        <p class="deck-statement">{{ read.lead || title }}</p>
        <p v-if="read.rest[0]" class="deck-sub">{{ read.rest[0] }}</p>
      </template>

      <!-- bullets: the title, then the first list. -->
      <template v-else-if="layout === 'bullets'">
        <h2 class="deck-title">{{ title }}</h2>
        <ul class="deck-bullets">
          <li v-for="(item, i) in read.items" :key="i">{{ item }}</li>
        </ul>
      </template>

      <!-- code: the title, then the first code block on a dark ground. -->
      <template v-else-if="layout === 'code'">
        <h2 class="deck-title deck-title--code">{{ title }}</h2>
        <div class="deck-code">
          <div class="deck-code__caption">{{ read.lead || read.language || 'code' }}</div>
          <pre><code>{{ read.code }}</code></pre>
        </div>
      </template>

      <!-- demo: the instruction on the left, the stage on the right. -->
      <template v-else-if="layout === 'demo'">
        <div class="deck-demo">
          <p v-if="step" class="deck-eyebrow">Demo · step {{ step.step }} of {{ step.of }}</p>
          <h2 class="deck-title deck-title--demo">{{ title }}</h2>
          <p class="deck-lead">{{ read.lead }}</p>
          <p v-for="(line, i) in read.rest" :key="i" class="deck-lead">{{ line }}</p>
          <client-only>
            <span v-if="session" class="deck-pill" data-testid="deck-session">{{ session }}</span>
          </client-only>
        </div>
        <div class="deck-right" data-testid="deck-stage">
          <span v-if="step" class="deck-numeral" aria-hidden="true">{{ step.step }}</span>
        </div>
      </template>

      <!-- vale: the examples, and a box to try a sentence against the backend. -->
      <template v-else-if="layout === 'vale'">
        <h2 class="deck-title">{{ title }}</h2>
        <DeckValeCheck :examples="read.examples" />
      </template>

      <!-- sponsor: the QR code to GitHub Sponsors, with a line about it. -->
      <template v-else-if="layout === 'sponsor'">
        <div class="deck-sponsor">
          <p class="deck-eyebrow">Thank you</p>
          <h2 class="deck-title deck-title--demo">{{ title }}</h2>
          <p class="deck-sub">{{ read.lead }}</p>
        </div>
        <DeckQr v-if="qr" :svg="qr" :caption="linkTitle" />
      </template>

      <!-- close: the mark, the question, and where to find the speaker. -->
      <template v-else>
        <DeckMark />
        <h2 class="deck-title deck-title--close">{{ title }}</h2>
        <p class="deck-close__row">
          <strong v-if="read.lead">{{ read.lead }}</strong>
          <span v-if="read.rest[0]">{{ read.rest[0] }}</span>
        </p>
      </template>
    </div>

    <DeckFooter :number="index + 1" :total="deck.length" :closing="layout === 'close'" :refused="refused" />
  </section>
</template>

<script>
import { fieldAnchors } from '@druxt-contrib/anchors'

import { demoStep, layoutOf, readBody, sessionLabel } from '../lib/deck.mjs'

/**
 * One slide, drawn from a node by its layout.
 *
 * What it draws is the entity as it should read: what the backend holds, then
 * what is staged, then what has been typed and not yet staged. Same layering as
 * the site's entity wrapper, so an edit in the drawer shows on the slide.
 */
export default {
  props: {
    entity: { type: Object, required: true },
    index: { type: Number, default: 0 },
    deck: { type: Array, default: () => [] },
    qr: { type: String, default: '' },
    theme: { type: String, default: 'light' },
    /** Inside a node preview: the slide as it would read, with no editing controls. */
    preview: { type: Boolean, default: false },
  },
  computed: {
    merged() {
      const next = JSON.parse(JSON.stringify(this.entity || {}))
      const { type, id } = next
      if (!type || !id) return next
      const layers = [
        this.$store.getters['druxtIce/entryFor'](type, id),
        this.$store.getters['druxtIce/draftFor'](type, id),
      ]
      for (const layer of layers) {
        if (!layer) continue
        next.attributes = { ...(next.attributes || {}), ...(layer.attributes || {}) }
        next.relationships = { ...(next.relationships || {}), ...(layer.relationships || {}) }
      }
      return next
    },
    attributes() {
      return this.merged.attributes || {}
    },
    layout() {
      return layoutOf(this.merged)
    },
    title() {
      return this.attributes.title || ''
    },
    read() {
      const body = this.attributes.body || {}
      // The typed value first: a draft has no processed copy yet, and the
      // stale processed markup would otherwise win over what was just typed.
      return readBody(this.layout, body.value || body.processed || '')
    },
    linkTitle() {
      const link = this.attributes.field_link || {}
      return link.title || link.uri || ''
    },
    step() {
      return demoStep(this.deck, this.index)
    },
    /** The body names itself, so a diff or an editor can find it on the slide. */
    bodyAnchors() {
      return fieldAnchors('body')
    },
    state() {
      return (this.$druxtIce && this.$druxtIce.state) || null
    },
    backend() {
      return Boolean(this.state && this.state.url)
    },
    editing() {
      return !this.preview && Boolean(this.$store.getters['druxtIce/editing'])
    },
    /** The session line for a demo slide's pill. Empty with no backend. */
    session() {
      return this.backend ? sessionLabel(this.state) : ''
    },
    /**
     * Why the last save of this slide was refused, if it was.
     *
     * The message the backend gave, else the first reason it pinned to a
     * field. Either way it is one line, and it takes the footer over.
     */
    refused() {
      const { type, id } = this.merged
      if (!type || !id) return ''
      const message = this.$store.getters['druxtIce/errorFor'](type, id)
      if (message) return String(message)
      const fields = this.$store.getters['druxtIce/fieldErrorsFor'](type, id) || {}
      const first = Object.values(fields).flat().find(Boolean)
      return first ? String(first) : ''
    },
  },
}
</script>
