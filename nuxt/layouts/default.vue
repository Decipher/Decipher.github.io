<template>
  <!--
    A drawer, not an overlay. The panel is a sibling of the content rather than
    on top of it, so opening it narrows the site instead of covering it: an
    author can read what they are editing while the cart is open, which is the
    whole reason to have it on screen.

    Same arrangement as `Decipher/example-druxt-blog`'s Drawer, in Tailwind
    rather than DaisyUI.
  -->
  <div class="flex min-h-screen bg-paper">
    <div class="flex min-w-0 flex-1 flex-col transition-all duration-200">
      <header class="border-b border-hairline">
        <div class="mx-auto flex w-full max-w-5xl items-baseline gap-6 px-6 py-5">
          <NuxtLink to="/" class="no-underline">
            <span class="font-mono text-sm uppercase tracking-eyebrow text-ink">deciphered</span>
          </NuxtLink>
          <span class="eyebrow hidden sm:inline">Serverless Drupal</span>
          <div class="ml-auto flex items-baseline gap-4">
            <AuthoringEditToggle />
            <AuthoringCartToggle />
            <AuthoringLogin />
          </div>
        </div>
      </header>

      <main class="flex-1">
        <div class="mx-auto w-full max-w-5xl px-6 py-12">
          <Nuxt />
        </div>
      </main>

      <footer class="rule mt-16">
        <div
          class="mx-auto flex w-full max-w-5xl flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-8"
        >
          <span class="eyebrow">deciphered</span>
          <span class="text-dimmed" aria-hidden="true">·</span>
          <span class="eyebrow">Static build, backend on demand</span>
          <span class="ml-auto font-mono text-xs text-dimmed" data-testid="built-at">{{
            built
          }}</span>
        </div>
      </footer>
    </div>

    <!--
      Its own column. `shrink-0` so it keeps its width and the content gives way,
      which is what makes this a drawer rather than something floating over the
      page.
    -->
    <aside
      v-if="cartOpen"
      class="w-full shrink-0 overflow-y-auto border-l border-hairline bg-surface sm:w-96"
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
      return this.$store.getters['authoringCart/drawerOpen']
    },

    /**
     * When the site was built, as YYYY.MM.DD per the design system.
     *
     * From the build, not from the browser. Reading `new Date()` here made the
     * footer show the visitor's today rather than the build's, and moved the
     * visual baseline every time the date rolled over in UTC.
     */
    built() {
      const iso = (this.$config && this.$config.builtAt) || ''
      return iso.slice(0, 10).replace(/-/g, '.')
    },
  },
}
</script>
