<template>
  <div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-if="!$attrs.inlineEdit" class="prose-body" v-html="model.processed" />

    <label v-else class="block">
      <span class="eyebrow mb-1.5 block">{{ label }}</span>
      <AuthoringWysiwyg v-model="model.value" :format="model.format" />
    </label>
  </div>
</template>

<script>
/**
 * Long text, read or edited in place.
 *
 * `processed` for reading, because that is what Drupal's text format produced;
 * `value` for editing, because that is what it accepts back. Binding the
 * rendered HTML to the editor would send markup the format never authorised.
 *
 * The editor is CKEditor 5, configured from the format's own
 * `editor--editor` record over JSON:API, so the buttons are the ones the site
 * was set up with. Same choice `example-druxt-blog` made.
 */
import { DruxtEntityMixin } from 'druxt-entity'

export default {
  mixins: [DruxtEntityMixin],

  props: {
    fields: {
      type: Array,
      default: () => [],
    },
  },

  computed: {
    label() {
      return (this.schema && this.schema.label && this.schema.label.text) || 'Text'
    },
  },
}
</script>
