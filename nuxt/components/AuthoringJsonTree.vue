<template>
  <ul class="authoring-json-tree font-mono text-xs leading-relaxed">
    <li v-for="entry of entries" :key="entry.key">
      <template v-if="entry.branch">
        <button
          type="button"
          class="flex w-full items-baseline gap-1 text-left text-muted hover:text-accent"
          :aria-expanded="String(isOpen(entry.key))"
          data-testid="json-toggle"
          @click="toggle(entry.key)"
        >
          <span class="w-3 shrink-0" aria-hidden="true">{{ isOpen(entry.key) ? '-' : '+' }}</span>
          <span class="text-ink">{{ entry.key }}</span>
          <span>{{ entry.summary }}</span>
        </button>
        <AuthoringJsonTree
          v-if="isOpen(entry.key)"
          :value="entry.value"
          :before="entry.before"
          :depth="depth + 1"
          class="ml-3 border-l border-hairline pl-2"
        />
      </template>

      <div v-else>
        <div class="flex items-baseline gap-1">
          <span class="w-3 shrink-0" aria-hidden="true"></span>
          <span class="text-ink">{{ entry.key }}</span>
          <span
            class="break-all"
            :class="entry.changed ? 'text-accent' : 'text-muted'"
            data-testid="json-leaf"
            >{{ entry.changed ? '+ ' : '' }}{{ entry.summary }}</span
          >
        </div>
        <!-- What it was, when this is replacing something. -->
        <div v-if="entry.changed" class="flex items-baseline gap-1" data-testid="json-was">
          <span class="w-3 shrink-0" aria-hidden="true"></span>
          <span class="text-muted">{{ entry.key }}</span>
          <span class="break-all text-muted line-through">- {{ entry.was }}</span>
        </div>
      </div>
    </li>
  </ul>
</template>

<script>
/**
 * A JSON:API resource, as a tree that can be opened up.
 *
 * The cart's summary says which fields changed, which is enough to decide
 * whether to commit but not enough to check. What is actually going to be sent
 * is a JSON:API document, and an author asked to approve one should be able to
 * read it rather than take its word.
 *
 * Recursive, and opens itself down to `openTo` levels so the first thing seen
 * is the shape rather than a single collapsed row. Deeper levels stay shut,
 * because a body field with its format and summary is noise until wanted.
 */
export default {
  name: 'AuthoringJsonTree',

  props: {
    value: { type: [Object, Array], default: () => ({}) },
    /**
     * What the backend held for the same keys, where it is known.
     *
     * A staged resource is a delta: on its own it says what a field will be
     * without saying what it was, which is the half a reviewer needs.
     */
    before: { type: [Object, Array], default: null },
    depth: { type: Number, default: 0 },
    /** How many levels start open. Two shows a resource's fields and no more. */
    openTo: { type: Number, default: 1 },
  },

  data() {
    return { opened: {} }
  },

  computed: {
    entries() {
      const value = this.value || {}
      const keys = Array.isArray(value) ? value.map((_, i) => String(i)) : Object.keys(value)
      const before = this.before || {}
      return keys.map((key) => {
        const item = value[key]
        const branch = item !== null && typeof item === 'object'
        const had = Object.prototype.hasOwnProperty.call(before, key)
        return {
          key,
          value: item,
          before: had ? before[key] : null,
          branch,
          summary: this.summarise(item),
          // Only a leaf says "changed": a branch says it about its own leaves.
          changed: !branch && had && this.summarise(before[key]) !== this.summarise(item),
          was: had ? this.summarise(before[key]) : '',
        }
      })
    },
  },

  methods: {
    isOpen(key) {
      // `opened` holds only what the author has changed their mind about, so
      // the default can depend on depth without writing a value per node.
      return key in this.opened ? this.opened[key] : this.depth < this.openTo
    },

    toggle(key) {
      this.$set(this.opened, key, !this.isOpen(key))
    },

    /** What a row says before it is opened. */
    summarise(value) {
      if (value === null) return 'null'
      if (Array.isArray(value)) return `[${value.length}]`
      if (typeof value === 'object') {
        const keys = Object.keys(value)
        return `{${keys.length}}`
      }
      const text = String(value)
      return text.length > 80 ? `${text.slice(0, 80)}...` : text
    },
  },
}
</script>
