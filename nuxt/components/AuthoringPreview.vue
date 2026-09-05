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
    <!--
      The chrome keeps its own width. It used to live inside the frame, so
      choosing a phone gave the toolbar 375px to fit four controls into and it
      wrapped: the thing being resized is the page, not the controls for it.
    -->
    <div class="flex max-h-full w-full max-w-5xl flex-col rounded border border-hairline bg-paper">
      <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-hairline px-5 py-3">
        <p class="eyebrow">Preview</p>

        <!--
          A real width, because a teaser at 1200px and the same teaser at 375px
          are different designs, and the point of previewing is to see the one
          that will be read. Free is the default: a fixed size is deliberate.
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
        <!--
          Scale, not width. A 1440 frame narrowed to fit is a 900px layout
          pretending to be a desktop; scaled down it is still a desktop, just
          smaller. Which is the whole reason to look at it.
        -->
        <label class="flex items-baseline gap-2">
          <span class="eyebrow">Zoom</span>
          <select
            v-model="zoom"
            class="rounded border border-hairline bg-paper px-2 py-1 font-mono text-xs text-ink"
            data-testid="preview-zoom"
          >
            <option :value="0">Fit ({{ Math.round(fitScale * 100) }}%)</option>
            <option v-for="step of zooms" :key="step" :value="step">
              {{ Math.round(step * 100) }}%
            </option>
          </select>
        </label>

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

      <!-- The canvas. Only this takes the chosen width. -->
      <div ref="canvas" class="flex justify-center overflow-auto bg-elevated px-5 py-4">
        <!--
          Two boxes: the outer one is the size the scaled content occupies, the
          inner one is the size the content thinks it is. A transform does not
          change layout, so without the outer box the canvas would reserve room
          for the unscaled frame and scroll for no reason.
        -->
        <div :style="scaledStyle">
          <div
            ref="frame"
            class="w-full rounded bg-paper p-4"
            :style="frameStyle"
            data-testid="preview-frame"
          >
          <p
            v-if="width"
            class="mb-3 border-b border-hairline pb-1 font-mono text-[0.6875rem] text-muted"
            data-testid="preview-width-note"
          >
            {{ width }}px wide
          </p>

          <!--
            Keyed by mode, so switching rebuilds rather than trying to patch one
            display's markup into another's.
          -->
            <DruxtEntity :key="mode" :type="type" :uuid="uuid" :mode="mode" />
          </div>
        </div>
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
      // 0 means fit: work the scale out from the room available.
      zoom: 0,
      zooms: [1, 0.75, 0.5, 0.25],
      available: 0,
      frameHeight: 0,
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
    this.measure()
    window.addEventListener('resize', this.measure)
    // The rendered entity decides its own height, and it arrives after this
    // does, so the box around it is sized from what actually got drawn.
    if (window.ResizeObserver) {
      this.observer = new window.ResizeObserver(() => this.measure())
      if (this.$refs.frame) this.observer.observe(this.$refs.frame)
    }
    this.modes = await this.availableModes()
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.measure)
    if (this.observer) this.observer.disconnect()
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
      if (!this.width) return { maxWidth: '48rem' }
      // `flex: none` so the flex parent cannot shrink it back: a 1440 frame in
      // a narrower window should be scaled, not quietly become the window.
      return {
        width: `${this.width}px`,
        flex: 'none',
        ...(this.scale === 1
          ? {}
          : { transform: `scale(${this.scale})`, transformOrigin: 'top left' }),
      }
    },

    /** The largest scale that fits the room available, never enlarging. */
    fitScale() {
      if (!this.width || !this.available) return 1
      return Math.min(1, this.available / this.width)
    },

    scale() {
      return this.zoom || this.fitScale
    },

    /**
     * The room the scaled frame actually occupies.
     *
     * A transform does not change layout, so the canvas would otherwise reserve
     * space for the frame at full size and scroll when nothing is off screen.
     */
    scaledStyle() {
      if (!this.width || this.scale === 1) return {}
      return {
        width: `${Math.round(this.width * this.scale)}px`,
        height: this.frameHeight ? `${Math.round(this.frameHeight * this.scale)}px` : undefined,
      }
    },
  },

  methods: {
    /** How much room the canvas has, and how tall the frame drew itself. */
    measure() {
      const canvas = this.$refs.canvas
      const frame = this.$refs.frame
      // Minus the canvas padding, or the frame is measured against room that
      // includes its own margins and comes out a little too wide.
      if (canvas) this.available = Math.max(0, canvas.clientWidth - 40)
      if (frame) this.frameHeight = frame.scrollHeight
    },

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
