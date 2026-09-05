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
      <!--
        Two states worth telling apart. Staged is going to be sent; unstaged is
        an edit the author has made and not committed to, which the page shows
        so it is not invisible and not lost.
      -->
      <span
        v-if="editable && (staged || drafted)"
        class="absolute left-1 top-1 rounded px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow"
        :class="drafted ? 'border border-accent text-accent' : 'bg-accent text-accent-contrast'"
        :data-testid="drafted ? 'unstaged-badge' : 'staged-badge'"
      >
        {{ drafted ? 'Unstaged' : 'Staged' }}
      </span>
    </div>

    <!-- Its form, in the place the content was. -->
    <div v-else class="rounded border border-accent p-4">
      <p class="eyebrow mb-3">Editing {{ entity.type }}</p>
      <AuthoringEntityForm ref="form" :type="entity.type" :uuid="entity.id" :mode="mode" />
      <button
        type="button"
        class="mt-3 rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
        data-testid="authoring-editable-close"
        @click="close"
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

    entry() {
      if (!this.entity.type || !this.entity.id) return null
      return this.$store.getters['authoringCart/entryFor'](this.entity.type, this.entity.id)
    },

    draft() {
      if (!this.entity.type || !this.entity.id) return null
      return this.$store.getters['authoringCart/draftFor'](this.entity.type, this.entity.id)
    },

    staged() {
      return Boolean(this.entry)
    },

    drafted() {
      return Boolean(this.draft)
    },
  },

  watch: {
    // Leaving edit mode closes any form left open, so the site goes back to
    // being a site rather than keeping a form nobody can see the toggle for.
    editing(on) {
      if (!on) this.open = false
    },

    entry: {
      deep: true,
      immediate: true,
      handler: 'showStaged',
    },

    draft: {
      deep: true,
      handler: 'showStaged',
    },

    // A refetch replaces what was fetched, so the overlay goes on again.
    entity: {
      deep: true,
      handler: 'showStaged',
    },
  },

  mounted() {
    this.showStaged()
  },

  methods: {
    /**
     * Close the form, keeping whatever was typed into it.
     *
     * Not staging something is not the same as abandoning it, and a click on
     * "Done" reverting an afternoon's edits is the worst possible reading of
     * that word.
     */
    close() {
      const form = this.$refs.form
      if (form && typeof form.saveDraft === 'function') form.saveDraft()
      this.open = false
    },

    /**
     * Render what is staged and what is merely typed, not what the backend
     * last said.
     *
     * A staged edit that leaves the page looking unchanged is hard to trust:
     * the badge says something is different and nothing on the page is. The
     * site should read the way it will read once the change is merged.
     *
     * Sent back through `input` rather than written into the parent. Druxt
     * binds every wrapper it renders with `v-model`, so this is the supported
     * way to change what an entity shows, and it survives the wrapper being
     * re-rendered or replaced. `entity` stays as fetched, so discarding puts
     * the page back with no reload and nothing to remember.
     *
     * Deliberately view only. The form fetches separately and must keep
     * comparing against what the backend holds, or reverting a field would
     * compare the staged value against itself and never unstage it.
     */
    showStaged() {
      const next = JSON.parse(JSON.stringify(this.entity || {}))
      // Staged first, then the unstaged edit on top: a draft is the most recent
      // thing the author did, so it is what they expect to see.
      for (const layer of [this.entry, this.draft]) {
        if (!layer) continue
        next.attributes = { ...(next.attributes || {}), ...(layer.attributes || {}) }
        next.relationships = { ...(next.relationships || {}), ...(layer.relationships || {}) }
      }
      this.$emit('input', next)
    },
  },
}
</script>
