import DruxtRouter from 'druxt-router/dist/components/DruxtRouter.vue'

import { seoHead } from '~/lib/seo.mjs'

/**
 * The page every route renders through.
 *
 * Druxt supplies one of these already. This extends it only to take the head
 * back: Druxt sets a canonical from what Drupal reported, which for a build
 * against a throwaway backend is that backend's address, and it emits nothing
 * else a share or a search result needs.
 *
 * Wired up in nuxt.config.js, which points Druxt's own routes at this instead.
 */
export default {
  extends: DruxtRouter,

  head() {
    return seoHead({
      title: this.title || undefined,
      description: this.description,
      path: this.$route.path,
      image: this.shareImage,
      canonical: this.declaredCanonical,
    })
  },

  computed: {
    /**
     * What this page said about itself when the site was built.
     *
     * Not read from the entity in the store: `head()` runs before the entity
     * has been fetched, so that lookup is empty every time. The build asked
     * Drupal for the same thing and put the answer in the runtime config.
     */
    page() {
      return ((this.$config || {}).seo || {}).pages?.[this.$route.path] || {}
    },

    /**
     * What the page is about, in its own words where it has any.
     *
     * Failing that, `seoHead` falls back to the site's description rather than
     * emitting an empty tag.
     */
    description() {
      return this.page.description || undefined
    },

    /**
     * A canonical the content itself declares.
     *
     * How a syndicated post points back at the original: the copy here should
     * never outrank the real one. Drupal's own `canonical` is ignored on purpose,
     * because that is the backend's address, not a publisher's claim.
     */
    declaredCanonical() {
      return this.page.canonical || undefined
    },

    /** A share card the content supplies, rather than the site-wide one. */
    shareImage() {
      return this.page.image || undefined
    },
  },
}
