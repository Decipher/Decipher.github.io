<template>
  <div class="authoring-page">
    <p class="eyebrow mb-2">Authoring</p>
    <h1 class="mb-6 text-2xl">Edit this site</h1>

    <p class="mb-6 max-w-prose text-body">
      Turn on <strong>Edit</strong> in the header. Every article below gains an
      edit control, and so does anything else on the site: this page is only a
      list of what exists. Changes are staged rather than saved, so this works
      whether or not a backend is connected. Commit them from the cart once one
      is.
    </p>

    <AuthoringAdd class="mb-8" />

    <p v-if="$fetchState.pending" class="text-muted">Loading content...</p>

    <p v-else-if="!connected" class="text-muted" data-testid="authoring-page-no-backend">
      No backend connected, so there is nothing existing to edit. You can still
      add new content above, and commit it later.
    </p>

    <p v-else-if="!articles.length" class="text-muted" data-testid="authoring-page-empty">
      This backend has no articles yet. Add one above.
    </p>

    <ul v-else class="space-y-6">
      <li v-for="article in articles" :key="article.id" class="rounded border border-hairline p-4">
        <!--
          Rendered by Druxt rather than by hand, so this listing goes through
          the same wrapper the rest of the site does and gets the edit control,
          the staged and unstaged badges and the preview of both for free. The
          hand-written version had none of that, and quietly showed the backend
          copy of content the author had already changed.
        -->
        <DruxtEntity type="node--article" :uuid="article.id" mode="teaser" />
      </li>
    </ul>
  </div>
</template>

<script>
/**
 * A page for editing, rather than editing bolted onto every page.
 *
 * The site's own routes are rendered by Druxt from the router, and wrapping
 * those in edit affordances means changing how the whole site renders. This is
 * the smaller first step: one route that lists what can be edited, so the loop
 * can be used and tested before it is spread everywhere.
 */
export default {
  name: 'AuthoringPage',

  data: () => ({ articles: [] }),

  async fetch() {
    this.articles = []
    if (!this.connected) return
    try {
      const response = await fetch(`${this.backendUrl}/jsonapi/node/article`, {
        headers: { Accept: 'application/vnd.api+json' },
      })
      if (!response.ok) return
      const body = await response.json()
      this.articles = Array.isArray(body.data) ? body.data : []
    } catch {
      // A backend that vanished mid-session is reported by the login control,
      // so this only has to avoid rendering a broken list.
      this.articles = []
    }
  },

  computed: {
    backendUrl() {
      return this.$authoring && this.$authoring.state.url
    },
    connected() {
      return Boolean(this.backendUrl)
    },
  },

  /**
   * Fetch on mount, explicitly.
   *
   * Nuxt's `fetch()` hook does not run on a full static build: the result was
   * baked at generate time, when there was no backend, so the list stayed empty
   * and nothing was ever requested. Calling it once the component exists is the
   * only reliable trigger here.
   */
  mounted() {
    this.$fetch()
  },

  watch: {
    // Connecting a backend mid-visit should fill the list in, not require a
    // reload to notice.
    backendUrl() {
      this.$fetch()
    },
  },
}
</script>
