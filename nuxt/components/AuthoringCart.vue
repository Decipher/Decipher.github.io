<template>
  <div class="authoring-cart p-5" data-testid="authoring-cart">
    <div class="mb-3 flex items-baseline justify-between">
      <p class="eyebrow">Staged</p>
      <button
        type="button"
        class="font-mono text-xs text-muted underline hover:text-accent"
        data-testid="authoring-cart-close"
        @click="close"
      >
        Close
      </button>
    </div>

    <p v-if="!count" class="text-sm text-muted" data-testid="authoring-cart-empty">
      Nothing staged yet. Turn on Edit and change something.
    </p>
    <p v-if="count" class="mb-3 text-sm text-body" data-testid="authoring-cart-count">
      {{ count }} {{ count === 1 ? 'change' : 'changes' }}, not yet sent anywhere.
    </p>

    <p v-if="!persistent" class="text-sm text-muted mb-3" data-testid="authoring-cart-volatile">
      This browser will not keep them past a reload.
    </p>

    <ul v-if="count" class="mb-3 space-y-2">
      <li v-for="resource in resources" :key="resource.type + resource.id" class="text-sm">
        <button
          type="button"
          class="flex w-full items-baseline gap-1 text-left"
          :aria-expanded="String(isExpanded(resource))"
          data-testid="authoring-cart-expand"
          @click="toggle(resource)"
        >
          <span class="w-3 shrink-0 font-mono text-xs text-muted" aria-hidden="true">
            {{ isExpanded(resource) ? '-' : '+' }}
          </span>
          <code class="font-mono text-ink">{{ resource.type }}</code>
          <span class="text-muted">{{ fieldNames(resource) }}</span>
        </button>

        <!-- What is actually going to be sent, rather than a summary of it. -->
        <AuthoringJsonTree
          v-if="isExpanded(resource)"
          :value="resource"
          class="ml-4 mt-1 border-l border-hairline pl-2"
        />

        <span
          v-if="errorFor(resource)"
          class="block text-accent"
          data-testid="authoring-cart-error"
        >
          {{ errorFor(resource) }}
        </span>
      </li>
    </ul>

    <div v-if="count" class="flex flex-wrap gap-2">
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

  data() {
    return { expanded: {} }
  },

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
    /** One resource's own tree, open or shut. Shut by default: the drawer is a
     * list first, and a reader opens the one they care about. */
    isExpanded(resource) {
      return Boolean(this.expanded[resource.type + resource.id])
    },

    toggle(resource) {
      const key = resource.type + resource.id
      this.$set(this.expanded, key, !this.expanded[key])
    },

    close() {
      this.$store.dispatch('authoringCart/setDrawerOpen', false)
    },

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
