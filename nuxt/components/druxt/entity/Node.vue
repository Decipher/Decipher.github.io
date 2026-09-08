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
          {{ deleted ? (drafted ? 'Delete, unstaged' : 'Deleting') : drafted ? 'Unstaged' : 'Staged' }}
        </span>
        <span v-else aria-hidden="true"></span>

        <button
          v-if="!deleted"
          type="button"
          class="authoring-edit ml-auto rounded border border-hairline bg-surface px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted opacity-0 transition-opacity hover:border-accent hover:text-accent focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          :data-testid="`edit-${entity.type}-${entity.id}`"
          @click="open = true"
        >
          Edit
        </button>
        <button
          v-if="!deleted"
          type="button"
          class="authoring-edit rounded border border-hairline bg-surface px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted opacity-0 transition-opacity hover:border-accent hover:text-accent focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          :data-testid="`delete-${entity.type}-${entity.id}`"
          @click="remove"
        >
          Delete
        </button>
        <button
          v-else
          type="button"
          class="rounded border border-accent px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-accent"
          :data-testid="`undelete-${entity.type}-${entity.id}`"
          @click="keep"
        >
          Keep it
        </button>
      </div>

      <!-- Struck through rather than hidden: it is still here until committed. -->
      <div :class="{ 'opacity-50 line-through': deleted }">
        <!--
          The label, which Drupal renders from the node template rather than as
          a field, so it is not in the view display and Druxt never renders it.
          A listing of articles with no titles is not a listing, and an author
          editing a title could not see it change.
        -->
        <h2
          v-if="showLabel"
          class="mb-2 text-lg"
          data-authoring-field="title"
          data-testid="entity-label"
        >
          <!--
            A teaser with no way through to the thing it is teasing is a dead
            end. On the full view there is nowhere to go, so it stays plain.
          -->
          <NuxtLink v-if="path" :to="path" data-testid="entity-link">{{ label }}</NuxtLink>
          <template v-else>{{ label }}</template>
        </h2>
        <slot />
      </div>
    </div>

    <!--
      Its form, in the place the content was.

      Pinned and no taller than the room left under the site's own pinned
      bands, with the fields scrolling inside it. It used to be an ordinary
      block in the flow, so a long article's form ran thousands of pixels down
      the page and the way out was at the bottom of it: opening an editor meant
      scrolling to the end of it to close it again.

      `--sticky-top` is published by the layout, which measures the header and
      the breadcrumb bar. The number differs by page, so it cannot be written
      down here.
    -->
    <div
      v-else
      class="authoring-panel sticky flex flex-col overflow-hidden rounded border border-accent"
      data-testid="authoring-panel"
    >
      <!-- Always in view: what is being edited, how to look at it, the way out. -->
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-elevated px-4 py-2"
      >
        <p class="eyebrow">Editing {{ entity.type }}</p>

        <!--
          Form or rendered result, without leaving the panel or staging first.
          Previewing used to mean staging the change and opening a modal, which
          is a lot of ceremony for "what will this look like".
        -->
        <label class="ml-auto flex items-center gap-2">
          <span class="sr-only">Editing view</span>
          <select v-model="view" class="authoring-select" data-testid="authoring-view">
            <option value="form">Edit</option>
            <optgroup label="Preview">
              <option v-for="name of modeOptions" :key="name" :value="name">{{ name }}</option>
            </optgroup>
          </select>
        </label>

        <button
          type="button"
          class="rounded border border-hairline px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted hover:border-accent hover:text-accent"
          data-testid="authoring-editable-close"
          @click="close"
        >
          Done
        </button>
      </div>

      <!-- The only part that scrolls, so the header and the buttons stay put. -->
      <div class="authoring-panel-body flex-1 overflow-y-auto px-4 py-4">
        <AuthoringEntityForm
          v-if="view === 'form'"
          ref="form"
          :type="entity.type"
          :uuid="entity.id"
          :mode="mode"
        />
        <!--
          The same components the page uses, rendering what has been typed. The
          field wrappers already overlay a draft, so this needs no special path:
          it is the site rendering itself.
        -->
        <AuthoringPreviewScope v-else>
          <DruxtEntity
            :key="`preview-${previewMode}`"
            :type="entity.type"
            :uuid="entity.id"
            :mode="previewMode"
          />
        </AuthoringPreviewScope>
      </div>
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
import { labelFieldFor } from '../../../ice/src/reference.mjs'
import { viewModesFor } from '../../../ice/src/view-modes.mjs'

