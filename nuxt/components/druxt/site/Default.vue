<template>
  <div class="druxt-site">
    <!--
      No regions means no backend answered, and Druxt's own default slot is a
      `<Nuxt />`. Rendering the bands instead would render named slots that do
      not exist, and the page would be blank: the static build serves exactly
      this case, every time, for every visitor who never connects a backend.
    -->
    <slot v-if="!regions.length" />

    <template v-else>
      <!--
        A bar, not a stack. The first region is the branding and the rest are
        menus, which is the shape every Drupal theme's header has: `header`
        first in the theme's own declared order, then the menus. So the first
        one leads and the others are pushed to the far end, rather than every
        region being given a row of its own.
      -->
      <!--
        Sticky, and translucent so the page shows through rather than sliding
        under an opaque strip. The same two-layer arrangement druxtjs.org uses:
        the site header pinned at the top, and the trail pinned beneath it, so
        where you are stays on screen while you read.

        A fixed height, because the layer below pins to the bottom of this one
        and a header that changes height would leave a gap or an overlap.
      -->
      <header
        v-if="band.top.length"
        class="druxt-region-top sticky top-0 z-40 h-16 border-b border-hairline bg-paper/90 backdrop-blur"
      >
        <div class="mx-auto flex h-full w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6">
          <slot :name="band.top[0]" />
          <div class="ml-auto flex flex-wrap items-center gap-x-6 gap-y-2">
            <slot v-for="region of band.top.slice(1)" :name="region" />
          </div>
        </div>
      </header>

      <!--
        The second layer. `top-16` is the header's height: they are pinned to
        each other, so this number and the `h-16` above move together.

        Positioning only. Whatever lands here draws its own strip, because a
        bar drawn by the wrapper is drawn whether or not anything filled it,
        and the front page has no trail to show.
      -->
      <div v-if="band.bar.length" class="druxt-region-bar sticky top-16 z-30">
        <slot v-for="region of band.bar" :name="region" />
      </div>

      <div v-if="band.hero.length" class="druxt-region-hero">
        <slot v-for="region of band.hero" :name="region" />
      </div>

      <div class="mx-auto w-full max-w-5xl px-6 py-12">
        <div v-if="band.above.length" class="druxt-region-above mb-6">
          <slot v-for="region of band.above" :name="region" />
        </div>

        <!--
          Two columns only when there is something to put beside the content. A
          site with an empty sidebar laid out around one has content narrower
          than its page for no reason a reader can see.
        -->
        <div :class="twoColumn ? 'gap-10 md:grid md:grid-cols-[minmax(0,1fr)_16rem]' : ''">
          <main class="druxt-region-main min-w-0">
            <slot v-for="region of band.main" :name="region" />
          </main>

          <aside v-if="twoColumn" class="druxt-region-aside min-w-0 space-y-6">
            <slot v-for="region of band.aside" :name="region" />
          </aside>
        </div>

        <div v-if="band.below.length" class="druxt-region-below mt-8">
          <slot v-for="region of band.below" :name="region" />
        </div>
      </div>

      <footer v-if="band.bottom.length" class="druxt-region-bottom rule">
        <div class="mx-auto w-full max-w-5xl px-6 py-8">
          <slot v-for="region of band.bottom" :name="region" />
        </div>
      </footer>
    </template>
  </div>
</template>

<script>
import { hasAside, layoutFor } from '../../../lib/regions.mjs'

/**
 * The site, arranged.
 *
 * Drupal tells a decoupled frontend which regions a theme has and nothing about
 * where they belong: the arrangement is in the theme's Twig page template,
 * which a Nuxt site never sees. Druxt hands every region over as a slot and
 * leaves the placing here.
 *
 * So the placing is inferred from the region names, which are conventional
 * across Drupal themes. Deliberately in `Default.vue` rather than
 * `Olivero.vue`: the inference is about the naming convention, not about one
 * theme, and a site wanting a hand-built layout for its own theme can add that
 * file and this stops being used.
 */
export default {
  name: 'DruxtSiteDefault',

  props: {
    regions: { type: Array, default: () => [] },
    theme: { type: String, default: '' },
  },

  computed: {
    band() {
      return layoutFor(this.regions)
    },

    twoColumn() {
      return hasAside(this.band)
    },
  },
}
</script>
