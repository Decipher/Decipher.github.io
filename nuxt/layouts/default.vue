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
      <!--
        Sticky, because the header carries the staged count and the edit toggle.
        Editing happens down the page, and a count you have to scroll back up to
        read is a count nobody reads. Opaque background, or the content scrolls
        through it.
      -->
      <header class="sticky top-0 z-20 border-b border-hairline bg-paper">
        <div class="mx-auto flex w-full max-w-5xl items-baseline gap-6 px-6 py-5">
          <!--
            Only when Drupal is not already branding the page. `DruxtSite`
            renders the branding block in the header region, and two site names
            one above the other is the toolbar competing with the site.
          -->
          <NuxtLink v-if="!brandingPresent" to="/" class="no-underline">
            <span class="font-mono text-sm uppercase tracking-eyebrow text-ink">{{
              siteName
            }}</span>
          </NuxtLink>
          <span v-if="!brandingPresent && slogan" class="eyebrow hidden sm:inline">{{ slogan }}</span>
          <span v-if="brandingPresent" class="eyebrow">Editing</span>
          <div class="ml-auto flex items-baseline gap-4">
            <AuthoringEditToggle />
            <AuthoringCartToggle />
            <!--
              Always rendered, because it hosts the sign-in dialog and that has
              to outlive the region Drupal's account menu sits in. Its own
              button is hidden when that menu is carrying one, so there is one
              control rather than two.
            -->
            <AuthoringLogin :trigger="!accountMenuPresent" />
          </div>
        </div>
      </header>

      <!--
        Drupal's own layout, not this frontend's. `DruxtSite` renders every
        region the theme declares, and the content region's Main page content
        block renders the page, so the site reads the way Drupal arranged it.
        With no backend it falls through to `<Nuxt />`, which is the static
        build serving a visitor who never connects one.
      -->
      <!--
        A div, not a `<main>`. `DruxtSite` renders one around the content
        region, which is the real one, and a document may only have a single
        `<main>`: two of them nested is invalid, and it made every `main`
        selector on the page ambiguous.
      -->
      <div class="flex-1">
        <DruxtSite />
      </div>

      <footer class="rule mt-16">
        <div
          class="mx-auto flex w-full max-w-5xl flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-8"
        >
          <span class="eyebrow">{{ siteName }}</span>
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
      class="sticky top-0 h-screen w-full shrink-0 overflow-y-auto border-l border-hairline bg-surface sm:w-96"
      data-testid="authoring-drawer"
      aria-label="Staged changes"
    >
      <AuthoringCart />
    </aside>
  </div>
</template>

<script>
import { siteIdentity } from '../lib/settings.mjs'

export default {
  computed: {
    cartOpen() {
      return this.$store.getters['authoringCart/drawerOpen']
    },

    /**
     * What Drupal calls this site.
     *
     * Read at build time from `decoupled_settings`, so there is one site name
     * rather than Drupal's and a copy of it here that drifts. The build's
     * fallback is the template's own name, which is what a build against no
     * backend gets.
     */
    siteName() {
      return this.identity.name
    },

    slogan() {
      return this.identity.slogan
    },

    brandingPresent() {
      return Boolean(this.$authoring && this.$authoring.brandingPresent)
    },

    accountMenuPresent() {
      return Boolean(this.$authoring && this.$authoring.accountMenuPresent)
    },

    identity() {
      // Baked in by `@druxt-contrib/decoupled-settings`, which reads Drupal's
      // own configuration at build time. The fallback is what a build against
      // no backend gets, rather than an empty header.
      return siteIdentity((this.$config || {}).decoupledSettings, {
        name: 'Deciphered',
        slogan: 'Serverless Drupal',
      })
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
