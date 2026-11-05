<template>
  <div class="deck" :data-theme="theme" data-testid="preview">
    <div class="deck-stage">
      <p v-if="message" class="deck-sub deck-preview__message" data-testid="preview-message">{{ message }}</p>
      <div v-else-if="entity" class="deck-frame deck-frame--fit">
        <!--
          Through DruxtEntity, as the deck renders a slide, with the store
          holding the preview document so nothing is fetched twice and the
          saved version never shows through.
        -->
        <DruxtEntity
          v-if="entity.type === 'node--slide'"
          :type="entity.type"
          :uuid="entity.id"
          :mode="mode"
          :wrapper="{}"
        >
          <template #default="{ entity: rendered }">
            <DeckSlide :entity="rendered || entity" :deck="[entity]" :theme="theme" preview />
          </template>
        </DruxtEntity>
        <DruxtEntity v-else :type="entity.type" :uuid="entity.id" :mode="mode" />
      </div>
    </div>
  </div>
</template>

<script>
import { previewEntity, previewMode, previewPath } from '../lib/preview.mjs'

/** Where the presenter's theme choice is kept, shared with the deck. */
const THEME_KEY = 'deck.theme'

/**
 * A node as it is in Drupal's edit form, before it is saved.
 *
 * consumer_node_preview sends the editor here with the path of the node's
 * JSON:API preview document in the fragment. This page fetches it from its
 * own origin, with the editor's session cookie, and renders what comes back.
 * Same origin is the whole arrangement: the cookie is SameSite=Lax, so only a
 * frontend that Drupal is proxied under can read a draft with it.
 *
 * Nothing is fetched on the server. The fragment never reaches it, and the
 * cookie is the browser's.
 */
export default {
  layout: 'deck',

  data: () => ({
    entity: null,
    message: 'Loading the preview.',
    mode: 'default',
    theme: 'light',
  }),

  head() {
    const title = ((this.entity || {}).attributes || {}).title
    return { title: title ? `Preview: ${title}` : 'Preview' }
  },

  async mounted() {
    try {
      const stored = window.localStorage.getItem(THEME_KEY)
      if (stored === 'dark' || stored === 'light') this.theme = stored
    } catch {
      // No storage, no remembered theme.
    }
    this.mode = previewMode(this.$route.query)
    const path = previewPath(window.location.hash)
    if (!path) {
      this.message = 'There is no preview to show. Open this page from a node edit form.'
      return
    }
    let document
    try {
      const response = await fetch(path, {
        credentials: 'include',
        headers: { Accept: 'application/vnd.api+json' },
      })
      if (!response.ok) {
        this.message =
          response.status === 403 || response.status === 401
            ? 'Drupal did not accept the session. Sign in to Drupal on this site, then preview again.'
            : `Drupal answered ${response.status} for the preview.`
        return
      }
      document = await response.json()
    } catch (error) {
      this.message = `The preview could not be fetched: ${error.message}`
      return
    }
    const entity = previewEntity(document)
    if (!entity) {
      this.message = 'The preview document holds no node.'
      return
    }
    // Into the store first, so DruxtEntity finds the draft there and asks
    // Drupal for nothing.
    this.$store.commit('druxt/addResource', {
      prefix: undefined,
      resource: { data: entity, links: document.links || {} },
    })
    this.message = ''
    this.entity = entity
  },
}
</script>
