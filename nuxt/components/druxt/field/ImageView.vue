<template>
  <div class="authoring-field-image" :data-authoring-field="schema.id">
    <img
      v-for="image of images"
      :key="image.src"
      :src="image.src"
      :alt="image.alt"
      loading="lazy"
      class="h-auto max-w-full rounded"
      data-testid="field-image"
    />
  </div>
</template>

<script>
/**
 * An image field, displayed.
 *
 * Replaces `DruxtFieldImage`, which druxt-entity itself marks deprecated and
 * which does two things a decoupled frontend cannot live with: it builds
 * `/sites/default/files/...` from the file's internal URI, which points at
 * whatever is serving the frontend rather than at the backend, and it renders
 * no `alt` at all, on a field Drupal is configured to require alt text for.
 *
 * Named `ImageView` rather than put in the fallback because Druxt resolves the
 * most specific component it can find, and `DruxtFieldImage` is registered
 * globally by druxt-entity: the fallback is never reached for an image.
 * `DruxtFieldImageView` is one place more specific, so it wins.
 *
 * A relationship carries the file's id and the alt text but not its path, so
 * the file entities have to be fetched before anything can be drawn.
 */
import { DruxtFieldMixin } from 'druxt-entity'

export default {
  name: 'DruxtFieldImageView',

  mixins: [DruxtFieldMixin],

  data: () => ({ files: {} }),

  computed: {
    items() {
      const data = (this.model || {}).data
      if (!data) return []
      return Array.isArray(data) ? data : [data]
    },

    images() {
      return this.items
        .map((item) => {
          const alt = (item.meta || {}).alt || ''
          // A picture chosen in this browser and not yet committed has an id
          // the backend has never heard of, so there is nothing to fetch. Its
          // own bytes are the preview, the same way a staged title is the
          // title.
          const pending = this.pendingFiles[item.id]
          if (pending) return { src: pending.dataUrl, alt }

          const file = this.files[item.id]
          const url = (((file || {}).attributes || {}).uri || {}).url
          if (!url) return null
          return { src: this.absolute(url), alt }
        })
        .filter(Boolean)
    },

    /**
     * Every file the cart is holding bytes for, by id.
     *
     * Read from the cart rather than passed in, because this component is
     * rendered by Druxt from a slot and has no parent to take a prop from.
     */
    pendingFiles() {
      const cart = this.$store.state.authoringCart
      const found = {}
      // Staged and unstaged alike: an image chosen and not staged still shows
      // on the page, the same as an unstaged word does.
      for (const held of [cart.entries || {}, cart.drafts || {}]) {
        for (const resource of Object.values(held)) {
          for (const file of Object.values(resource.files || {})) found[file.id] = file
        }
      }
      return found
    },
  },

  watch: {
    items: { immediate: true, handler: 'loadFiles' },
  },

  methods: {
    async loadFiles() {
      for (const item of this.items) {
        if (this.files[item.id] || item.type !== 'file--file') continue
        // Nothing to look up for bytes that have not been sent anywhere.
        if (this.pendingFiles[item.id]) continue
        try {
          // Positional on the client. The Vuex action is the one that takes an
          // object, and passing one here fetches `/jsonapi/[object Object]`.
          const resource = await this.$druxt.getResource(item.type, item.id)
          if (resource && resource.data) this.$set(this.files, item.id, resource.data)
        } catch {
          // A file that cannot be read renders as nothing, which is better than
          // a broken image or a page that fails to render at all.
        }
      }
    },

    /** Drupal returns a site-relative URL, which is not this origin. */
    absolute(url) {
      if (/^https?:\/\//.test(url)) return url
      const backend = (this.$authoring && this.$authoring.state.url) || ''
      return `${String(backend).replace(/\/+$/, '')}${url}`
    },
  },
}
</script>
