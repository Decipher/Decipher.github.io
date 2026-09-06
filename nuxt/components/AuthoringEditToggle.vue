<template>
  <button
    v-if="shown"
    type="button"
    class="font-mono text-xs uppercase tracking-eyebrow underline transition-colors"
    :class="editing ? 'text-accent' : 'text-muted hover:text-accent'"
    data-testid="authoring-edit-toggle"
    :aria-pressed="String(editing)"
    @click="toggle"
  >
    {{ editing ? 'Done' : 'Edit' }}
  </button>
</template>

<script>
/**
 * Turn edit mode on and off.
 *
 * One control, in two places, showing only the face that applies. The way in
 * is a menu item beside the account, because editing is something an account
 * does; the way out is on the bar that only exists while editing, because that
 * is where somebody's attention already is. Rendering both faces in both places
 * put two identical buttons on the page and said "edit" four times over.
 *
 * Deliberately independent of being connected or signed in. Editing stages into
 * the cart, and the cart works with no backend, so requiring one to turn the
 * mode on would make the offline half unreachable. Committing is where a
 * backend becomes necessary, and the cart says so there.
 */
export default {
  name: 'AuthoringEditToggle',

  props: {
    /** `start` is the way in, `stop` the way out. */
    mode: {
      type: String,
      default: 'start',
      validator: (value) => ['start', 'stop'].includes(value),
    },
  },

  computed: {
    shown() {
      return this.mode === (this.editing ? 'stop' : 'start')
    },

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
