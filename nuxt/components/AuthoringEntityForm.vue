<template>
  <div class="authoring-entity-form">
    <DruxtEntityForm ref="form" :type="type" :uuid="uuid" :mode="mode" @error="onError" />
  </div>
</template>

<script>
export default {
  name: 'AuthoringEntityForm',

  /**
   * Reach the staging methods from inside the form.
   *
   * `DruxtEntityFormDefault` renders the buttons, because Druxt will not take a
   * `buttons` slot from here, and Druxt gives that wrapper no way to emit back.
   * `this` rather than a plain object, so `message` stays reactive.
   */
  provide() {
    return { authoringForm: this }
  },

  props: {
    type: { type: String, required: true },
    uuid: { type: String, required: true },
    mode: { type: String, default: 'default' },
  },

  data: () => ({ message: null, original: null }),

  methods: {
    /**
     * Keep what the form fetched, before anything is typed into it.
     *
     * DruxtEntityForm has no pristine copy to diff against: its `entity` is a
     * computed spread of `model`, so it tracks every edit and comparing the two
     * always says nothing changed. The wrapper hands this the entity as first
     * rendered, which is the last moment the fetched values are still intact.
     */
    captureOriginal(entity) {
      this.original = JSON.parse(JSON.stringify(entity || {}))
    },

    /**
     * Stage the difference between the entity as loaded and as edited.
     *
     * The comparison is against the snapshot taken when the form loaded, so
     * only fields the author touched are staged. Sending the whole model would
     * overwrite anything changed elsewhere since.
     */
    async stage() {
      const form = this.$refs.form
      if (!form || !form.model || !this.original) {
        this.message = 'The form has not finished loading.'
        return
      }

      const staged = await this.$store.dispatch('authoringCart/stage', {
        type: this.type,
        id: form.model.id,
        original: (this.original || {}).attributes || {},
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
      const original = (this.original || {}).relationships || {}
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
      // DruxtEntityForm's own reset sets the model back to `entity`, which is
      // the model, so it does nothing. Restore the snapshot instead.
      if (form && this.original) form.model = JSON.parse(JSON.stringify(this.original))
      this.message = null
    },

    onError(error) {
      this.message = `The backend reported: ${error && error.message ? error.message : error}`
    },
  },
}
</script>
