<template>
  <div class="authoring-callback">
    <p v-if="error" data-testid="callback-error">{{ error }}</p>
    <p v-else data-testid="callback-status">Completing sign in...</p>
  </div>
</template>

<script>
/**
 * Where the backend sends the browser back with a code.
 *
 * druxt-auth exchanges the code before this page renders, and on success it
 * returns the author to the page they signed in from, so what is left to
 * show here is a refusal: the backend reports its own in the query rather
 * than by failing the redirect, and that message is the useful one, not a
 * page that says "Completing" for ever.
 */
export default {
  name: 'AuthoringCallback',
  data: () => ({ error: null }),
  mounted() {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) {
      this.error = params.get('error_description') || params.get('error')
    } else if (!params.get('code')) {
      this.error = 'No authorisation code was returned.'
    }
  },
}
</script>
