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
    class="py-3 -my-3 px-1 -mx-1 font-mono text-xs uppercase tracking-eyebrow text-muted underline transition-colors hover:text-accent"
    data-testid="authoring-login-trigger"
    @click="$druxtIce.openLogin()"
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
      const authoring = this.$druxtIce || {}
      if (!authoring.connected) return 'Log in'
      // The module keeps sign-in under `auth`, not on the plugin itself.
      return authoring.auth && authoring.auth.authenticated ? 'Account' : 'Log in'
    },
  },
}
</script>
