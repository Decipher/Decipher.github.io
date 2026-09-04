<template>
  <div class="authoring-reference">
    <!-- What is already referenced. Tags read as chips; a single reference reads as one. -->
    <ul v-if="selected.length" class="mb-2 flex flex-wrap gap-2">
      <li
        v-for="item of selected"
        :key="item.id"
        class="flex items-center gap-1 rounded border border-hairline bg-elevated px-2 py-1 text-sm"
        data-testid="reference-selected"
      >
        <span>{{ item.label }}</span>
        <button
          type="button"
          class="text-muted hover:text-accent"
          :aria-label="`Remove ${item.label}`"
          data-testid="reference-remove"
          @click="remove(item)"
        >
          ×
        </button>
      </li>
    </ul>

    <div class="relative">
      <input
        v-model="query"
        type="text"
        :placeholder="placeholder"
        :class="controlClass"
        autocomplete="off"
        role="combobox"
        :aria-expanded="String(Boolean(results.length))"
        data-testid="reference-input"
        @input="search"
        @keydown.escape="results = []"
      />

      <ul
        v-if="results.length"
        class="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-hairline bg-surface shadow-lg"
        role="listbox"
      >
        <li v-for="item of results" :key="item.id">
          <button
            type="button"
            class="block w-full px-3 py-2 text-left text-sm hover:bg-elevated"
            data-testid="reference-option"
            @click="choose(item)"
          >
            {{ item.label }}
          </button>
        </li>
      </ul>
    </div>

    <p v-if="status" class="mt-1.5 text-sm text-muted" data-testid="reference-status">
      {{ status }}
    </p>
  </div>
</template>

<script>
/**
 * An entity reference, searched the way Drupal's autocomplete searches.
 *
 * JSON:API has no autocomplete endpoint, so this queries the target collection
 * with the field's own `match_operator` and `match_limit`. Those come from the
 * field's settings rather than being chosen here, so a site configured to match
 * on STARTS_WITH behaves that way on the frontend too.
 *
 * Searching needs a reachable backend. Without one the field still shows what
 * is already referenced and lets it be removed, because that much is in the
 * entity already and does not need looking up.
 */
import {
  autocompleteUrl,
  labelOf,
  labelsUrl,
  targetResourceTypes,
  toRelationship,
} from '../lib/reference.mjs'

export default {
  name: 'AuthoringReference',

  props: {
    value: { type: Object, default: () => ({ data: null }) },
    schema: { type: Object, required: true },
    multiple: { type: Boolean, default: false },
  },

  data() {
    return { query: '', results: [], status: null, selected: [], timer: null }
  },

  computed: {
    controlClass() {
      return 'w-full rounded border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none'
    },
    backendUrl() {
      return this.$authoring && this.$authoring.state.url
    },
    placeholder() {
      return this.multiple ? 'Search to add another' : 'Search'
    },
    current() {
      const data = (this.value || {}).data
      if (!data) return []
      return Array.isArray(data) ? data : [data]
    },
  },

  watch: {
    value: { immediate: true, handler: 'hydrate' },
    // A field rendered before the backend was connected has ids and no labels.
    backendUrl: 'resolveLabels',
  },

  methods: {
    /** Show what is referenced straight away, then put names to the ids. */
    hydrate() {
      const known = new Map(this.selected.map((item) => [item.id, item.label]))
      this.selected = this.current.map((item) => ({
        type: item.type,
        id: item.id,
        label: known.get(item.id) || labelOf(item),
      }))
      this.resolveLabels()
    },

    /**
     * Put names to referenced ids.
     *
     * A relationship carries a type and a UUID and nothing readable, so without
     * this the author is shown a UUID and asked to recognise it.
     */
    async resolveLabels() {
      const unresolved = this.selected.filter((item) => item.label === item.id)
      if (!unresolved.length || !this.backendUrl) return

      const byType = new Map()
      for (const item of unresolved) {
        byType.set(item.type, [...(byType.get(item.type) || []), item.id])
      }

      const found = new Map()
      await Promise.all(
        [...byType].map(async ([type, ids]) => {
          const body = await this.request(labelsUrl(this.backendUrl, type, ids))
          for (const resource of (body || {}).data || []) {
            found.set(resource.id, labelOf(resource))
          }
        })
      )

      if (!found.size) return
      this.selected = this.selected.map((item) =>
        found.has(item.id) ? { ...item, label: found.get(item.id) } : item
      )
    },

    /** Debounced, so typing does not fire a request per keystroke. */
    search() {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.run(), 250)
    },

    async run() {
      const query = this.query.trim()
      this.results = []
      if (query.length < 2) {
        this.status = null
        return
      }
      if (!this.backendUrl) {
        this.status = 'Connect a backend to search for things to reference.'
        return
      }

      const types = targetResourceTypes(this.schema, this.current, await this.index())
      if (!types.length) {
        this.status = 'This field does not say what it can reference.'
        return
      }

      this.status = 'Searching...'
      const found = []
      // One request per allowed bundle: JSON:API collections are per resource
      // type, so a field allowing several has to ask each.
      await Promise.all(
        types.map(async (type) => {
          const body = await this.request(
            autocompleteUrl(this.backendUrl, type, query, this.schema)
          )
          for (const resource of (body || {}).data || []) {
            found.push({ type: resource.type, id: resource.id, label: labelOf(resource) })
          }
        })
      )

      // A slower request must not overwrite a newer search.
      if (this.query.trim() !== query) return
      this.results = found
      this.status = found.length ? null : 'Nothing matched.'
    },

    /** One JSON:API GET. Returns nothing rather than throwing, so one failed
     * bundle does not lose the results from the others. */
    async request(url) {
      const token = this.$authoringAuth && this.$authoringAuth.token
      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/vnd.api+json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        return response.ok ? await response.json() : null
      } catch {
        return null
      }
    },

    choose(item) {
      this.selected = this.multiple
        ? [...this.selected.filter((s) => s.id !== item.id), item]
        : [item]
      this.query = ''
      this.results = []
      this.status = null
      this.emit()
    },

    remove(item) {
      this.selected = this.selected.filter((s) => s.id !== item.id)
      this.emit()
    },

    emit() {
      this.$emit('input', toRelationship(this.selected, this.multiple))
    },

    /**
     * The JSON:API index, for finding a target's bundles when the field allows
     * any of them. Keyed by language prefix, so the map itself is one level in.
     */
    async index() {
      try {
        return (await this.$druxt.getIndex()) || {}
      } catch {
        return {}
      }
    },
  },
}
</script>
