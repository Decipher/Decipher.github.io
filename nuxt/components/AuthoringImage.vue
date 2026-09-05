<template>
  <div class="authoring-image">
    <!-- What is there now, whether it came from Drupal or from this browser. -->
    <div v-if="preview" class="mb-2 flex items-start gap-3">
      <img
        :src="preview"
        :alt="alt"
        class="h-24 w-24 shrink-0 rounded border border-hairline object-cover"
        data-testid="image-preview"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate font-mono text-xs text-muted" data-testid="image-name">
          {{ filename }}
        </p>
        <p v-if="pending" class="font-mono text-xs text-accent" data-testid="image-pending">
          Not uploaded yet. It goes up when this is committed.
        </p>
        <button
          type="button"
          class="mt-1 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
          data-testid="image-remove"
          @click="remove"
        >
          Remove
        </button>
      </div>
    </div>

    <!--
      A drop target that is also a file input, because one of the two is always
      the wrong one: dragging is quicker when the file is already on screen, and
      impossible on a phone.
    -->
    <label
      class="block cursor-pointer rounded border border-dashed px-3 py-4 text-center text-sm transition-colors"
      :class="dragging ? 'border-accent text-accent' : 'border-hairline text-muted hover:border-ink'"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <input
        type="file"
        class="sr-only"
        :accept="accept"
        data-testid="image-input"
        @change="onChoose"
      />
      {{ preview ? 'Drop another, or choose one' : 'Drop an image here, or choose one' }}
    </label>

    <!-- Required by the field, and not enforced by JSON:API, so asked for here. -->
    <label v-if="preview" class="mt-3 block">
      <span class="eyebrow mb-1.5 block">
        Alt text
        <span v-if="altRequired" class="text-accent" aria-hidden="true">*</span>
      </span>
      <input
        v-model="alt"
        type="text"
        class="w-full rounded border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
        placeholder="What is in the picture"
        data-testid="image-alt"
      />
      <span class="mt-1 block text-sm text-muted">
        Describes the image to someone who cannot see it.
      </span>
    </label>

    <p v-if="error" class="mt-2 text-sm text-accent" data-testid="image-error">{{ error }}</p>
  </div>
</template>

<script>
/**
 * An image field.
 *
 * The bytes and the reference to them are two different things, and this holds
 * both. A file chosen here is kept in the cart as data until the cart is
 * committed, so an author with no backend can still put a picture on something,
 * which is the same promise the rest of editing makes.
 *
 * Alt text is asked for because the field requires it. JSON:API does not
 * enforce that, and a relationship sent without it clears the alt and answers
 * 200, so the only thing standing between an author and a silently
 * inaccessible image is this field.
 */
import { fileIsAllowed, imageRelationship } from '../lib/upload.mjs'

export default {
  name: 'AuthoringImage',

  props: {
    value: { type: Object, default: () => ({ data: null }) },
    schema: { type: Object, required: true },
    /** Bytes chosen in this browser and not yet uploaded, if any. */
    pendingFile: { type: Object, default: null },
  },

  data() {
    return { dragging: false, error: null, alt: '' }
  },

  computed: {
    current() {
      return (this.value || {}).data || null
    },

    pending() {
      return Boolean(this.pendingFile)
    },

    filename() {
      if (this.pendingFile) return this.pendingFile.name
      return (this.currentMeta.title || '').trim() || 'Image'
    },

    currentMeta() {
      return (this.current || {}).meta || {}
    },

    /**
     * What to show. A file chosen here has no URL on the backend yet, so its
     * own data is the preview; anything else is already served by Drupal.
     */
    preview() {
      if (this.pendingFile) return this.pendingFile.dataUrl
      if (!this.current) return null
      return this.current.meta && this.current.meta.url ? this.absolute(this.current.meta.url) : null
    },

    altRequired() {
      return Boolean((((this.schema || {}).settings || {}).config || {}).alt_field_required)
    },

    accept() {
      const extensions = String(
        (((this.schema || {}).settings || {}).config || {}).file_extensions || ''
      )
        .split(/\s+/)
        .filter(Boolean)
      return extensions.length ? extensions.map((e) => `.${e}`).join(',') : 'image/*'
    },
  },

  watch: {
    value: {
      immediate: true,
      handler() {
        this.alt = this.currentMeta.alt || ''
      },
    },

    alt(to) {
      // Only once there is something for it to describe.
      if (this.current || this.pendingFile) {
        this.$emit('input', imageRelationship(this.currentId(), to, this.currentMeta))
      }
    },

    /**
     * Point the field at a file that does not exist yet.
     *
     * The bytes are held elsewhere, so without this the model does not change
     * when a picture is chosen, and staging would report nothing changed. The
     * id is the client-generated one; the commit swaps it for Drupal's.
     */
    pendingFile(file) {
      if (!file) return
      this.$emit('input', imageRelationship(file.id, this.alt, {}))
    },
  },

  methods: {
    currentId() {
      if (this.pendingFile) return this.pendingFile.id
      return (this.current || {}).id || null
    },

    onDrop(event) {
      this.dragging = false
      const file = (event.dataTransfer.files || [])[0]
      if (file) this.take(file)
    },

    onChoose(event) {
      const file = (event.target.files || [])[0]
      if (file) this.take(file)
    },

    /**
     * Accept a file, or say why not.
     *
     * Checked here against the field's own configuration rather than left to
     * the backend, so an author who picks a PDF is told before they commit
     * everything else along with it.
     */
    async take(file) {
      const allowed = fileIsAllowed(file, this.schema)
      if (!allowed.ok) {
        this.error = allowed.reason
        return
      }
      this.error = null
      this.$emit('file', { file, dataUrl: await this.readAsDataUrl(file) })
    },

    readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
    },

    remove() {
      this.error = null
      this.alt = ''
      this.$emit('file', null)
      this.$emit('input', imageRelationship(null, ''))
    },

    /** Drupal returns a site-relative URL, which is not this origin. */
    absolute(url) {
      if (/^https?:\/\//.test(url)) return url
      const backend = (this.$authoring && this.$authoring.state.url) || ''
      return `${String(backend).replace(/\/+$/, '')}${url}`
    },
  },
}
</script>
