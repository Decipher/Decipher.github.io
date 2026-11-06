<template>
  <!--
    The deck's layout: the slide, and beside it the same drawer the site has.

    No site header. Drupal's regions are the site's chrome and a projected slide
    is not a page of the site, so the deck draws its own frame. What it keeps is
    the authoring layer: the sign-in dialog and the staged-changes drawer, so
    the slide on screen is the content that gets edited live.
  -->
  <div class="flex min-h-screen">
    <div class="flex min-w-0 flex-1 flex-col">
      <AuthoringLogin :trigger="false" />
      <Nuxt />
    </div>
    <aside
      v-if="cartOpen"
      class="fixed inset-0 z-50 overflow-y-auto bg-surface sm:sticky sm:inset-auto sm:top-0 sm:z-auto sm:h-screen sm:w-96 sm:shrink-0 sm:border-l sm:border-hairline"
      data-testid="authoring-drawer"
      aria-label="Staged changes"
    >
      <AuthoringCart />
    </aside>
  </div>
</template>

<script>
export default {
  computed: {
    cartOpen() {
      return this.$store.getters['druxtIce/drawerOpen']
    },
  },
}
</script>
