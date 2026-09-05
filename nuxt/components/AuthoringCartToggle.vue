<template>
  <button
    v-if="editing || count || unstagedCount || open"
    type="button"
    class="font-mono text-xs uppercase tracking-eyebrow underline transition-colors"
    :class="open ? 'text-accent' : 'text-muted hover:text-accent'"
    data-testid="authoring-cart-toggle"
    :aria-expanded="String(open)"
    @click="toggle"
  >
    Edits{{ tally }}
  </button>
</template>

<script>
/**
 * Open and close the edits drawer.
 *
 * Shown whenever edit mode is on, not only when something is staged. Counting
 * staged changes alone left an author who had edited things and staged none of
 * them with a drawer full of work and no way to open it.
 *
 * Still hidden from a visitor, who has no edits and no way to make any, and
 * still shown while the drawer is open, or closing an empty one would remove
 * the only way to shut it.
 */
export default {
  name: 'AuthoringCartToggle',

  computed: {
    count() {
      return this.$store.getters['authoringCart/count']
    },
    editing() {
      return this.$store.getters['authoringCart/editing']
    },
    unstagedCount() {
      return Object.keys(this.$store.state.authoringCart.drafts || {}).length
    },
    /** Staged, and a mark for anything edited and not staged. */
    tally() {
      const parts = []
      if (this.count) parts.push(String(this.count))
      if (this.unstagedCount) parts.push(`+${this.unstagedCount}`)
      return parts.length ? ` ${parts.join(' ')}` : ''
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
