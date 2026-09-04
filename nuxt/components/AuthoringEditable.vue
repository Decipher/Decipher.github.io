<template>
  <div class="authoring-editable" :class="{ 'is-editing': editing }">
    <!-- View mode, or edit mode with the form closed. -->
    <template v-if="!open">
      <div class="relative">
        <slot />
        <button
          v-if="editing"
          type="button"
          class="absolute right-1 top-1 rounded border border-hairline bg-surface px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted hover:border-accent hover:text-accent"
          :data-testid="`edit-${type}-${uuid}`"
          @click="open = true"
        >
          Edit
        </button>
        <span
          v-if="editing && staged"
          class="absolute left-1 top-1 rounded bg-accent px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-accent-contrast"
          data-testid="staged-badge"
        >
          Staged
        </span>
      </div>
    </template>

    <!-- Edit mode with the form open, in the place the content was. -->
    <div v-else class="rounded border border-accent p-4">
      <p class="eyebrow mb-3">Editing {{ type }}</p>
      <AuthoringEntityForm :type="type" :uuid="uuid" :mode="mode" @staged="onStaged" />
      <button
        type="button"
        class="mt-3 rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
        data-testid="authoring-editable-close"
        @click="open = false"
      >
        Done
      </button>
    </div>
  </div>
</template>

<script>
/**
 * One editable thing on the page.
 *
 * Wraps rendered content and, in edit mode, offers to swap it for its form in
 * place. The form is not mounted until it is opened: `DruxtEntityForm` fetches
 * its own schema and entity, and mounting one per item on the page would make
 * turning edit mode on cost a request per entity.
 *
 * Nothing here writes. Saving stages into the cart, which is what lets editing
 * work with no backend connected.
 */
export default {
  name: 'AuthoringEditable',

  props: {
    type: { type: String, required: true },
    uuid: { type: String, required: true },
    mode: { type: String, default: 'default' },
  },

  data: () => ({ open: false }),

  computed: {
    editing() {
      return this.$store.getters['authoringCart/editing']
    },
    staged() {
      return Boolean(this.$store.getters['authoringCart/entryFor'](this.type, this.uuid))
    },
  },

  watch: {
    // Leaving edit mode closes anything still open, so turning it off returns
    // the page to exactly what a visitor sees.
    editing(now) {
      if (!now) this.open = false
    },
  },

  methods: {
    onStaged() {
      this.$emit('staged')
    },
  },
}
</script>
