<template>
  <div class="authoring-entity relative" :class="{ 'is-staged': staged }">
    <!-- The entity as the site renders it, edit mode or not. -->
    <div v-if="!open">
      <slot />

      <button
        v-if="editable"
        type="button"
        class="absolute right-1 top-1 rounded border border-hairline bg-surface px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted hover:border-accent hover:text-accent"
        :data-testid="`edit-${entity.type}-${entity.id}`"
        @click="open = true"
      >
        Edit
      </button>
      <span
        v-if="editable && staged"
        class="absolute left-1 top-1 rounded bg-accent px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-accent-contrast"
        data-testid="staged-badge"
      >
        Staged
      </span>
    </div>

    <!-- Its form, in the place the content was. -->
    <div v-else class="rounded border border-accent p-4">
      <p class="eyebrow mb-3">Editing {{ entity.type }}</p>
      <AuthoringEntityForm :type="entity.type" :uuid="entity.id" :mode="mode" />
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
 * The theme component for every entity the site renders.
 *
 * This is what makes edit mode apply to the site rather than to one page.
 * Druxt renders every entity through a wrapper, falls back to `DruxtWrapper`
 * when nothing more specific exists, and that wrapper is a bare div around the
 * fields. Replacing it here means anything Druxt renders anywhere becomes
 * editable in place, with no page having to opt in.
 *
 * The markup is deliberately the same shape as `DruxtWrapper`: a div and the
 * default slot. Anything more would change how every page on the site looks.
 *
 * Named for nodes, not for `Default`. Druxt builds its candidate names from the
 * view mode, so the last-resort name for a teaser is `DruxtEntityTeaser` and
 * `DruxtEntityDefault` is never reached for one. `DruxtEntityNode` matches a
 * node in any view mode, and matches nothing else: a taxonomy term rendered
 * inside a reference field is not a thing to offer an Edit button on.
 *
 * Only the entity's own form opens, never a nested one. `DruxtEntityForm`
 * renders its fields through `DruxtField`, and a reference field renders the
 * referenced entity, which arrives back here. Without the `editing` guard the
 * result is an Edit control on the inside of a form that is already editing.
 */
export default {
  name: 'DruxtEntityNode',

  props: {
    entity: { type: Object, default: () => ({}) },
    fields: { type: Object, default: () => ({}) },
    schema: { type: Object, default: () => ({}) },
  },

  data: () => ({ open: false }),

  computed: {
    editing() {
      return this.$store.getters['authoringCart/editing']
    },

    /** Only a saved entity: a form needs something to fetch and to stage against. */
    editable() {
      return Boolean(this.editing && (this.entity || {}).type && (this.entity || {}).id)
    },

    mode() {
      return ((this.schema || {}).config || {}).mode || 'default'
    },

    staged() {
      if (!this.entity.type || !this.entity.id) return false
      return Boolean(this.$store.getters['authoringCart/entryFor'](this.entity.type, this.entity.id))
    },
  },

  watch: {
    // Leaving edit mode closes any form left open, so the site goes back to
    // being a site rather than keeping a form nobody can see the toggle for.
    editing(on) {
      if (!on) this.open = false
    },
  },
}
</script>
