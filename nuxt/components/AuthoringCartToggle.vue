<template>
  <button
    v-if="count || open"
    type="button"
    class="font-mono text-xs uppercase tracking-eyebrow underline transition-colors"
    :class="open ? 'text-accent' : 'text-muted hover:text-accent'"
    data-testid="authoring-cart-toggle"
    :aria-expanded="String(open)"
    @click="toggle"
  >
    Staged {{ count }}
  </button>
</template>

<script>
/**
 * Open and close the staged-changes drawer.
 *
 * Hidden until something is staged, so a visitor never sees a control for a
 * thing they have none of. Stays visible while the drawer is open, or closing
 * an empty cart would remove the only way to shut it.
 */
export default {
  name: 'AuthoringCartToggle',

  computed: {
    count() {
      return this.$store.getters['authoringCart/count']
    },
    open() {
      return this.$store.getters['authoringCart/drawerOpen']
    },
  },

  methods: {
    toggle() {
      this.$store.dispatch('authoringCart/setDrawerOpen', !this.open)
    },
  },
}
</script>
