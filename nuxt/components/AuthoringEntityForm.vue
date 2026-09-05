<template>
  <div class="authoring-entity-form">
    <DruxtEntityForm
      ref="form"
      :type="type"
      :uuid="uuid"
      :mode="mode"
      :value="value"
      @error="onError"
    />
  </div>
</template>

<script>
import { changedFields } from '../lib/cart.mjs'

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
    /**
     * A resource to edit instead of fetching one.
     *
     * Content that has only been staged has an id the backend has never seen,
     * so fetching it is a 404 and the form renders no fields at all: an author
     * gets an empty box and a Stage button that reports nothing changed.
     * Druxt skips its fetch when given a value, which is exactly what a create
     * form needs.
     */
    value: { type: Object, default: undefined },
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
      this.applyDraft()
    },

    /**
     * Put an unstaged edit back into the form.
     *
     * The snapshot stays as the backend had it, so the diff still measures the
     * whole change rather than what has happened since the form reopened.
     */
    applyDraft() {
      const form = this.$refs.form
      const draft = this.$store.getters['authoringCart/draftFor'](
        this.type,
        (this.original || {}).id
      )
      if (!form || !form.model || !draft) return
      form.model = {
        ...form.model,
        attributes: { ...(form.model.attributes || {}), ...(draft.attributes || {}) },
        relationships: { ...(form.model.relationships || {}), ...(draft.relationships || {}) },
      }
    },

    /**
     * What the author has changed beyond what is already staged.
     *
     * Measured against the staged version, not against the backend. Against the
     * backend, everything just staged still counts as changed, so closing the
     * form right after staging would file the same edit again as unstaged and
     * the badge would flip straight back.
     */
    unstagedDelta() {
      const form = this.$refs.form
      if (!form || !form.model || !this.original) return null

      const staged = this.$store.getters['authoringCart/entryFor'](
        this.type,
        (form.model || {}).id
      )
      const baseline = {
        attributes: {
          ...((this.original || {}).attributes || {}),
          ...((staged || {}).attributes || {}),
        },
        relationships: {
          ...((this.original || {}).relationships || {}),
          ...((staged || {}).relationships || {}),
        },
      }

      return {
        attributes: changedFields(baseline.attributes, form.model.attributes || {}),
        relationships: this.changedRelationships(form, baseline.relationships),
      }
    },

    /**
     * Keep an edit the author has not staged.
     *
     * Closing the form is not a decision to throw the work away, and silently
     * reverting it is the worst reading of a click on "Done".
     */
    saveDraft() {
      const delta = this.unstagedDelta()
      if (!delta) return
      this.$store.dispatch('authoringCart/saveDraft', {
        type: this.type,
        id: (this.$refs.form.model || {}).id,
        ...delta,
      })
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
        // Every relationship the form holds, changed or not. The action needs
        // it to tell "put back the way it was" apart from "not on this form".
        allRelationships: (form.model || {}).relationships || {},
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
    changedRelationships(form, against) {
      const original = against || (this.original || {}).relationships || {}
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