export default {
  name: 'DruxtEntityNode',

  /**
   * Whether something is rendering this in place of a page.
   *
   * Injected rather than passed, because the component that knows is the
   * preview and what sits between them is Druxt's own resolution.
   */
  inject: {
    druxtPreview: { default: false },
  },

  /**
   * Fetch this bundle's display modes when the panel is opened.
   *
   * Not up front: it is one request per entity on the page otherwise, for a
   * list most of them will never show.
   */
  watch: {
    async open(now) {
      if (!now || this.viewModes) return
      // Drupal's answer if there is a backend to ask, and the build's copy if
      // not, because editing works without one and a lone "default" is not a
      // choice. See `configuredViewModes` in nuxt.config.js.
      const live = await viewModesFor(this.$druxt, this.entity.type)
      this.viewModes = live.length > 1 ? live : this.bakedViewModes
    },
  },

  props: {
    entity: { type: Object, default: () => ({}) },
    fields: { type: Object, default: () => ({}) },
    schema: { type: Object, default: () => ({}) },
  },

  data: () => ({
    open: false,
    /** Whether the panel is showing the fields or the result of them. */
    view: 'form',
    /** Display modes this bundle has, which is however many it has. */
    viewModes: null,
  }),

  /**
   * What the panel can show.
   *
   * The form, and then the view modes worth looking at while writing. Not every
   * mode Drupal has: a listing of them is a settings screen, and this is a
   * toggle above a field you are typing in.
   */
  computed: {
    editing() {
      return this.$store.getters['authoringCart/editing']
    },

    /**
     * Only a saved entity: a form needs something to fetch and to stage against.
     *
     * And never inside a preview. An entity carries its own edit control, which
     * is what makes edit mode apply to the whole site; inside a rendering of an
     * entity it offered a form within the form, and the preview in that one
     * offered it again, as deep as anyone cared to click.
     */
    editable() {
      if (this.druxtPreview) return false
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

    /**
     * Where this entity lives on the site, when it is being summarised.
     *
     * The alias if it has one, and Drupal's own internal path if it does not,
     * which is what Drupal falls back to as well.
     */
    path() {
      if (this.mode === 'default' || this.mode === 'full') return null
      const attributes = this.merged.attributes || {}
      const alias = ((attributes.path || {}).alias || '').trim()
      if (alias) return alias
      const nid = attributes.drupal_internal__nid
      return nid ? `/node/${nid}` : null
    },

    /**
     * Whether to draw the entity's own title.
     *
     * Druxt renders fields, and a node's title is not one, so a teaser with no
     * title is a card with no name on it. But the full view of a node is a page,
     * and Drupal already puts the title on a page: the breadcrumb names it, and
     * the Page title block in the content_above region prints it. Drawing it
     * again here made three of them, one under another.
     *
     * The preview is the exception. It renders the entity on its own, with none
     * of the page around it, so the block that would have printed the title is
     * not there and an author previewing a retitle saw it change nowhere.
     *
     * Also skipped when the display does render the title as a field, which
     * some do, because then Druxt is already drawing it.
     */
    showLabel() {
      if (!this.label) return false
      const page = this.mode === 'default' || this.mode === 'full'
      if (page && !this.druxtPreview) return false
      return !Object.keys(this.fields || {}).includes(this.labelField)
    },

    /** What the build read out of Drupal's committed display configuration. */
    bakedViewModes() {
      const all = ((this.$config || {}).authoring || {}).viewModes || {}
      return all[this.entity.type] || ['default']
    },

    /** The modes to offer, which is whichever list was found. */
    modeOptions() {
      return this.viewModes || this.bakedViewModes
    },

    /** The view mode to render when the toggle is not on the form. */
    previewMode() {
      return this.view === 'form' ? this.mode : this.view
    },

    staged() {
      return Boolean(this.entry)
    },

    drafted() {
      return Boolean(this.draft)
    },

    /** Staged for removal, or marked for it and not staged. */
    deleted() {
      return Boolean((this.entry || {}).deleted || (this.draft || {}).deleted)
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
     * Stage the removal of this, rather than removing it.
     *
     * Reviewable and reversible like every other change. A deletion committed
     * on the spot is the one edit a pull request cannot get back.
     */
    remove() {
      this.open = false
      this.$store.dispatch('authoringCart/stageDeletion', {
        type: this.entity.type,
        id: this.entity.id,
      })
    },

    keep() {
      this.$store.dispatch('authoringCart/discardOne', {
        type: this.entity.type,
        id: this.entity.id,
      })
    },

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
/*
 * Briefly marked when the drawer points at it, so "Show" lands somewhere.
 *
 * Dashed, and on the field rather than the whole node wherever the field can be
 * found: outlining an entire article to say "the image changed" is pointing at
 * the room rather than the thing in it.
 */
.is-revealed {
  outline: 2px dashed rgb(var(--c-accent));
  outline-offset: 3px;
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
