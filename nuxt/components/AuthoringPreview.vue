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
        <div class="relative" :style="scaledStyle">
          <!--
            Only on Free. A named size is a claim about a device, and a handle
            that quietly turns 375 into 380 makes the claim false: the whole
            point of those is that the site's own media queries decide. Free
            claims nothing, so it is the one that can be dragged.
          -->
          <template v-if="!width">
            <button
              v-for="edge of ['left', 'right']"
              :key="edge"
              type="button"
              class="absolute top-0 h-full w-2 cursor-ew-resize rounded bg-hairline opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none"
              :class="edge === 'left' ? '-left-3' : '-right-3'"
              :style="dragging ? { opacity: 1 } : null"
              role="separator"
              aria-orientation="vertical"
              :aria-label="`Drag to resize the preview from the ${edge}`"
              :data-testid="`preview-resize-${edge}`"
              @pointerdown="startDrag($event, edge)"
              @keydown="onResizeKey($event, edge)"
            ></button>
          </template>
          <div
            ref="frame"
            class="w-full rounded bg-paper p-4"
            :style="frameStyle"
            data-testid="preview-frame"
          >
          <p
            v-if="width || freeWidth"
            class="mb-3 border-b border-hairline pb-1 font-mono text-[0.6875rem] text-muted"
            data-testid="preview-width-note"
          >
            {{ width || freeWidth }}px wide
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
      // What Free has been dragged to, if it has. Null is "as wide as it wants",
      // which is what Free means until somebody says otherwise.
      freeWidth: null,
      dragging: null,
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
    this.endDrag()
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
      // On Free the box around it decides the width and this fills it, so the
      // handles have something to hold on to. `w-full` in the class list does
      // the filling.
      if (!this.width) return {}
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
      // Free: this box is the width, because it is what the handles sit on.
      // It also has to be given one. A flex item with no width shrinks to its
      // content, and the frame inside asking for 100% of it resolves to the
      // same thing, so a preview meant to be up to 48rem wide was drawn at
      // whatever its longest line happened to be.
      if (!this.width) {
        return this.freeWidth
          ? { width: `${this.freeWidth}px`, flex: 'none' }
          : { width: '100%', maxWidth: '48rem' }
      }
      if (this.scale === 1) return {}
      return {
        width: `${Math.round(this.width * this.scale)}px`,
        height: this.frameHeight ? `${Math.round(this.frameHeight * this.scale)}px` : undefined,
      }
    },
  },

  methods: {
    /** The narrowest and widest a dragged preview may be. */
    dragBounds() {
      // Narrower than a phone is not a size anybody is designing for, and wider
      // than the canvas cannot be seen. Both are about what is useful to look
      // at rather than what the browser will allow.
      return { min: 280, max: Math.max(280, this.available || 280) }
    },

    /**
     * Resize from an edge.
     *
     * Both edges move, because the frame is centred: dragging one edge by a
     * hundred pixels and having the page grow by a hundred would put the edge
     * somewhere other than under the pointer, which reads as the handle
     * slipping. So the width changes by twice the distance and the edge stays
     * where the pointer is.
     */
    resizeBy(distance) {
      const { min, max } = this.dragBounds()
      const from = this.dragging ? this.dragging.width : this.measuredWidth()
      this.freeWidth = Math.round(Math.min(max, Math.max(min, from + distance * 2)))
    },

    /** What the frame is actually drawn at, dragged or not. */
    measuredWidth() {
      const frame = this.$refs.frame
      return frame ? Math.round(frame.getBoundingClientRect().width) : this.freeWidth || 0
    },

    startDrag(event, edge) {
      this.measure()
      this.dragging = {
        edge,
        x: event.clientX,
        width: this.measuredWidth(),
      }
      // Captured, so the drag survives the pointer leaving the two pixels of
      // handle it started on, which it does immediately.
      if (event.target.setPointerCapture) event.target.setPointerCapture(event.pointerId)
      window.addEventListener('pointermove', this.onDrag)
      window.addEventListener('pointerup', this.endDrag)
      window.addEventListener('pointercancel', this.endDrag)
      event.preventDefault()
    },

    onDrag(event) {
      if (!this.dragging) return
      const towards = this.dragging.edge === 'right' ? 1 : -1
      this.resizeBy((event.clientX - this.dragging.x) * towards)
    },

    endDrag() {
      this.dragging = null
      window.removeEventListener('pointermove', this.onDrag)
      window.removeEventListener('pointerup', this.endDrag)
      window.removeEventListener('pointercancel', this.endDrag)
    },

    /**
     * The same resize from the keyboard.
     *
     * A control that only answers to a pointer is a control some people do not
     * have. Arrow keys move it, and Shift moves it faster.
     */
    onResizeKey(event, edge) {
      const towards = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
      if (!towards) return
      this.measure()
      this.resizeBy(towards * (event.shiftKey ? 64 : 16) * (edge === 'right' ? 1 : -1))
      event.preventDefault()
    },

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
