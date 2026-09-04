<template>
  <div class="authoring-entity-form">
    <DruxtEntityForm ref="form" :type="type" :uuid="uuid" :mode="mode" @error="onError">
      <!--
        Replace the form's own buttons. DruxtEntityForm wires its submit
        straight to `$druxt.updateResource`, which needs a reachable backend and
        writes immediately. Staging instead is the whole point: an author can
        edit with nothing behind the site, and what they staged is committed
        later, or turned into a change request without a backend at all.
      -->
      <template #buttons>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90"
            data-testid="authoring-stage"
            @click="stage"
          >
            Stage change
          </button>
          <button
            type="button"
            class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
            data-testid="authoring-reset"
            @click="reset"
          >
            Reset
          </button>
          <p v-if="message" class="basis-full text-sm text-muted" data-testid="authoring-stage-message">
            {{ message }}
          </p>
        </div>
      </template>
    </DruxtEntityForm>
  </div>
</template>

<script>
export default {
  name: 'AuthoringEntityForm',

  props: {
    type: { type: String, required: true },
    uuid: { type: String, required: true },
    mode: { type: String, default: 'default' },
  },

  data: () => ({ message: null }),

  methods: {
    /**
     * Stage the difference between the entity as loaded and as edited.
     *
     * The comparison is against `entity`, the form's own copy of what it
     * fetched, so only fields the author touched are staged. Sending the whole
     * model would overwrite anything changed elsewhere since the form loaded.
     */
    async stage() {
      const form = this.$refs.form
      if (!form || !form.model) {
        this.message = 'The form has not finished loading.'
        return
      }

      const staged = await this.$store.dispatch('authoringCart/stage', {
        type: this.type,
        id: form.model.id,
        original: (form.entity || {}).attributes || {},
        edited: form.model.attributes || {},
        relationships: this.changedRelationships(form),
      })

      this.message = staged
        ? 'Staged. Nothing has been sent yet.'
        : 'Nothing changed, so nothing was staged.'
      this.$emit('staged', staged)
    },

    /**
     * Relationships the author changed.
     *
     * Compared whole rather than field by field: a relationship's value is its
     * `data`, and a partial merge of one would produce a reference list that
     * never existed.
     */
    changedRelationships(form) {
      const original = (form.entity || {}).relationships || {}
      const edited = (form.model || {}).relationships || {}
      const changed = {}
      for (const [field, value] of Object.entries(edited)) {
        if (JSON.stringify(original[field]) !== JSON.stringify(value)) {
          changed[field] = value
        }
      }
      return changed
    },

    reset() {
      const form = this.$refs.form
      if (form && typeof form.onReset === 'function') form.onReset()
      this.message = null
    },

    onError(error) {
      this.message = `The backend reported: ${error && error.message ? error.message : error}`
    },
  },
}
</script>
