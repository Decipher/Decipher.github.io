<template>
  <div class="authoring-preview-scope"><slot /></div>
</template>

<script>
/**
 * Marks everything inside it as a rendering rather than the page.
 *
 * Entities carry their own edit control, which is what makes edit mode apply to
 * the whole site rather than to one page. That is right on the page and wrong
 * inside a preview: previewing an article showed its teaser with an Edit button
 * on it, opening that gave a form inside the form, and the preview inside that
 * one offered it again. It nested as deep as you cared to click.
 *
 * `provide` is per component rather than per slot in Vue 2, so a component
 * cannot flag only part of its own template. This wrapper exists to be that
 * part. Anything that wants a subtree treated as output rather than as the page
 * puts it inside one.
 */
export default {
  name: 'AuthoringPreviewScope',

  provide() {
    return { druxtPreview: true }
  },
}
</script>
