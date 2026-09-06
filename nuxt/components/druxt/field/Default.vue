<template>
  <div class="authoring-field" :data-authoring-field="schema.id">
    <!-- ===== View displays ===== -->
    <template v-if="isSchemaView">
      <div v-if="relationship">
        <DruxtEntity
          v-for="{ type, id } of relationships"
          :key="id"
          v-bind="{ type, uuid: id }"
        />
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-else ref="prose" class="prose-body" v-html="rewritten" />
    </template>

    <!-- ===== Form displays ===== -->
    <div v-else class="mb-5">
      <label class="block" :for="fieldId">
        <span class="eyebrow mb-1.5 block">
          {{ label }}
          <span v-if="schema.required" class="text-accent" aria-hidden="true">*</span>
        </span>
      </label>

      <!--
        A reference is chosen, not authored. Drupal's widget here is an
        autocomplete over the target entities, so this is one too, rather than a
        nested form that would invite editing the referenced thing by accident.
      -->
      <AuthoringReference
        v-if="isTypeReference"
        :value="model"
        :schema="schema"
        :multiple="isMultiple"
        @input="model = $event"
      />

      <!-- A picture is chosen from a disk, not searched for by filename. -->
      <AuthoringImage
        v-else-if="isTypeImage"
        :value="model || { data: null }"
        :schema="schema"
        :pending-file="pendingFile"
        @input="model = $event"
        @file="onFile"
      />

      <!--
        Every other relationship. A media item is a relationship too, and
        choosing one is a library rather than a text search, so those keep
        Druxt's nested form until there is a widget for them.
      -->
      <div v-else-if="relationship" class="rounded border border-hairline p-3">
        <DruxtEntityForm
          v-for="{ type, id } of relationships"
          :key="id"
          v-bind="{ type, uuid: id }"
        />
        <p v-if="!relationships.length" class="text-sm text-muted">Nothing referenced yet.</p>
      </div>

      <!-- A moment in time, not a string to be typed -->
      <input
        v-else-if="isTypeDate"
        :id="fieldId"
        v-model="dateValue"
        type="datetime-local"
        :class="controlClass"
        data-testid="field-date"
      />

      <!-- URL alias -->
      <AuthoringPath
        v-else-if="isTypePath"
        :value="model || {}"
        @input="model = $event"
      />

      <!-- Boolean -->
      <label v-else-if="isTypeCheckbox" class="flex items-center gap-2">
        <input
          :id="fieldId"
          v-model="model"
          type="checkbox"
          class="h-4 w-4 rounded border-hairline text-accent focus:ring-accent"
        />
        <span class="text-sm text-body">{{ label }}</span>
      </label>

      <!-- Rich text -->
      <AuthoringWysiwyg
        v-else-if="isTypeWysiwyg"
        v-model="richText"
        :format="richTextFormat"
        :upload="uploadTarget"
      />

      <!-- Select -->
      <select
        v-else-if="isTypeSelect"
        :id="fieldId"
        v-model="model"
        :class="controlClass"
        data-testid="field-select"
      >
        <option v-for="(text, key) of selectOptions" :key="key" :value="key">{{ text }}</option>
      </select>

      <!-- Single-value input -->
      <input
        v-else-if="isTypeInput && !isMultiple"
        :id="fieldId"
        v-model="model"
        :type="inputType"
        :placeholder="placeholder"
        :required="schema.required || false"
        :class="controlClass"
        data-testid="field-input"
      />

      <!-- Multi-value input, reorderable -->
      <Draggable
        v-else-if="isTypeInput && isMultiple"
        v-model="model"
        handle=".authoring-grip"
        ghost-class="opacity-40"
      >
        <div v-for="(item, key) of model" :key="key" class="mb-2 flex items-center gap-2">
          <span
            class="authoring-grip cursor-grab select-none px-1 font-mono text-muted"
            aria-hidden="true"
            title="Drag to reorder"
            >⠿</span
          >
          <input
            v-model="model[key]"
            :type="inputType"
            :placeholder="placeholder"
            :class="controlClass"
            data-testid="field-input"
          />
          <button
            type="button"
            class="rounded border border-hairline px-2 py-1 text-sm text-muted hover:border-accent hover:text-accent"
            :aria-label="`Remove ${label} ${key + 1}`"
            @click="model = model.filter((_, i) => i !== key)"
          >
            ×
          </button>
        </div>
        <template #footer>
          <button
            type="button"
            class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
            data-testid="field-add-another"
            @click="model = [...model, '']"
          >
            Add another
          </button>
        </template>
      </Draggable>

      <!-- Anything else -->
      <textarea
        v-else
        :id="fieldId"
        v-model="model"
        :rows="rows"
        :placeholder="placeholder"
        :class="controlClass"
        data-testid="field-textarea"
      />

      <p v-if="schema.description" class="mt-1.5 text-sm text-muted">{{ schema.description }}</p>
      <p v-if="errorText" class="mt-1.5 text-sm text-accent" data-testid="field-error">
        {{ errorText }}
      </p>
    </div>
  </div>
