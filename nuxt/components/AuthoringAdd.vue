<template>
  <div v-if="editing" class="authoring-add rounded border border-dashed border-hairline p-4">
    <p class="eyebrow mb-2">New</p>
    <div class="flex flex-wrap items-center gap-2">
      <label class="sr-only" :for="`add-${_uid}`">Type</label>
      <select
        :id="`add-${_uid}`"
        v-model="chosen"
        class="rounded border border-hairline bg-paper px-2 py-1.5 font-mono text-sm text-ink"
        data-testid="authoring-add-type"
      >
        <option v-for="t in types" :key="t.type" :value="t.type">{{ t.label }}</option>
      </select>
      <button
        type="button"
        class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90"
        data-testid="authoring-add"
        @click="add"
      >
        Add
      </button>
      <p v-if="message" class="basis-full text-sm text-muted" data-testid="authoring-add-message">
        {{ message }}
      </p>
    </div>

    <!-- The new thing's form, in place, as soon as it is staged. -->
    <div v-if="staged" class="mt-4 rounded border border-accent p-4">
      <p class="eyebrow mb-3">Editing new {{ staged.type }}</p>
      <!--
        Given the staged resource rather than left to fetch one. Its id is
        client-generated, so the backend answers 404 and the form comes up with
        no fields on it.
      -->
      <AuthoringEntityForm
        ref="form"
        :type="staged.type"
        :uuid="staged.id"
        :value="blank"
        @staged="onStaged"
      />
      <!--
        Starting something is not committing to finishing it. Without this the
        only way out of a new article was to commit it or to find it in the
        drawer and work out which staged resource it was.
      -->
      <div class="mt-3 flex gap-2">
        <!--
          Closing is not abandoning. Without this the only ways out of a new
          article were to throw it away or to leave the form open forever.
        -->
        <button
          type="button"
          class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
          data-testid="authoring-add-done"
          @click="done"
        >
          Done
        </button>
        <button
          type="button"
          class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-accent hover:text-accent"
          data-testid="authoring-add-cancel"
          @click="cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * Create content that does not exist yet.
 *
 * Staged rather than created: a new entity gets a client-generated id and sits
 * in the cart until it is committed, at which point it is POSTed rather than
 * PATCHed. That means new content can be written with no backend connected,
 * same as an edit, and reviewed as part of the same change request.
 *
 * The type list is deliberately a prop with a small default rather than
 * discovered from the backend: discovery needs a reachable backend, and needing
 * one to start writing would defeat the point.
 */
export default {
  name: 'AuthoringAdd',

  props: {
    types: {
      type: Array,
      default: () => [
        { type: 'node--article', label: 'Article' },
        { type: 'node--page', label: 'Page' },
      ],
    },
  },

  data() {
    return {
      chosen: this.types[0] && this.types[0].type,
      message: null,
      stagedId: null,
      // The resource the form edits. Data, not computed: see `add()`.
      blank: null,
    }
  },

  computed: {

    editing() {
      return this.$store.getters['authoringCart/editing']
    },
    staged() {
      if (!this.stagedId) return null
      return this.$store.getters['authoringCart/resources'].find((r) => r.id === this.stagedId)
    },
  },

  methods: {
    async add() {
      this.stagedId = await this.$store.dispatch('authoringCart/stageNew', {
        type: this.chosen,
        // Empty rather than invented: the form is where it gets filled in, and
        // a placeholder title would be indistinguishable from one somebody meant.
        attributes: {},
      })
      // Built once, and never again. As a computed it changed identity every
      // time the cart did, and Druxt syncs a form's model from its `value`
      // prop, so creating a tag mid-form silently wiped everything typed.
      this.blank = {
        type: this.chosen,
        id: this.stagedId,
        attributes: {},
        relationships: {},
      }
      this.message = 'Staged as new. Fill it in below; nothing is sent yet.'
      this.$emit('added', this.stagedId)
    },

    onStaged() {
      this.message = 'Saved to the cart. Commit it when a backend is connected.'
    },

    /**
     * Close the form, keeping the new content and what was typed into it.
     *
     * Staged rather than left unstaged, unlike Done on an existing entity. The
     * new thing is already in the cart, put there by Add, so leaving its fields
     * unstaged would show one item twice: an empty shell under Staged and its
     * contents under Unstaged, for one article the author wrote once.
     */
    async done() {
      const form = this.$refs.form
      if (form && typeof form.stage === 'function') await form.stage()
      this.stagedId = null
      this.blank = null
      this.message = 'Staged. Find it in the drawer.'
    },

    /**
     * Abandon content that was started and not wanted.
     *
     * The staged resource goes with it. Leaving it behind would put a nameless
     * article in the drawer, and the author would have to work out which of the
     * staged resources was the one they had already decided against.
     */
    cancel() {
      this.$store.dispatch('authoringCart/discardOne', {
        type: this.staged.type,
        id: this.staged.id,
      })
      this.stagedId = null
      this.blank = null
      this.message = null
    },
  },
}
</script>
