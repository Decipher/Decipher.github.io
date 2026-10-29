<template>
  <section
    class="deck-slide"
    :class="`deck-slide--${layout}`"
    :data-layout="layout"
    data-testid="deck-slide"
  >
    <!-- The top band: clear, except for the authoring controls when a backend is about. -->
    <div class="deck-top">
      <client-only>
        <template v-if="backend && !preview">
          <AuthoringLoginTrigger />
          <AuthoringEditToggle />
          <AuthoringCartToggle />
        </template>
      </client-only>
    </div>
    <div class="deck-gutter" aria-hidden="true"></div>

    <div class="deck-body" v-bind="bodyAnchors">
      <!-- intro: the title, the speaker line, and the QR code to stuar.tc. -->
      <template v-if="layout === 'intro'">
        <div class="deck-intro">
          <p class="deck-eyebrow">Drupal Melbourne</p>
          <h1 class="deck-title deck-title--huge">{{ title }}</h1>
          <p class="deck-speaker">{{ read.lead }}</p>
          <p v-for="(line, i) in read.rest" :key="i" class="deck-sub">{{ line }}</p>
        </div>
        <DeckQr v-if="qr" :svg="qr" :caption="linkTitle" />
      </template>

      <!-- statement: one sentence, and a quieter one under it. -->
      <template v-else-if="layout === 'statement'">
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
        <h2 class="deck-title">{{ title }}</h2>
        <div class="deck-code">
          <div class="deck-code__caption">{{ read.language || 'code' }}</div>
          <pre><code>{{ read.code }}</code></pre>
        </div>
      </template>

      <!-- demo: the instruction on the left, the stage on the right. -->
      <template v-else-if="layout === 'demo'">
        <div class="deck-demo">
          <p v-if="step" class="deck-eyebrow">Demo {{ step.step }} of {{ step.of }}</p>
          <h2 class="deck-title">{{ title }}</h2>
          <p class="deck-lead">{{ read.lead }}</p>
          <p v-for="(line, i) in read.rest" :key="i" class="deck-sub">{{ line }}</p>
        </div>
        <div class="deck-right" data-testid="deck-stage">
          <span v-if="step" class="deck-numeral">{{ step.step }}</span>
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
          <h2 class="deck-title">{{ title }}</h2>
          <p class="deck-sub">{{ read.lead }}</p>
        </div>
        <DeckQr v-if="qr" :svg="qr" :caption="linkTitle" />
      </template>

      <!-- close: the title, and whatever is left to say. -->
      <template v-else>
        <h2 class="deck-title deck-title--huge">{{ title }}</h2>
        <p v-for="(line, i) in [read.lead, ...read.rest].filter(Boolean)" :key="i" class="deck-sub">{{ line }}</p>
      </template>
    </div>

    <DeckFooter :number="index + 1" :total="deck.length" />
  </section>
</template>

<script>
import { fieldAnchors } from '@druxt-contrib/anchors'

import { demoStep, layoutOf, readBody } from '../lib/deck.mjs'

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
    backend() {
      return Boolean(this.$druxtIce && this.$druxtIce.state && this.$druxtIce.state.url)
    },
  },
}
</script>