</template>

<script>
/**
 * Every Druxt field, themed, and readable or editable.
 *
 * Druxt resolves a field to the most specific component it can find and falls
 * back here. Putting the whole dispatch in the fallback rather than in
 * per-type components is deliberate: the specific names depend on the field
 * type and its widget, so a component named for a guess at that never renders,
 * and the field silently falls through to Druxt's own unthemed default. Which
 * is exactly what happened before this.
 *
 * `schema.config.schemaType` decides read or edit, so the same component serves
 * a rendered page and a form, and the site's theming applies to both.
 *
 * Ported from `druxt/umami.demo.druxtjs.org@feature/239-editbar`, which is the
 * BootstrapVue version of this.
 */
import { DruxtEntity, DruxtFieldMixin } from 'druxt-entity'
import Draggable from 'vuedraggable'

import { fromDateInput, toDateInput } from '../../../lib/datetime.mjs'
import { rewriteFileUrls } from '../../../lib/files.mjs'
import { addCopyButtons, markZoomable } from '../../../lib/prose.mjs'
import { isTrimmed, teaserHtml } from '../../../lib/teaser.mjs'

export default {
  components: { Draggable, DruxtEntity },

  mixins: [DruxtFieldMixin],

  inject: {
    /**
     * The form this field is on, or nothing when it is rendered outside one.
     *
     * Injected rather than emitted to. Druxt builds each field's slot itself,
     * so a field is not a child of anything that would hear an event: the same
     * reason the form's buttons live in a wrapper component.
     */
    authoringForm: { from: 'authoringForm', default: null },
  },

  mounted() {
    // An image field is a route bytes can be posted to, which is what an image
    // in the body needs. The form collects them; only it can see them all.
    if (this.isTypeImage && this.authoringForm) {
      this.authoringForm.registerFileField(this.schema.id)
    }
    this.enhanceProse()
  },

  updated() {
    // The field re-renders whenever the cart changes, and `v-html` replaces the
    // markup wholesale each time, taking the listeners with it.
    this.enhanceProse()
  },

  created() {
    // Tell the form on every keystroke, rather than leaving it to notice.
    //
    // The form used to watch `$refs.form.model` instead. `$refs` is not
    // reactive, so the first evaluation ran before Druxt had built the form,
    // registered no dependency on anything, and the watcher never fired again:
    // what was typed reached the page only when something else happened to
    // provoke a re-render. A field's own `model` is reactive data, and the
    // field is where the typing actually lands.
    //
    // Deep, because a field's value is often an object the widget mutates in
    // place rather than replaces.
    if (!this.authoringForm || !this.authoringForm.onFieldInput) return
    this.$watch('model', () => this.authoringForm.onFieldInput(), { deep: true })
  },

  methods: {
    /**
     * Attach what rendered HTML cannot carry.
     *
     * A body field is markup from Drupal put in with `v-html`, so nothing in it
     * is a component and nothing in it can hold a Vue handler.
     */
    enhanceProse() {
      const root = this.$refs.prose
      if (!root) return
      addCopyButtons(root)
      for (const image of markZoomable(root)) {
        if (image.dataset.zoomBound) continue
        image.dataset.zoomBound = '1'
        image.addEventListener('click', () => this.$emit('zoom', image.src))
      }
    },

    onFile(chosen) {
      if (this.authoringForm) this.authoringForm.setPendingFile(this.schema.id, chosen)
    },
  },

  computed: {
    /**
     * The rendered field, pointing at images the deployed site actually has.
     *
     * Drupal writes its own file URLs into body HTML, and those are served by
     * Drupal. The build copies the files Tome exported into the static output
     * and this points the markup at the copies, so a picture inserted through
     * CKEditor survives the backend being switched off.
     */
    rewritten() {
      return rewriteFileUrls(this.html)
    },

    /** Shared control styling, so every input looks like the same site. */
    controlClass() {
      return 'w-full rounded border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none'
    },

    fieldId() {
      return `field-${this.schema.id}`
    },

    /** One size fits all rendering for view displays. */
    html() {
      const model = this.model
      // The display's formatter, honoured here because that is the theme's job:
      // Druxt hands over the schema and its settings, and what to do with them
      // is a decision for whoever is rendering. Without this a front page of
      // teasers renders whole articles.
      if (isTrimmed(this.schema.type)) {
        return teaserHtml(model, {
          trimLength: ((this.schema.settings || {}).display || {}).trim_length,
        })
      }
      if (typeof model === 'string') return model
      return (model || {}).processed || (model || {}).value || ''
    },

    inputType() {
      return { number: 'number', email: 'email' }[this.schema.type] || 'text'
    },

    isMultiple() {
      return (this.schema.cardinality || 1) !== 1
    },
    isSchemaView() {
      return this.schema.config.schemaType === 'view'
    },
    isTypeCheckbox() {
      return ['boolean_checkbox'].includes(this.schema.type)
    },
    isTypeInput() {
      return ['string_textfield', 'number', 'email_default'].includes(this.schema.type)
    },
    /**
     * Reference widgets, by name rather than by "is this a relationship".
     *
     * An image field is a relationship as well, and searching the file
     * collection by filename is not how anyone picks a picture.
     */
    isTypeReference() {
      return ['entity_reference_autocomplete', 'entity_reference_autocomplete_tags'].includes(
        this.schema.type
      )
    },
    /**
     * Rich text, via the field's whole value rather than one property of it.
     *
     * A field that has never been filled in has no value object at all, so
     * reading `model.value` off it throws during render and takes the form with
     * it. That is every field on a create form.
     */
    richText: {
      get() {
        return (this.model || {}).value || ''
      },
      set(value) {
        this.model = { ...(this.model || {}), value }
      },
    },

    richTextFormat() {
      return (this.model || {}).format || undefined
    },

    /** Bytes chosen for this field in this browser and not yet uploaded. */
    pendingFile() {
      const form = this.authoringForm
      return form && form.pendingFiles ? form.pendingFiles[this.schema.id] || null : null
    },

    /**
     * Where an image dropped into the body should be posted.
     *
     * Null until the form has seen a field that takes files, which is also the
     * signal to stop offering the button: an insert with nowhere to put the
     * bytes is an insert that fails.
     */
    uploadTarget() {
      const form = this.authoringForm
      if (!form || !form.uploadField || !form.type) return null
      return { resourceType: form.type, field: form.uploadField }
    },

    isTypeImage() {
      return ['image_image'].includes(this.schema.type)
    },
    isTypeDate() {
      return ['datetime_timestamp', 'datetime_default'].includes(this.schema.type)
    },
    isTypePath() {
      return ['path'].includes(this.schema.type)
    },
    isTypeSelect() {
      return ['options_select'].includes(this.schema.type)
    },
    isTypeWysiwyg() {
      return ['text_textarea', 'text_textarea_with_summary'].includes(this.schema.type)
    },

    /**
     * The date, in the only shape a `datetime-local` input accepts.
     *
     * Drupal sends ISO 8601 with an offset, which the input will not display:
     * it shows an empty field rather than refusing, so the author sees a date
     * field that has apparently lost its date.
     */
    dateValue: {
      get() {
        return toDateInput(this.model)
      },
      set(local) {
        this.model = fromDateInput(local)
      },
    },

    label() {
      const text = (this.schema.label || {}).text || this.schema.id
      return text.charAt(0).toUpperCase() + text.slice(1)
    },

    placeholder() {
      return ((this.schema.settings || {}).display || {}).placeholder || undefined
    },

    relationships() {
      const data = (this.model || {}).data
      if (!data) return []
      return Array.isArray(data) ? data : [data]
    },

    rows() {
      return ((this.schema.settings || {}).display || {}).rows || 5
    },

    selectOptions() {
      const allowed = ((this.schema.settings || {}).storage || {}).allowed_values
      return allowed || {}
    },

    /**
     * The backend's own validation message, minus its field prefix.
     *
     * Drupal reports "field_x: The thing is wrong.", and repeating the field
     * name beneath the field's own label reads badly.
     */
    errorText() {
      return (this.errors || [])
        .map((error) => String(error.detail || '').split(': ').slice(1).join(': '))
        .filter(Boolean)
        .join('\n')
    },
  },
}
</script>
