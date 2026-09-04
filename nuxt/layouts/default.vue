<template>
  <div class="min-h-screen flex flex-col bg-paper">
    <header class="border-b border-hairline">
      <div class="mx-auto w-full max-w-5xl px-6 py-5 flex items-baseline gap-6">
        <NuxtLink to="/" class="no-underline">
          <span class="font-mono text-sm tracking-eyebrow uppercase text-ink">deciphered</span>
        </NuxtLink>
        <span class="eyebrow hidden sm:inline">Serverless Drupal</span>
        <!-- Pushed to the end rather than floated, so it keeps its baseline. -->
        <div class="ml-auto">
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
        class="mx-auto w-full max-w-5xl px-6 py-8 flex flex-wrap gap-x-3 gap-y-1 items-baseline"
      >
        <span class="eyebrow">deciphered</span>
        <span class="text-dimmed" aria-hidden="true">·</span>
        <span class="eyebrow">Static build, backend on demand</span>
        <span
          class="ml-auto font-mono text-xs text-dimmed"
          data-testid="built-at"
          >{{ built }}</span
        >
      </div>
    </footer>
  </div>
</template>

<script>
export default {
  computed: {
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
