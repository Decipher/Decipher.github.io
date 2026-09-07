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
        Drupal's header is the site's header, so it goes first and nothing sits
        above it. A toolbar used to, which put the tool above the site it is a
        tool for.

        The sign-in dialog is hosted here and nowhere else. Drupal's account menu
        carries the button that opens it, and that menu is inside a region Druxt
        re-renders the moment a backend connects: a dialog rendered there would
        be unmounted by the thing it was opened to do.
      -->
      <AuthoringLogin :trigger="false" />
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

      <!--
        Only while editing, and floating rather than stacked. Editing happens
        down the page and a count you have to scroll back up for is a count
        nobody reads, so this follows you; a reader who is not editing sees the
        site instead of a strip of controls for something they are not doing.

        It does not say "editing" anywhere. Being on screen says that, and the
        page managed to say the word four times over between the old toolbar
        label, the toggle, the counter and the drawer heading.

        Also shown when something is staged and editing is off. Staged work
        survives a reload, and work that is waiting to be sent should never be
        invisible: the only way back to it would be to guess that turning
        editing on again would reveal it.
      -->
      <div
        v-if="editing || changes"
        class="sticky bottom-4 z-30 mx-auto mb-4 flex w-fit items-center gap-5 rounded-full border border-hairline bg-surface px-5 py-2.5 shadow-lg"
        data-testid="authoring-bar"
      >
        <AuthoringCartToggle />
        <AuthoringEditToggle mode="stop" />
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
import { publishStickyOffset } from '../lib/sticky.mjs'

import { siteIdentity } from '../lib/settings.mjs'

export default {
  /**
   * Publish how much of the viewport the pinned bands take.
   *
   * Once, here, because several things need to start below them and the number
   * changes with the page: the breadcrumb bar only exists where there is a
   * trail. Everything else reads `--sticky-top` rather than measuring again.
   *
   * After a tick, because the regions are rendered by Druxt and are not there
   * when the layout mounts.
   */
  mounted() {
    this.measureSticky()
    this.$nextTick(this.measureSticky)
    window.addEventListener('resize', this.measureSticky)
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.measureSticky)
  },

  methods: {
    measureSticky() {
      publishStickyOffset(document, window)
    },
  },

  computed: {
    cartOpen() {
      return this.$store.getters['authoringCart/drawerOpen']
    },

    editing() {
      return this.$store.getters['authoringCart/editing']
    },

    /** Anything staged or typed, so held work is never off screen. */
    changes() {
      return this.$store.getters['authoringCart/count']
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
