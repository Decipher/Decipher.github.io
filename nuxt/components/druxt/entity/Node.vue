<template>
  <div
    class="authoring-entity"
    :class="{ 'is-staged': staged, group: editable }"
    :data-authoring-entity="`${entity.type}:${entity.id}`"
  >
    <!-- The entity as the site renders it, edit mode or not. -->
    <div v-if="!open">
      <!--
        A bar of its own, above the content rather than over it. Overlaying
        these on the corners put them on top of the first line of whatever was
        being edited, which is the line most worth being able to read.

        Only in edit mode, so a visitor's page is not reshaped by controls they
        will never see.
      -->
      <div
        v-if="editable"
        class="mb-2 flex items-baseline justify-between gap-3"
      >
        <!--
          Two states worth telling apart. Staged is going to be sent; unstaged
          is an edit the author has made and not committed to, which the page
          shows so it is neither invisible nor lost.
        -->
        <span
          v-if="staged || drafted"
          class="rounded px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow"
          :class="drafted ? 'border border-accent text-accent' : 'bg-accent text-accent-contrast'"
          :data-testid="drafted ? 'unstaged-badge' : 'staged-badge'"
        >
          {{ drafted ? 'Unstaged' : 'Staged' }}
        </span>
        <span v-else aria-hidden="true"></span>

        <button
          type="button"
          class="authoring-edit rounded border border-hairline bg-surface px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted opacity-0 transition-opacity hover:border-accent hover:text-accent focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          :data-testid="`edit-${entity.type}-${entity.id}`"
          @click="open = true"
        >
          Edit
        </button>
      </div>

      <!--
        The label, which Drupal renders from the node template rather than as a
        field, so it is not in the view display and Druxt never renders it. A
        listing of articles with no titles is not a listing, and an author
        editing a title could not see it change.
      -->
      <h2 v-if="showLabel" class="mb-2 text-lg" data-testid="entity-label">{{ label }}</h2>

      <slot />
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
import { labelFieldFor } from '../../../lib/reference.mjs'

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

    /**
     * The entity as it should read: what the backend holds, then what is
     * staged, then what has been typed and not staged.
     *
     * `entity` is what was fetched and stays that way, which is what makes
     * discarding a change put the page back with no reload.
     */
    merged() {
      const next = JSON.parse(JSON.stringify(this.entity || {}))
      for (const layer of [this.entry, this.draft]) {
        if (!layer) continue
        next.attributes = { ...(next.attributes || {}), ...(layer.attributes || {}) }
        next.relationships = { ...(next.relationships || {}), ...(layer.relationships || {}) }
      }
      return next
    },

    labelField() {
      return labelFieldFor(String((this.entity || {}).type || '').split('--')[0])
    },

    label() {
      return (this.merged.attributes || {})[this.labelField] || ''
    },

    /** Only when the display does not already have a field for it. */
    showLabel() {
      return Boolean(this.label) && !Object.keys(this.fields || {}).includes(this.labelField)
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
      this.$emit('input', this.merged)
    },
  },
}
</script>

<style>
/* Briefly marked when the drawer points at it, so "Show" lands somewhere. */
.authoring-entity.is-revealed {
  outline: 2px solid rgb(var(--c-accent));
  outline-offset: 4px;
}

/*
 * A pointer that cannot hover has no way to reveal a hover-only control, so on
 * a touch screen the Edit control is simply there. Written as a media query
 * rather than a utility class because Tailwind 2 has no `hover: none` variant,
 * and a control nobody on a phone can reach is not a style question.
 */
@media (hover: none) {
  .authoring-entity .authoring-edit {
    opacity: 1;
  }
}
</style>
