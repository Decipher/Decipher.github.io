<template>
  <div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-if="!$attrs.inlineEdit" class="prose-body" v-html="model.processed" />

    <label v-else class="block">
      <span class="eyebrow mb-1.5 block">{{ label }}</span>
      <textarea
        v-model="model.value"
        rows="8"
        class="w-full rounded border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
        data-testid="field-text"
      />
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
 * A plain textarea rather than a rich text editor. `example-druxt-blog` used
 * CKEditor 5 here, which is the better end state, but it is a large dependency
 * and this is the first pass at making fields themeable at all.
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
