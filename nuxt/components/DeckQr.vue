<template>
  <figure class="deck-qr" data-testid="deck-qr">
    <!--
      Inline SVG made when the site was built, so no request leaves the page
      for it. The tile is white in both themes: a phone camera reads dark
      modules on a light ground, and the dark theme is for the room, not the
      code.
    -->
    <div class="deck-qr__tile" v-html="svg"></div>
    <figcaption v-if="caption" class="deck-qr__caption">{{ caption }}</figcaption>
  </figure>
</template>

<script>
export default {
  props: {
    svg: { type: String, required: true },
    caption: { type: String, default: '' },
  },
}
</script>
