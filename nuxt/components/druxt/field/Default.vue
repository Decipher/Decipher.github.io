<template>
  <Draggable
    :value="items"
    :disabled="!inlineEdit || items.length < 2"
    handle=".authoring-handle"
    ghost-class="opacity-40"
    @input="reorder"
  >
    <slot :inline-edit="inlineEdit" />
  </Draggable>
</template>

<script>
/**
 * The theming and editing hook for every Druxt field.
 *
 * Druxt resolves a field to the most specific component it can find and falls
 * back here, so this is the one place that applies to all of them. Two things
 * happen as a result:
 *
 * 1. `inline-edit` reaches every field through the slot, so each can render
 *    itself for reading or for editing rather than the page swapping a whole
 *    entity for a form.
 * 2. A multi-value field becomes reorderable, because ordering is a property of
 *    the field rather than of any one value in it.
 *
 * Dragging is off unless editing, and off for a single value, so a reader never
 * picks content up by accident.
 *
 * Follows the shape used in `Decipher/example-druxt-blog`.
 */
import { DruxtFieldMixin } from 'druxt-entity'
import Draggable from 'vuedraggable'

export default {
  components: { Draggable },

  mixins: [DruxtFieldMixin],

  props: {
    inlineEdit: {
      type: Boolean,
      default: false,
    },
  },

  computed: {
    /** The field's values, always as an array so ordering has something to sort. */
    items() {
      const value = this.model !== undefined ? this.model : this.value
      if (Array.isArray(value)) return value
      return value === undefined || value === null ? [] : [value]
    },
  },

  methods: {
    reorder(items) {
      // Emitted rather than written: the field does not know whether anything
      // is listening, and staging is the cart's job.
      this.model = items
      this.$emit('reordered', items)
    },
  },
}
</script>
