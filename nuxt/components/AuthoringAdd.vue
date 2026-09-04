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
      <AuthoringEntityForm :type="staged.type" :uuid="staged.id" @staged="onStaged" />
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
    return { chosen: this.types[0] && this.types[0].type, message: null, stagedId: null }
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
      this.message = 'Staged as new. Fill it in below; nothing is sent yet.'
      this.$emit('added', this.stagedId)
    },

    onStaged() {
      this.message = 'Saved to the cart. Commit it when a backend is connected.'
    },
  },
}
</script>
