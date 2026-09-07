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
import { DrupalImageCompatibility, imageUploadAdapter } from '../lib/ckeditor-upload.mjs'
import { captionsAreAttributes, fromEditorCaptions, toEditorCaptions } from '../lib/captions.mjs'
import { editorFileUrls, storedFileUrls } from '../lib/files.mjs'
import { stickyOffset } from '../lib/sticky.mjs'
import { editorPlugins, loadCkeditor } from '../lib/ckeditor.mjs'
import { editorForFormat, FALLBACK_TOOLBAR, usableToolbar } from '../lib/editor.mjs'

// Shared across every field on the page: one request, however many editors.
let editorConfigPromise = null

export default {
  name: 'AuthoringWysiwyg',

  props: {
    value: { type: String, default: '' },
    /** The text format this value belongs to, e.g. `basic_html`. */
    format: { type: String, default: null },
    /**
     * Where an inserted image's bytes should be posted, if anywhere.
     *
     * `{ resourceType, field }`. Null means no route was found, and the image
     * button is withdrawn rather than offered and left to fail.
     */
    upload: { type: Object, default: null },
  },

  data() {
    return { model: this.value, editor: null }
  },

  computed: {
    /**
     * Whether this format's captions belong in `data-caption`.
     *
     * Read from the build's copy of the format configuration. It used to be
     * assumed, and the assumption is true of every format on this site, which
     * is exactly why it went unnoticed: on a site whose format does not run
     * `filter_caption`, every caption an author wrote would have been stored
     * into an attribute nothing reads and lost without a word.
     */
    captionsAsAttributes() {
      const filters = ((this.$config || {}).authoring || {}).filters || {}
      return captionsAreAttributes(filters, this.format)
    },

    /** The toolbars the build read out of Drupal's committed configuration. */
    bakedToolbars() {
      return ((this.$config || {}).authoring || {}).toolbars || {}
    },

    /** The backend this session is connected to, if any. */
    backendUrl() {
      return (this.$authoring && this.$authoring.state.url) || null
    },

    /**
     * What the upload adapter needs.
     *
     * Never null now. An image can be inserted with no backend and no token:
     * the bytes are held with the change and sent when the change is, the same
     * way a field's image already works. Withholding the button until somebody
     * signed in meant the one thing an author could not do offline was the
     * thing they most wanted to.
     *
     * Not gated on being signed in. It was, briefly, on the reasoning that an
     * upload without a token is a guaranteed 403 and a button that cannot work
     * should not be offered. That reasoning costs more than it saves: a control
     * an author never sees is a feature they never find out about, and the way
     * to add an image stopped being discoverable at all. The button stays, and
     * `uploadImage` says what is missing if it is pressed too early.
     */
    uploadOptions() {
      return {
        backendUrl: this.backendUrl,
        token: (this.$authoringAuth && this.$authoringAuth.token) || null,
        resourceType: (this.upload || {}).resourceType,
        field: (this.upload || {}).field,
        // Where the bytes go when they cannot go to Drupal yet.
        hold: (file, dataUrl) => this.holdImage(file, dataUrl),
      }
    },

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
      if (this.editor && this.outOfEditor(this.editor.getData()) !== to) {
        this.editor.setData(this.intoEditor(to))
      }
    },
    model(to) {
      this.$emit('input', to)
    },
  },

  async mounted() {
    const [namespace, configured] = await Promise.all([loadCkeditor(), this.loadToolbar()])
    if (!namespace) return
    await this.create(namespace, configured)
  },

  beforeDestroy() {
    if (this.editor) this.editor.destroy()
  },

  methods: {
    /**
     * How far down the page the editor should treat as the top.
     *
     * CKEditor pins its toolbar to the top of the viewport while you scroll a
     * long field, and knows nothing about this site's own pinned header, so it
     * parked underneath it. The measurement is the layout's, so the toolbar and
     * the edit panel cannot disagree about where the top is.
     */
    stickyOffset() {
      return stickyOffset(typeof document === 'undefined' ? null : document, window)
    },

    /**
     * Drupal's stored markup, in the shape CKEditor edits.
     *
     * Two differences, both of which cost content if left: the file path is one
     * this origin does not serve, and a caption lives in an attribute the
     * editor's schema does not know and would drop.
     */
    intoEditor(value) {
      const html = this.captionsAsAttributes ? toEditorCaptions(value || '') : value || ''
      return editorFileUrls(html, this.backendUrl)
    },

    /**
     * Keep an inserted image with the change until there is somewhere to send it.
     *
     * Handed to the form, which carries it into the cart entry, so committing
     * can upload it and put the real URL in the body. Until then the body holds
     * the data URL, which is what the editor is showing.
     */
    holdImage(file, dataUrl) {
      const form = this.$parent && this.findForm()
      if (form && typeof form.holdBodyImage === 'function') {
        form.holdBodyImage({ name: file.name, type: file.type, dataUrl })
      }
    },

    /** The authoring form above this field, if this field is on one. */
    findForm() {
      let parent = this.$parent
      while (parent && typeof parent.holdBodyImage !== 'function') parent = parent.$parent
      return parent
    },

    /** And back, so what is staged is what Drupal would have written. */
    outOfEditor(data) {
      const html = storedFileUrls(data, this.backendUrl)
      return this.captionsAsAttributes ? fromEditorCaptions(html) : html
    },

    async create(namespace, toolbar) {
      try {
        const editor = await namespace.editorClassic.ClassicEditor.create(this.$refs.host, {
          toolbar: { items: toolbar },
          // Everything, not just what the toolbar shows: see `editorPlugins`.
          plugins: [
            ...editorPlugins(namespace),
            // Always: it is what makes Drupal's own markup survive a round trip.
            DrupalImageCompatibility,
            ...(this.uploadOptions ? [imageUploadAdapter(this.uploadOptions)] : []),
          ],
          // What appears when an image is selected. Left empty, CKEditor warns
          // `widget-toolbar-no-items` and a selected image offers nothing at
          // all, alt text included, which the field requires.
          image: {
            toolbar: [
              'imageTextAlternative',
              'toggleImageCaption',
              '|',
              'imageStyle:inline',
              'imageStyle:block',
              'imageStyle:side',
            ],
          },
          // Only meaningful when the page itself scrolls. Inside the edit
          // panel the fields scroll in their own box and the stylesheet pins
          // the toolbar to that instead; see `.authoring-panel-body .ck-toolbar`.
          ui: { viewportOffset: { top: this.stickyOffset() } },
          initialData: this.intoEditor(this.value),
        })
        // The same class the rendered field carries, so what is typed looks
        // like what will be published. Editing in a box styled differently from
        // the page is guessing: headings, code and lists all read as plain text
        // in the editor and as themselves everywhere else.
        //
        // Added to the editable root rather than duplicated as CKEditor content
        // styles, because a second copy of the rules is a second copy to keep
        // in agreement with the first.
        editor.editing.view.change((writer) => {
          writer.addClass('prose-body', editor.editing.view.document.getRoot())
        })

        editor.model.document.on('change:data', () => {
          this.model = this.outOfEditor(editor.getData())
        })
        this.editor = editor
      } catch (error) {
        // A toolbar item with no plugin throws here, and so does a plugin that
        // will not load. The textarea stays rather than leaving the author with
        // no field at all.
        //
        // Said out loud, because a silent fallback looks identical to an editor
        // nobody configured: the difference only showed up as a missing toolbar.
        console.warn('The rich text editor could not start; using a plain field.', error)
      }
    },

    /**
     * The buttons this format is configured for.
     *
     * Two sources, in order. `editor--editor` is the live one and wins when it
     * answers, so a change made in Drupal reaches a session that can read it
     * without a deploy. It needs `administer filters`, which the scope an
     * author signs in with does not grant, so for almost everybody it returns
     * an empty collection.
     *
     * The build carries the same configuration, read from the committed files.
     * Without it every real author got the fallback toolbar and none of the
     * buttons this site's own writing needs, which made the content something
     * the editor could not have produced.
     */
    async loadToolbar() {
      const live = await this.liveToolbar()
      if (live.length) return live

      const baked = usableToolbar((this.bakedToolbars || {})[this.format])
      return baked.length ? baked : [...FALLBACK_TOOLBAR]
    },

    /** Drupal's own answer, for a session allowed to ask. */
    async liveToolbar() {
      const backend = this.backendUrl
      if (!backend || !this.format) return []

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

      // Not `toolbarFor`: it substitutes the fallback when it finds nothing,
      // and the build's copy is a better answer than that. This wants to know
      // whether Drupal said anything usable, so it asks for the parts.
      const editor = editorForFormat(await editorConfigPromise, this.format)
      const items = (((editor || {}).attributes || {}).settings || {}).toolbar
      return usableToolbar((items || {}).items)
    },
  },
}
</script>
