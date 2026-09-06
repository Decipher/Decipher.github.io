<template>
  <!--
    Drupal's account menu, rendered as this site's account control.

    A decoupled site has two ideas of "signed in" and only one place a reader
    looks for either. Drupal's own account menu links to `/user/login` on the
    backend, which for a static site is an origin the reader has never heard of
    and which is usually not running. So the block keeps its place in the
    layout, and this renders what signing in actually means here.

    Named for the block plugin rather than for the theme: Druxt builds a
    component name for every prefix of its options, so this one matches any
    theme's account menu rather than only Olivero's.
  -->
  <div class="druxt-block-account flex items-baseline gap-4" data-testid="block-account-menu">
    <!--
      Editing belongs with the account, because it is something an account can
      do. It used to live in a toolbar of its own above the site, which is a lot
      of page furniture for one link.
    -->
    <AuthoringEditToggle />
    <!--
      The trigger only. The dialog is hosted by the layout, outside every Drupal
      region, because connecting a backend re-renders this one.
    -->
    <AuthoringLoginTrigger />
  </div>
</template>

<script>
export default {
  name: 'DruxtBlockSystemMenuBlockAccount',

  props: {
    // Declared so the template reads plainly. Unused: what this renders does
    // not come from Drupal's menu links.
    block: { type: Object, default: () => ({}) },
  },

}
</script>
