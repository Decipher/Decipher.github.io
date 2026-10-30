<template>
  <div class="deck-vale" data-testid="deck-vale">
    <!-- The preset examples, each marked the way an edit is: the words Vale
         flagged underlined, and a badge in the gutter. -->
    <ul class="deck-bullets">
      <li
        v-for="(example, i) in examples"
        :key="i"
        :class="{ 'deck-flagged': flagged(results[i]) }"
        data-testid="deck-vale-example"
        :data-alerts="results[i] ? results[i].length : null"
      >
        <template v-for="(part, j) in flagText(example, results[i])">
          <mark v-if="part.flagged" :key="j" class="deck-flag" :title="part.title">{{ part.text }}</mark>
          <template v-else>{{ part.text }}</template>
        </template>
      </li>
      <!-- A sentence of the room's own, once it has been checked. -->
      <li
        v-if="alerts"
        :class="{ 'deck-flagged': alerts.length > 0 }"
        data-testid="deck-vale-result"
        :data-alerts="alerts.length"
      >
        <template v-for="(part, j) in flagText(checked, alerts)">
          <mark v-if="part.flagged" :key="j" class="deck-flag" :title="part.title">{{ part.text }}</mark>
          <template v-else>{{ part.text }}</template>
        </template>
        <span v-if="alerts.length === 0" class="deck-vale__clean"> clean</span>
      </li>
    </ul>

    <textarea
      v-model="text"
      data-testid="deck-vale-text"
      placeholder="Type a sentence, then press Check."
      aria-label="A sentence to check"
      rows="2"
    ></textarea>
    <div class="deck-vale__row">
      <button type="button" class="deck-button" :disabled="!canCheck" data-testid="deck-vale-check" @click="check">
        Check
      </button>
      <span class="deck-status" data-testid="deck-vale-status">{{ status }}</span>
    </div>
  </div>
</template>

<script>
import { flagText } from '../lib/deck.mjs'

/**
 * The live Vale check on the Vale slide.
 *
 * Posts text to the backend's `/vale/check`, which checks without saving, and
 * marks what it answers with. The examples are checked once when a backend is
 * there to ask; the textarea is checked on the button, never on a keystroke,
 * because the endpoint is rate limited and a room full of typing would spend
 * the limit before the demo did.
 */
export default {
  props: {
    examples: { type: Array, default: () => [] },
  },
  data: () => ({
    text: '',
    checked: '',
    alerts: null,
    results: {},
    status: '',
    busy: false,
  }),
  computed: {
    backend() {
      const state = (this.$druxtIce && this.$druxtIce.state) || {}
      return state.url ? String(state.url).replace(/\/+$/, '') : ''
    },
    token() {
      const auth = (this.$druxtIce && this.$druxtIce.auth) || {}
      return auth.token || ''
    },
    canCheck() {
      return Boolean(this.backend && this.text.trim()) && !this.busy
    },
  },
  watch: {
    backend: {
      immediate: true,
      handler(url) {
        if (url && typeof window !== 'undefined') this.checkExamples()
      },
    },
  },
  methods: {
    flagText,
    flagged(alerts) {
      return Array.isArray(alerts) && alerts.length > 0
    },
    describe(alert) {
      // The module's keys, not Vale's own: level, rule, line and message.
      const rule = alert.rule ? ` ${alert.rule}` : ''
      return `${alert.level || 'alert'}${rule}: ${alert.message || ''}`.trim()
    },
    async checkExamples() {
      const results = {}
      for (const [i, example] of this.examples.entries()) {
        const answer = await this.ask(example)
        if (answer.alerts) results[i] = answer.alerts
      }
      this.results = results
    },
    async check() {
      if (!this.canCheck) return
      this.busy = true
      this.status = 'Checking...'
      const text = this.text
      const answer = await this.ask(text)
      this.checked = text
      this.alerts = answer.alerts || null
      this.status = answer.message || (answer.alerts && answer.alerts.length ? this.describe(answer.alerts[0]) : '')
      this.busy = false
    },
    /**
     * One request to the check endpoint.
     *
     * Answers `{ alerts }` on success and `{ message }` when the backend said
     * no: a 429 or 503 carries `Retry-After`, which is the one number the
     * presenter needs, and anything else is said as it came.
     */
    async ask(text) {
      if (!this.backend) return { message: 'No backend is connected.' }
      try {
        const response = await fetch(`${this.backend}/vale/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          },
          body: JSON.stringify({
            entity_type: 'node',
            bundle: 'slide',
            field: 'body',
            format: 'basic_html',
            text,
          }),
        })
        if (response.status === 429 || response.status === 503) {
          const wait = response.headers.get('Retry-After')
          return { message: `Vale is busy. Try again${wait ? ` in ${wait} seconds` : ' shortly'}.` }
        }
        if (!response.ok) return { message: `The check was refused with ${response.status}.` }
        const body = await response.json()
        return { alerts: Array.isArray(body.alerts) ? body.alerts : [] }
      } catch {
        return { message: 'The backend did not answer.' }
      }
    },
  },
}
</script>
