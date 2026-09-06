<template>
  <!--
    Drupal's site branding, from Drupal's own settings.

    The block plugin renders nothing in a decoupled site: the name, slogan and
    logo it would print live in configuration, and Druxt has no way to read
    configuration. `decoupled_settings` does, so the block that is already
    placed in the header region gets its content from there.

    Which of the three appear is Drupal's decision too, and it is already
    recorded in the block's own settings.
  -->
  <NuxtLink :to="front" class="druxt-block-branding no-underline" data-testid="block-branding">
    <img v-if="showLogo && logo" :src="logo" alt="" class="h-8 w-auto" />
    <span
      v-if="showName && identity.name"
      class="font-mono text-sm uppercase tracking-eyebrow text-ink"
      data-testid="branding-name"
      >{{ identity.name }}</span
    >
    <span v-if="showSlogan && identity.slogan" class="eyebrow ml-3 hidden sm:inline">{{
      identity.slogan
    }}</span>
  </NuxtLink>
</template>

<script>
import { siteIdentity } from '../../../lib/settings.mjs'

export default {
  name: 'DruxtBlockSystemBrandingBlock',

  props: {
    block: { type: Object, default: () => ({}) },
  },

  computed: {
    settings() {
      return (this.$config || {}).decoupledSettings || {}
    },

    identity() {
      return siteIdentity(this.settings)
    },

    /** Where the site's front page is, as Drupal has it configured. */
    front() {
      return this.identity.front || '/'
    },

    /**
     * The theme's logo, if the theme has one.
     *
     * No fallback to the favicon. `@druxt-contrib/decoupled-settings` rewrites
     * both to `/_decoupled/<name>`, a path served by a server middleware, and a
     * full static build has no server: the URL resolves to nothing and the
     * header renders a broken image where a logo would be. A theme with no logo
     * shows its name, which is what Drupal does too.
     *
     * See druxt/druxt-decoupled-settings#3.
     */
    logo() {
      const theme = (this.$config || {}).decoupledTheme || 'olivero'
      const url = (this.settings[`${theme}.settings`] || {}).logo?.url
      // Only a real file, not the proxy path the module substitutes.
      return url && !url.startsWith('/_decoupled/') ? url : ''
    },

    // Drupal records which parts a branding block shows. Honoured, so turning
    // the slogan off in Drupal turns it off here.
    showName() {
      return this.setting('use_site_name')
    },

    showSlogan() {
      return this.setting('use_site_slogan')
    },

    showLogo() {
      return this.setting('use_site_logo')
    },
  },

  methods: {
    /** Absent means on: a block placed with no opinion shows everything. */
    setting(key) {
      const value = ((this.block || {}).attributes || {}).settings?.[key]
      return value === undefined ? true : Boolean(value)
    },
  },
}
</script>
