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
    </div>

    <!--
      Its own column from `sm` up. `shrink-0` so it keeps its width and the
      content gives way, which is what makes this a drawer rather than
      something floating over the page.

      A phone has no room for two columns. `w-full` beside a `flex-1` sibling
      took the whole viewport and left the content column zero pixels wide, so
      turning on edit mode made the page disappear and replaced it with a cart
      saying nothing had been edited yet. The header inside that collapsed
      column kept drawing, overflowing across the drawer, and every tap landed
      on whichever overlapping control happened to be on top.

      So below `sm` it is an overlay with a way out, and the page is still
      behind it.
    -->
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

  watch: {
    /**
     * On a phone, turning on edit mode must not hide the page being edited.
     *
     * Edit mode opens the drawer, which is right where the drawer is a second
     * column: the author sees their changes beside the thing they changed. On
     * a narrow screen there is no second column, so the drawer is an overlay,
     * and opening it the instant edit mode starts covers the page with a cart
     * that correctly reports nothing has been edited yet. The way to the edit
     * controls is underneath it.
     *
     * So the drawer stays shut here and the cart toggle opens it. Presentation
     * is the site's to decide; the engine has no business knowing how wide the
     * window is.
     */
    editing(on) {
      if (on && this.narrow()) this.$store.dispatch('druxtIce/setDrawerOpen', false)
    },
  },

  methods: {
    measureSticky() {
      publishStickyOffset(document, window)
    },

    /** Below Tailwind's `sm`, where the drawer stops being a column. */
    narrow() {
      return typeof window !== 'undefined' && window.innerWidth < 640
    },
  },

  computed: {
    cartOpen() {
      return this.$store.getters['druxtIce/drawerOpen']
    },

    editing() {
      return this.$store.getters['druxtIce/editing']
    },

    /** Anything staged or typed, so held work is never off screen. */
    changes() {
      return this.$store.getters['druxtIce/count']
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
