<template>
  <div class="authoring-wysiwyg">
    <div v-show="ready" ref="host" data-testid="field-wysiwyg" />
    <textarea
      v-if="!ready"
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
 *
 * CKEditor is created directly rather than through `@ckeditor/ckeditor5-vue2`.
 * That adapter assigns `editor.isReadOnly`, and CKEditor 5 removed the setter,
 * so it throws before it subscribes to the editor's change events: the editor
 * appears, and every keystroke in it is silently dropped.
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
    return { model: this.value, editor: null }
  },

  computed: {
    ready() {
      return Boolean(this.editor)
    },
  },

  watch: {
    value(to) {
      if (to === this.model) return
      this.model = to
      // Only push into CKEditor when the change came from somewhere else;
      // setData on every keystroke would move the caret to the start.
      if (this.editor && this.editor.getData() !== to) this.editor.setData(to || '')
    },
    model(to) {
      this.$emit('input', to)
    },
  },

  async mounted() {
    const [ClassicEditor, toolbar] = await Promise.all([this.loadEditor(), this.loadToolbar()])
    if (!ClassicEditor) return
    await this.create(ClassicEditor, toolbar)
  },

  beforeDestroy() {
    if (this.editor) this.editor.destroy()
  },

  methods: {
    async loadEditor() {
      try {
        return (await import('@ckeditor/ckeditor5-build-classic')).default
      } catch {
        // The textarea stays. An edit is still possible without the toolbar.
        return null
      }
    },

    async create(ClassicEditor, toolbar) {
      try {
        const editor = await ClassicEditor.create(this.$refs.host, {
          toolbar: { items: toolbar },
          initialData: this.value || '',
        })
        editor.model.document.on('change:data', () => {
          this.model = editor.getData()
        })
        this.editor = editor
      } catch {
        // A toolbar item the build does not have throws here. The textarea
        // stays rather than leaving the author with no field at all.
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
      if (!backend || !this.format) return [...FALLBACK_TOOLBAR]

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

      return toolbarFor(await editorConfigPromise, this.format)
    },
  },
}
</script>
