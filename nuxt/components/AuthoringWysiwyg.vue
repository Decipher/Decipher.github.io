<template>
  <div class="authoring-wysiwyg">
    <ckeditor v-if="ready" v-model="model" :editor="editor" :config="config" />
    <textarea
      v-else
      v-model="model"
      rows="8"
      class="w-full rounded border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
      data-testid="field-text"
    />
  </div>
</template>

<script>
/**
 * Rich text, with the toolbar Drupal was configured for.
 *
 * The toolbar comes from `editor--editor` over JSON:API rather than being
 * hardcoded, so the buttons match what the site actually offers and a change at
 * /admin/config/content/formats reaches the frontend without a deploy.
 *
 * The editor is client-only. CKEditor touches `window` and `document` at import
 * time, so requiring it during a static build fails the build outright, which is
 * why it is pulled in inside `mounted` rather than at the top of the file.
 *
 * A textarea is rendered until then, and stays if CKEditor cannot load at all.
 * Losing formatting buttons is a worse editor; losing the field is a lost edit.
 */
import { FALLBACK_TOOLBAR, toolbarFor } from '../lib/editor.mjs'

// Shared across every field on the page: one request, however many editors.
let editorConfigPromise = null

export default {
  name: 'AuthoringWysiwyg',

  props: {
    value: { type: String, default: '' },
    /** The text format this value belongs to, e.g. `basic_html`. */
    format: { type: String, default: null },
  },

  data() {
    return { model: this.value, editor: null, toolbar: [...FALLBACK_TOOLBAR] }
  },

  computed: {
    ready() {
      return Boolean(this.editor)
    },
    config() {
      return { toolbar: { items: this.toolbar } }
    },
  },

  watch: {
    value(to) {
      if (to !== this.model) this.model = to
    },
    model(to) {
      this.$emit('input', to)
    },
  },

  async mounted() {
    await Promise.all([this.loadEditor(), this.loadToolbar()])
  },

  methods: {
    async loadEditor() {
      try {
        const [{ default: ClassicEditor }, { component }] = await Promise.all([
          import('@ckeditor/ckeditor5-build-classic'),
          import('@ckeditor/ckeditor5-vue2'),
        ])
        this.$options.components.ckeditor = component
        this.editor = ClassicEditor
      } catch {
        // The textarea stays. An edit is still possible without the toolbar.
      }
    },

    /**
     * Read the configured toolbar, if this session is allowed to.
     *
     * `editor--editor` needs `administer filters`, so an anonymous visitor gets
     * an empty collection rather than an error, and keeps the fallback.
     */
    async loadToolbar() {
      const backend = this.$authoring && this.$authoring.state.url
      if (!backend || !this.format) return

      if (!editorConfigPromise) {
        const token = this.$authoringAuth && this.$authoringAuth.token
        editorConfigPromise = fetch(`${backend}/jsonapi/editor/editor`, {
          headers: {
            Accept: 'application/vnd.api+json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((body) => (body && Array.isArray(body.data) ? body.data : []))
          .catch(() => [])
      }

      this.toolbar = toolbarFor(await editorConfigPromise, this.format)
    },
  },
}
</script>
