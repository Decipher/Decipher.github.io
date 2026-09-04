<template>
  <div class="authoring-page">
    <p class="eyebrow mb-2">Authoring</p>
    <h1 class="mb-6 text-2xl">Edit this site</h1>

    <p class="mb-6 max-w-prose text-body">
      Turn on <strong>Edit</strong> in the header. Every article below gains an edit
      control, and changes are staged rather than saved, so this works whether or
      not a backend is connected. Commit them from the cart once one is.
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
      <li v-for="article in articles" :key="article.id">
        <AuthoringEditable type="node--article" :uuid="article.id">
          <article class="rounded border border-hairline p-4">
            <h2 class="mb-2 text-lg">{{ article.attributes.title }}</h2>
            <p class="text-body">{{ summarise(article) }}</p>
          </article>
        </AuthoringEditable>
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

  watch: {
    // Connecting a backend mid-visit should fill the list in, not require a
    // reload to notice.
    backendUrl() {
      this.$fetch()
    },
  },

  methods: {
    summarise(article) {
      const body = (article.attributes.body || {}).value || ''
      const text = body.replace(/<[^>]+>/g, '').trim()
      return text.length > 160 ? `${text.slice(0, 160)}...` : text || 'No body yet.'
    },
  },
}
</script>
