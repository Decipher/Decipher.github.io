<template>
  <!--
    Drupal's "Powered by Drupal" block, rendered rather than dropped, and
    crediting the part a visitor is actually looking at.

    It is placed and enabled in `footer_bottom` on a stock Olivero, and nothing
    here drew it, so Druxt fell back to an empty wrapper. The block still had a
    band around it though, with a rule above and padding either side, so the
    front page carried a 65 pixel empty strip directly above the site's own
    footer and looked like a layout that had come apart.

    Rendering it is the truer fix for this site, which is built on the principle
    that Drupal decides what is on the page. A site that does not want it takes
    the block out in Drupal, which is where that decision belongs.

    Drupal is the backend here, and on a published page it is not running at
    all: everything a visitor sees was rendered by Druxt and written to a file.
    So the block names Druxt. Drupal keeps the credit it is due in the block's
    own existence, since it is the one that asked for this to be on the page.
  -->
  <p class="eyebrow" data-testid="block-powered-by">
    Powered by
    <a href="https://druxtjs.org" rel="noopener" class="hover:text-accent"
      >Druxt</a
    >
  </p>
</template>

<script>
export default {
  name: 'DruxtBlockSystemPoweredByBlock',

  props: {
    // Declared so the template reads plainly. Unused: the block's own markup is
    // a sentence Drupal builds, and this says the same thing in the site's own
    // type rather than importing Drupal's.
    block: { type: Object, default: () => ({}) },
  },
}
</script>
