<template>
  <div class="authoring-callback">
    <p v-if="error" data-testid="callback-error">{{ error }}</p>
    <p v-else data-testid="callback-status">Completing sign in...</p>
  </div>
</template>

<script>
import { seoHead } from '~/lib/seo.mjs'

export default {
  name: 'AuthoringCallback',

  // A redirect target with nothing on it to read. Without this it gets no
  // canonical and no `noindex`, and turns up in search results as a blank page.
  head: () => seoHead({ title: 'Signing in', path: '/callback' }),

  data: () => ({ error: null }),

  async mounted() {
    const params = new URLSearchParams(window.location.search)

    // The backend reports its own refusals here rather than by failing the
    // redirect, so a returned error is the useful message, not a broken page.
    if (params.get('error')) {
      this.error = params.get('error_description') || params.get('error')
      return
    }

    const code = params.get('code')
    if (!code) {
      this.error = 'No authorisation code was returned.'
      return
    }

    try {
      await this.$authoringAuth.completeLogin(code)
      const back = this.$authoringAuth.consumeReturnPath()
      this.$router.replace(back)
      // The route being returned to still holds the payload baked at build
      // time, so without this the author lands back on stale content holding a
      // perfectly good token.
      if (this.$nuxt && typeof this.$nuxt.refresh === 'function') {
        await this.$nuxt.refresh()
      }
    } catch (e) {
      this.error = e.message
    }
  },
}
</script>
