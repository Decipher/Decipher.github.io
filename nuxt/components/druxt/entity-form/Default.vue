<template>
  <div class="authoring-entity-form-fields">
    <div v-for="id of contentFields" :key="id" class="authoring-entity-form-field">
      <slot :name="id" />
    </div>

    <!--
      Closed by default. These are the settings around a piece of content
      rather than the content, and an author writing something should not have
      to scroll past the publishing flags to reach the body.
    -->
    <details v-if="advancedFields.length" class="mb-5 rounded border border-hairline">
      <summary
        class="cursor-pointer px-3 py-2 font-mono text-xs uppercase tracking-eyebrow text-muted hover:text-accent"
        data-testid="authoring-advanced"
      >
        Advanced
      </summary>
      <div class="border-t border-hairline px-3 pt-4">
        <div v-for="id of advancedFields" :key="id" class="authoring-entity-form-field">
          <slot :name="id" />
        </div>
      </div>
    </details>

    <!-- The authoring buttons, when this form is inside the authoring UI. -->
    <div v-if="form" class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90"
        data-testid="authoring-stage"
        @click="form.stage()"
      >
        Stage change
      </button>
      <button
        type="button"
        class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
        data-testid="authoring-reset"
        @click="form.reset()"
      >
        Reset
      </button>
      <p
        v-if="form.message"
        class="basis-full text-sm text-muted"
        data-testid="authoring-stage-message"
      >
        {{ form.message }}
      </p>
    </div>

    <!-- Used outside the authoring UI, it keeps Druxt's own submit and reset. -->
    <slot v-else name="buttons" />
  </div>
</template>

<script>
/**
 * The theme component for every entity form.
 *
 * This exists to replace the form's buttons. Druxt generates a `buttons` slot
 * whose submit writes straight to the backend, and a `<template #buttons>` on
 * the parent does not override it: DruxtModule passes only the `default` slot
 * through from the parent and builds every other slot itself. So the override
 * has to happen in the wrapper Druxt renders, which is this.
 *
 * That matters beyond tidiness. Staging into the cart is what lets an author
 * edit with no backend connected, and a Save button next to it that bypasses
 * the cart and writes immediately is a trap rather than a shortcut.
 *
 * The staging itself stays in `AuthoringEntityForm`, reached through inject
 * because Druxt gives the wrapper no way to emit back to the parent.
 */
import { groupFields } from '../../../lib/form-groups.mjs'

export default {
  name: 'DruxtEntityFormDefault',

  inject: {
    // `this` of AuthoringEntityForm, so `message` stays reactive. Optional:
    // a form rendered outside the authoring UI has nothing to inject.
    form: { from: 'authoringForm', default: null },
  },

  props: {
    entity: { type: Object, default: () => ({}) },
    fields: { type: Object, default: () => ({}) },
    schema: { type: Object, default: () => ({}) },
  },

  created() {
    // The first render is the only moment the fetched values are untouched.
    if (this.form && this.form.captureOriginal) this.form.captureOriginal(this.entity)
  },

  computed: {
    /** Field order comes from the schema, which Drupal already sorted by weight. */
    fieldIds() {
      const fromSchema = (this.schema.fields || []).map((field) => field.id).filter(Boolean)
      return fromSchema.length ? fromSchema : Object.keys(this.fields)
    },

    contentFields() {
      return groupFields(this.fieldIds).content
    },

    advancedFields() {
      return groupFields(this.fieldIds).advanced
    },
  },
}
</script>
