<template>
  <button
    type="button"
    class="font-mono text-xs uppercase tracking-eyebrow underline transition-colors"
    :class="editing ? 'text-accent' : 'text-muted hover:text-accent'"
    data-testid="authoring-edit-toggle"
    :aria-pressed="String(editing)"
    @click="toggle"
  >
    {{ editing ? 'Editing' : 'Edit' }}
  </button>
</template>

<script>
/**
 * Turn edit mode on and off.
 *
 * Deliberately independent of being connected or signed in. Editing stages into
 * the cart, and the cart works with no backend, so requiring one to turn the
 * mode on would make the offline half unreachable. Committing is where a
 * backend becomes necessary, and the cart says so there.
 */
export default {
  name: 'AuthoringEditToggle',

  computed: {
    editing() {
      return this.$store.getters['authoringCart/editing']
    },
  },

  methods: {
    toggle() {
      this.$store.dispatch('authoringCart/setEditing', !this.editing)
    },
  },
}
</script>
