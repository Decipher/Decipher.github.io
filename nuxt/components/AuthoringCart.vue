<template>
  <div v-if="count" class="authoring-cart" data-testid="authoring-cart">
    <p class="eyebrow mb-2">Staged</p>
    <p class="text-sm text-body mb-3" data-testid="authoring-cart-count">
      {{ count }} {{ count === 1 ? 'change' : 'changes' }}, not yet sent anywhere.
    </p>

    <p v-if="!persistent" class="text-sm text-muted mb-3" data-testid="authoring-cart-volatile">
      This browser will not keep them past a reload.
    </p>

    <ul class="mb-3 space-y-1">
      <li v-for="resource in resources" :key="resource.type + resource.id" class="text-sm">
        <code class="font-mono text-ink">{{ resource.type }}</code>
        <span class="text-muted"> {{ fieldNames(resource) }}</span>
        <span
          v-if="errorFor(resource)"
          class="block text-accent"
          data-testid="authoring-cart-error"
        >
          {{ errorFor(resource) }}
        </span>
      </li>
    </ul>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90 disabled:opacity-60"
        :disabled="!canCommit || committing"
        data-testid="authoring-cart-commit"
        @click="commit"
      >
        {{ committing ? 'Sending...' : 'Commit to backend' }}
      </button>
      <button
        type="button"
        class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
        data-testid="authoring-cart-download"
        @click="download"
      >
        Download for a change request
      </button>
      <button
        type="button"
        class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
        data-testid="authoring-cart-discard"
        @click="discard"
      >
        Discard
      </button>
    </div>

    <p v-if="!canCommit" class="text-sm text-muted mt-3" data-testid="authoring-cart-blocked">
      {{ blockedReason }}
    </p>
    <p v-if="result" class="text-sm text-muted mt-3" data-testid="authoring-cart-result">
      {{ result }}
    </p>
  </div>
</template>

<script>
import { exportCart, exportSummary } from '../lib/cart.mjs'

export default {
  name: 'AuthoringCart',

  data: () => ({ result: null }),

  computed: {
    count() {
      return this.$store.getters['authoringCart/count']
    },
    resources() {
      return this.$store.getters['authoringCart/resources']
    },
    persistent() {
      return this.$store.state.authoringCart.persistent
    },
    committing() {
      return this.$store.state.authoringCart.committing
    },
    backendUrl() {
      return this.$authoring && this.$authoring.state.url
    },
    token() {
      return this.$authoringAuth && this.$authoringAuth.token
    },
    canCommit() {
      return Boolean(this.backendUrl && this.token)
    },
    // Says which half is missing, because "cannot commit" on its own sends
    // people looking in the wrong place.
    blockedReason() {
      if (!this.backendUrl) return 'Connect a backend to commit these.'
      if (!this.token) return 'Sign in to commit these.'
      return ''
    },
  },

  methods: {
    fieldNames(resource) {
      return Object.keys({ ...resource.attributes, ...resource.relationships }).join(', ')
    },

    errorFor(resource) {
      return this.$store.getters['authoringCart/errorFor'](resource.type, resource.id)
    },

    async commit() {
      this.result = null
      const outcome = await this.$store.dispatch('authoringCart/commit', {
        backendUrl: this.backendUrl,
        token: this.token,
      })
      this.result = outcome.ok
        ? `Sent ${outcome.sent}. The backend has them now.`
        : outcome.reason || `Sent ${outcome.sent}, ${outcome.failed} rejected and still staged.`
    },

    /**
     * Hand the cart over as a file.
     *
     * The path that needs no backend: the same resources, as a document to
     * attach to a change request. Not a fetch, because there is deliberately
     * nothing to send it to.
     */
    download() {
      const entries = this.$store.state.authoringCart.entries
      const blob = new Blob([JSON.stringify(exportCart(entries), null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'authoring-cart.json'
      link.click()
      URL.revokeObjectURL(url)
      this.result = exportSummary(entries)
    },

    discard() {
      this.$store.dispatch('authoringCart/discardAll')
      this.result = null
    },
  },
}
</script>
