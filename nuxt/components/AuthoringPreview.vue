<template>
  <div
    class="authoring-preview fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="`Preview of ${type}`"
    data-testid="authoring-preview"
    @click.self="$emit('close')"
    @keydown.escape="$emit('close')"
  >
    <div
      class="flex max-h-full flex-col rounded border border-hairline bg-paper"
      :style="frameStyle"
    >
      <div class="flex items-baseline justify-between gap-4 border-b border-hairline px-5 py-3">
        <p class="eyebrow">Preview</p>

        <!--
          A width, because a teaser at 1200px and the same teaser at 375px are
          different designs, and the point of previewing is to see the one that
          will be read. Free is the default: a fixed size is a thing to switch
          to deliberately.
        -->
        <label class="ml-auto flex items-baseline gap-2">
          <span class="eyebrow">Width</span>
          <select
            v-model="width"
            class="rounded border border-hairline bg-paper px-2 py-1 font-mono text-xs text-ink"
            data-testid="preview-width"
          >
            <option v-for="size of sizes" :key="size.label" :value="size.width">
              {{ size.label }}
            </option>
          </select>
        </label>

        <!--
          The view modes this bundle actually has, read from Drupal rather than
          guessed: a site with a custom display would otherwise be told it has
          only the ones somebody hardcoded.
        -->
        <label class="flex items-baseline gap-2">
          <span class="eyebrow">View mode</span>
          <select
            v-model="mode"
            class="rounded border border-hairline bg-paper px-2 py-1 font-mono text-xs text-ink"
            data-testid="preview-mode"
          >
            <option v-for="option of modes" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>

        <button
          type="button"
          class="font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
          data-testid="preview-close"
          @click="$emit('close')"
        >
          Close
        </button>
      </div>

      <p
        v-if="width"
        class="border-b border-hairline px-5 py-1 font-mono text-[0.6875rem] text-muted"
        data-testid="preview-width-note"
      >
        {{ width }}px wide
      </p>

      <div class="overflow-y-auto px-5 py-4">
        <!--
          Keyed by mode, so switching rebuilds rather than trying to patch one
          display's markup into another's.
        -->
        <DruxtEntity :key="mode" :type="type" :uuid="uuid" :mode="mode" />
      </div>
    </div>
  </div>
</template>

<script>
/**
 * One piece of content, as the site would render it.
 *
 * Staged edits are already applied by the time anything renders, because the
 * entity wrapper overlays them, so this shows what the change will look like
 * rather than what the backend currently holds. That is the point of it: a
 * diff says what changed, and this says what it will look like.
 */
export default {
  name: 'AuthoringPreview',

  props: {
    type: { type: String, required: true },
    uuid: { type: String, required: true },
  },

  data() {
    return {
      mode: 'default',
      modes: ['default'],
      // Free by default: a fixed width is deliberate, not the normal case.
      width: 0,
      sizes: [
        { label: 'Free', width: 0 },
        { label: 'Phone', width: 375 },
        { label: 'Tablet', width: 768 },
        { label: 'Laptop', width: 1024 },
        { label: 'Desktop', width: 1440 },
      ],
    }
  },

  async mounted() {
    // Moved to the body, because it is rendered from inside the drawer: a
    // scrolling, sticky, stacked column is a bad place for something that must
    // cover the page. Vue 2 has no portal, so this is the portal.
    document.body.appendChild(this.$el)
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', this.onKey)
    this.modes = await this.availableModes()
  },

  beforeDestroy() {
    document.removeEventListener('keydown', this.onKey)
    document.body.style.overflow = ''
    // Put back where Vue expects it, or removing the component throws.
    if (this.$el.parentNode === document.body) document.body.removeChild(this.$el)
  },

  computed: {
    /**
     * The frame the content is rendered in.
     *
     * A real width rather than a scale, so the site's own media queries decide
     * the layout. Zooming a wide render down looks like a phone and is not one:
     * every breakpoint would still be the desktop's.
     */
    frameStyle() {
      if (!this.width) return { width: '100%', maxWidth: '48rem' }
      return { width: `${this.width}px`, maxWidth: '100%' }
    },
  },

  methods: {
    onKey(event) {
      if (event.key === 'Escape') this.$emit('close')
    },

    /**
     * The view modes configured for this bundle.
     *
     * Every display Drupal has for it, which is what "see it in different view
     * modes" means. Falls back to the one every bundle has, rather than to an
     * empty list that would leave the selector unusable.
     */
    async availableModes() {
      const [entityType, bundle] = String(this.type).split('--')
      try {
        const displays = await this.$druxt.getCollection('entity_view_display--entity_view_display')
        const found = (displays.data || [])
          .map((display) => display.attributes || {})
          .filter((attributes) => attributes.bundle === bundle)
          .filter((attributes) => attributes.targetEntityType === entityType)
          .map((attributes) => attributes.mode)
          .filter(Boolean)
        return [...new Set(['default', ...found])]
      } catch {
        return ['default']
      }
    },
  },
}
</script>
