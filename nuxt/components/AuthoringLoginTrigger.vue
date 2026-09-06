<template>
  <!--
    Opens the sign-in dialog, which lives elsewhere.

    Split from `AuthoringLogin` so Drupal's account menu can carry the control
    while the layout keeps the dialog. The menu is inside a Druxt region, and
    connecting a backend re-renders that region: a dialog rendered there would
    be unmounted by the thing it was opened to do.
  -->
  <button
    type="button"
    class="font-mono text-xs uppercase tracking-eyebrow text-muted underline transition-colors hover:text-accent"
    data-testid="authoring-login-trigger"
    @click="$authoring.openLogin()"
  >
    {{ label }}
  </button>
</template>

<script>
export default {
  name: 'AuthoringLoginTrigger',

  computed: {
    /** What the control says depends on how far in the reader already is. */
    label() {
      const authoring = this.$authoring || {}
      if (!authoring.connected) return 'Log in'
      return authoring.authenticated ? 'Account' : 'Log in'
    },
  },
}
</script>
