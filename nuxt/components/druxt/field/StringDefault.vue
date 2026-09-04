<template>
  <div>
    <span v-if="!$attrs.inlineEdit">{{ model }}</span>

    <label v-else class="block">
      <span class="eyebrow mb-1.5 block">{{ label }}</span>
      <input
        v-model="model"
        type="text"
        class="w-full rounded border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
        data-testid="field-string"
      />
    </label>
  </div>
</template>

<script>
/**
 * A single-line string, read or edited in place.
 *
 * The same two-state shape as every other field: rendered for reading, a themed
 * control for editing, switched by the `inlineEdit` flag that
 * `field/Default.vue` passes down.
 */
import { DruxtEntityMixin } from 'druxt-entity'

export default {
  mixins: [DruxtEntityMixin],

  computed: {
    label() {
      return (this.schema && this.schema.label && this.schema.label.text) || 'Text'
    },
  },
}
</script>
