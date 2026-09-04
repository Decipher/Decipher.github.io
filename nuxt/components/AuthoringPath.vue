<template>
  <div class="authoring-path">
    <input
      v-model="alias"
      type="text"
      placeholder="/example-page"
      :class="controlClass"
      data-testid="field-path"
      @blur="normalise"
    />
    <p class="mt-1.5 text-sm text-muted">
      The URL this content is reachable at. Leave it empty to use the default path.
    </p>
  </div>
</template>

<script>
/**
 * A URL alias.
 *
 * The field's value is an object, `{ alias, pid, langcode }`, not a string.
 * Only the alias is the author's to set: `pid` identifies the alias record and
 * `langcode` belongs to the entity, so both are carried through untouched
 * rather than rebuilt, which would detach the alias from its record.
 *
 * Drupal requires a leading slash and rejects the save without one, which is a
 * round trip to discover. Adding it on blur is the same correction Drupal's own
 * form makes.
 */
export default {
  name: 'AuthoringPath',

  props: {
    value: { type: Object, default: () => ({ alias: '', pid: null, langcode: null }) },
  },

  data() {
    return { alias: (this.value || {}).alias || '' }
  },

  computed: {
    controlClass() {
      return 'w-full rounded border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none'
    },
  },

  watch: {
    value: {
      deep: true,
      handler(to) {
        const alias = (to || {}).alias || ''
        if (alias !== this.alias) this.alias = alias
      },
    },
    alias() {
      this.emit()
    },
  },

  methods: {
    normalise() {
      const trimmed = this.alias.trim()
      this.alias = trimmed && !trimmed.startsWith('/') ? `/${trimmed}` : trimmed
    },

    emit() {
      // The rest of the value is preserved: rebuilding it would drop the `pid`
      // that ties this alias to its existing record.
      this.$emit('input', { ...(this.value || {}), alias: this.alias || null })
    },
  },
}
</script>
