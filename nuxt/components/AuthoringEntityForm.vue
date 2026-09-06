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
import { changedFields, newResourceId } from '../lib/cart.mjs'

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

  data: () => ({ message: null, original: null, pendingFiles: {}, fileFields: [] }),

  computed: {
    /** A field bytes can be posted through, if this bundle has one. */
    uploadField() {
      return this.fileFields[0] || null
    },

    /** Whether the cart holds anything at all for this entity. */
    held() {
      const id = (this.original || {}).id
      if (!id) return false
      return Boolean(
        this.$store.getters['authoringCart/entryFor'](this.type, id) ||
          this.$store.getters['authoringCart/draftFor'](this.type, id)
      )
    },
  },

  watch: {
    /**
     * Something else emptied the cart of this entity.
     *
     * Only on the way from holding something to holding nothing. Staging is
     * also a change to what is held, and reverting on that would undo an edit
     * the moment it was staged.
     */
    held(now, before) {
      if (before && !now) this.revertToOriginal()
    },
  },


  methods: {
    /**
     * Put the form back to what the backend holds.
     *
     * Called when the cart stops holding anything for this entity, which is
     * what discarding from the drawer does. Without it the form kept showing
     * the discarded text, and the next keystroke wrote it straight back as a
     * new draft: the discard undid itself and nothing said so.
     *
     * No warning to confirm. The cart already holds everything the form has,
     * because every keystroke drafts into it, so there is nothing here that
     * discarding would lose that discarding was not meant to lose.
     */
    revertToOriginal() {
      const form = this.$refs.form
      if (!form || !form.model || !this.original) return
      this.pendingFiles = {}
      form.model = JSON.parse(JSON.stringify(this.original))
    },

    /**
     * A field changed, so the page should already show it.
     *
     * Typing is drafting: the page renders staged and unstaged edits alike, so
     * following the form is what makes a title appear as it is typed rather
     * than when it is staged. The row reads the draft through a computed, so
     * writing it here is the whole of the connection.
     *
     * Called by the field rather than watched from here, and not debounced.
     * Watching `$refs.form.model` never fired at all, and the 250ms delay it
     * carried was there on the grounds that this writes to storage, which it
     * does not: only staged entries are ever persisted.
     */
    onFieldInput() {
      this.saveDraft()
    },

    /**
     * Note that this bundle has a field files can be posted to.
     *
     * JSON:API has no route for creating a file on its own: every upload route
     * belongs to a field. An image put in the body is not going in a field at
     * all, so it is posted through one of these and never attached, which is
     * the only way in that JSON:API offers.
     *
     * Registered by the fields themselves as they render, because the form is
     * given a resource and not a schema, and so has no other way to know which
     * of its fields takes a file.
     */
    registerFileField(field) {
      if (field && !this.fileFields.includes(field)) this.fileFields.push(field)
    },

    /**
     * Hold bytes chosen for a field until there is somewhere to send them.
     *
     * Kept beside the change rather than uploaded on the spot, because editing
     * does not require a backend and choosing a picture should not be the one
     * thing that does. The upload happens when the cart is committed.
     */
    setPendingFile(field, chosen) {
      if (!chosen) {
        this.$delete(this.pendingFiles, field)
        return
      }
      this.$set(this.pendingFiles, field, {
        // A client-generated id, so the relationship can point at the file
        // before the file exists, the same way new content works.
        id: newResourceId(),
        name: chosen.file.name,
        type: chosen.file.type,
        size: chosen.file.size,
        dataUrl: chosen.dataUrl,
      })
    },

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
      // Bytes already staged for this entity, so reopening its form shows the
      // picture rather than a field pointing at an id nothing can resolve.
      const staged = this.$store.getters['authoringCart/entryFor'](
        this.type,
        (this.original || {}).id
      )
      this.pendingFiles = { ...((staged || {}).files || {}) }
      this.applyEdits()
    },

    /**
     * Put the edits already made back into the form.
     *
     * Staged first, then unstaged on top, the same order the page renders them
     * in. Without this, reopening a form shows the backend's values and an
     * author is quietly looking at the version they already changed.
     *
     * The snapshot stays as the backend had it, so the diff still measures the
     * whole change rather than what has happened since the form reopened.
     */
    applyEdits() {
      const form = this.$refs.form
      if (!form || !form.model) return

      const id = (this.original || {}).id
      const staged = this.$store.getters['authoringCart/entryFor'](this.type, id)
      const draft = this.$store.getters['authoringCart/draftFor'](this.type, id)

      for (const layer of [staged, draft]) {
        if (!layer) continue
        this.pendingFiles = { ...this.pendingFiles, ...(layer.files || {}) }
        form.model = {
          ...form.model,
          attributes: { ...(form.model.attributes || {}), ...(layer.attributes || {}) },
          relationships: { ...(form.model.relationships || {}), ...(layer.relationships || {}) },
        }
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
        files: this.pendingFiles,
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
        files: this.pendingFiles,
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
