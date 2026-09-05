<template>
  <div class="authoring-cart p-5" data-testid="authoring-cart">
    <div class="mb-3 flex items-baseline justify-between">
      <p class="eyebrow">Edits</p>
      <button
        type="button"
        class="font-mono text-xs text-muted underline hover:text-accent"
        data-testid="authoring-cart-close"
        @click="close"
      >
        Close
      </button>
    </div>

    <!--
      Tabs rather than one long column. The drawer already holds the changes,
      the way to add content and the ways to send it, and block and paragraph
      placement are coming, so the list is data: another panel is an entry here
      rather than a rewrite.
    -->
    <nav class="mb-4 flex gap-4 border-b border-hairline" aria-label="Authoring">
      <button
        v-for="panel of panels"
        :key="panel.id"
        type="button"
        class="-mb-px border-b-2 pb-2 font-mono text-xs uppercase tracking-eyebrow transition-colors"
        :class="
          tab === panel.id
            ? 'border-accent text-accent'
            : 'border-transparent text-muted hover:text-ink'
        "
        :aria-selected="String(tab === panel.id)"
        role="tab"
        :data-testid="`cart-tab-${panel.id}`"
        @click="tab = panel.id"
      >
        {{ panel.label }}<span v-if="panel.count" class="ml-1">{{ panel.count }}</span>
      </button>
    </nav>

    <div v-show="tab === 'add'">
      <AuthoringAdd />
    </div>

    <div v-show="tab === 'changes'">

    <p
      v-if="!count && !unstaged.length"
      class="text-sm text-muted"
      data-testid="authoring-cart-empty"
    >
      Nothing edited yet. Turn on Edit and change something.
    </p>
    <p v-if="count" class="mb-3 text-sm text-body" data-testid="authoring-cart-count">
      {{ count }} {{ count === 1 ? 'change' : 'changes' }} staged, not yet sent anywhere.
    </p>

    <p v-if="!persistent" class="text-sm text-muted mb-3" data-testid="authoring-cart-volatile">
      This browser will not keep them past a reload.
    </p>

    <!--
      Two sections, the way `git status` has two. The cart already holds both
      states; showing them as one list made an unstaged edit look like something
      that was about to be sent.
    -->
    <section v-if="resources.length" class="mb-4">
      <p class="eyebrow mb-2">Staged</p>
      <ul class="space-y-2">
        <li v-for="resource in resources" :key="resource.type + resource.id" class="text-sm">
          <div class="flex items-baseline gap-2">
            <input
              :id="`pick-${resource.type}-${resource.id}`"
              type="checkbox"
              class="authoring-check"
              checked
              :aria-label="`Staged: ${labelFor(resource.id)}`"
              :data-testid="`cart-select-${resource.id}`"
              @change="unstage(resource, $event)"
            />
            <button
              type="button"
              class="flex min-w-0 flex-1 items-baseline gap-1 text-left"
              :aria-expanded="String(isExpanded(resource))"
              data-testid="authoring-cart-expand"
              @click="toggle(resource)"
            >
              <span class="w-3 shrink-0 font-mono text-xs text-muted" aria-hidden="true">
                {{ isExpanded(resource) ? '-' : '+' }}
              </span>
              <!--
                What will actually happen to this, taken from the request the
                commit will make rather than described alongside it. Creating,
                changing and removing read very differently to someone deciding
                what to send.
              -->
              <span
                class="shrink-0 rounded px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-eyebrow"
                :class="methodClass(resource)"
                :title="`${requestMethod(resource)} request`"
                :data-testid="`cart-method-${resource.id}`"
                >{{ methodLabel(resource) }}</span
              >
              <span
                class="truncate"
                :class="resource.deleted ? 'text-muted line-through' : 'text-ink'"
                >{{ labelFor(resource.id) }}</span
              >
              <span v-if="!resource.deleted" class="truncate text-muted">
                {{ fieldNames(resource) }}
              </span>
            </button>
            <button
              type="button"
              class="shrink-0 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
              :data-testid="`cart-show-${resource.id}`"
              @click="reveal(resource)"
            >
              Show
            </button>
            <button
              type="button"
              class="shrink-0 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
              :data-testid="`cart-preview-${resource.id}`"
              @click="preview(resource)"
            >
              Preview
            </button>
            <button
              v-if="routeFor(resource)"
              type="button"
              class="shrink-0 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
              :data-testid="`cart-go-${resource.id}`"
              @click="go(resource)"
            >
              Go
            </button>
          </div>

          <p
            v-if="dependsOn(resource).length"
            class="ml-6 font-mono text-[0.6875rem] text-muted"
            data-testid="cart-depends"
          >
            needs {{ dependsOn(resource).join(', ') }}
          </p>

          <!-- What is actually going to be sent, rather than a summary of it. -->
          <AuthoringJsonTree
            v-if="isExpanded(resource)"
            :value="wireShape(resource)"
            :before="{ attributes: resource.before || {}, relationships: resource.before || {} }"
            class="ml-6 mt-1 border-l border-hairline pl-2"
          />

          <div class="ml-6 mt-1">
            <button
              type="button"
              class="font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
              :data-testid="`cart-discard-${resource.id}`"
              @click="discardOne(resource)"
            >
              Discard
            </button>
          </div>

          <span
            v-if="errorFor(resource)"
            class="ml-6 block text-accent"
            data-testid="authoring-cart-error"
          >
            {{ errorFor(resource) }}
          </span>
        </li>
      </ul>
    </section>

    <section v-if="unstaged.length" class="mb-4">
      <p class="eyebrow mb-2">Unstaged</p>
      <ul class="space-y-1">
        <li
          v-for="item in unstaged"
          :key="item.key"
          class="flex items-baseline gap-2 text-sm"
          data-testid="cart-unstaged-row"
        >
          <input
            type="checkbox"
            class="authoring-check"
            :aria-label="`Stage ${item.label}`"
            :data-testid="`cart-stage-${item.id}`"
            @change="stageDraft(item)"
          />
          <span class="flex min-w-0 flex-1 items-baseline gap-2 truncate">
            <span
              class="shrink-0 rounded border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-eyebrow"
              :class="item.deleted ? 'border-accent text-accent' : 'border-hairline text-muted'"
              :data-testid="`cart-method-draft-${item.id}`"
              >{{ methodLabel(item) }}</span
            >
            <span :class="item.deleted ? 'text-muted line-through' : 'text-ink'">
              {{ item.label }}
            </span>
            <span v-if="!item.deleted" class="text-muted">{{ item.fields }}</span>
          </span>
          <button
            type="button"
            class="shrink-0 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
            :data-testid="`cart-show-draft-${item.id}`"
            @click="reveal(item)"
          >
            Show
          </button>
          <button
            type="button"
            class="shrink-0 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
            :data-testid="`cart-discard-draft-${item.id}`"
            @click="discardDraft(item)"
          >
            Discard
          </button>
        </li>
      </ul>
      <p class="mt-2 text-sm text-muted">
        Kept, and not sent. Tick one to stage it.
      </p>
    </section>

    <p v-if="refusal" class="mb-3 text-sm text-accent" data-testid="cart-refusal">{{ refusal }}</p>
    </div>

    <div v-show="tab === 'send'">

    <div v-if="count" class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90 disabled:opacity-60"
        :disabled="!canCommit || committing"
        data-testid="authoring-cart-commit"
        @click="commit"
      >
        {{ committing ? 'Sending...' : 'Commit to backend' }}
      </button>
      <button
        type="button"
        class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90 disabled:opacity-60"
        :disabled="!githubReady || opening"
        data-testid="authoring-cart-pr"
        @click="openPullRequest"
      >
        {{ opening ? 'Opening...' : 'Open a pull request' }}
      </button>
      <button
        type="button"
        class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
        data-testid="authoring-cart-download"
        @click="download"
      >
        Download for a change request
      </button>
      <button
        type="button"
        class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink"
        data-testid="authoring-cart-discard"
        @click="discard"
      >
        Discard
      </button>
    </div>

    <p v-if="!canCommit" class="text-sm text-muted mt-3" data-testid="authoring-cart-blocked">
      {{ blockedReason }}
    </p>

    </div>

    <AuthoringPreview
      v-if="previewing"
      :type="previewing.type"
      :uuid="previewing.id"
      @close="previewing = null"
    />

    <!--
      The second destination. A backend is for validating against a real site;
      this is for getting the work reviewed and published, and needs neither a
      backend nor a session.
    -->
    <!--
      Always, not only once something is staged. Signing in is what lets an
      author start a backend, so requiring an edit first meant arriving at an
      empty site with no way to get one.
    -->
    <div class="mt-4">
      <p class="eyebrow mb-2">GitHub</p>
      <AuthoringGithub />
      <p v-if="pullRequest" class="mt-2 text-sm text-body" data-testid="authoring-cart-pr-open">
        Opened
        <a :href="pullRequest" target="_blank" rel="noreferrer noopener">the pull request</a>.
      </p>
      <p v-if="prError" class="mt-2 text-sm text-accent" data-testid="authoring-cart-pr-error">
        {{ prError }}
      </p>
    </div>
    <p v-if="result" class="text-sm text-muted mt-3" data-testid="authoring-cart-result">
      {{ result }}
    </p>
  </div>
</template>

<script>
import {
  dependencyMap,
  exportCart,
  exportSummary,
  requestMethod,
  requiredBy,
  tidyResource,
} from '../lib/cart.mjs'
import { openChangeRequest } from '../lib/github-client.mjs'

export default {
  name: 'AuthoringCart',

  data() {
    return {
      result: null,
      expanded: {},
      refusal: null,
      opening: false,
      pullRequest: null,
      prError: null,
      previewing: null,
      tab: 'changes',
    }
  },

  computed: {
    count() {
      return this.$store.getters['authoringCart/count']
    },
    resources() {
      return this.$store.getters['authoringCart/staged']
    },
    persistent() {
      return this.$store.state.authoringCart.persistent
    },
    committing() {
      return this.$store.state.authoringCart.committing
    },
    backendUrl() {
      return this.$authoring && this.$authoring.state.url
    },
    token() {
      return this.$authoringAuth && this.$authoringAuth.token
    },
    canCommit() {
      return Boolean(this.backendUrl && this.token)
    },
    /** Edits kept but not staged, listed apart from what is going to be sent. */
    unstaged() {
      const drafts = this.$store.state.authoringCart.drafts || {}
      return Object.entries(drafts).map(([key, draft]) => {
        const [type, id] = key.split(':')
        const attributes = draft.attributes || {}
        return {
          key,
          type,
          id,
          deleted: Boolean(draft.deleted),
          label: attributes.title || attributes.name || this.labelOnPage(type, id) || type,
          fields: Object.keys({ ...attributes, ...(draft.relationships || {}) }).join(', '),
        }
      })
    },

    /**
     * The panels, as data.
     *
     * Block placement and paragraph ordering are both coming, and both are a
     * surface of their own rather than another list in this one, so this stays
     * a list to add to.
     */
    panels() {
      return [
        { id: 'changes', label: 'Changes', count: this.count + this.unstaged.length },
        { id: 'add', label: 'Add' },
        { id: 'send', label: 'Send' },
      ]
    },

    githubReady() {
      return this.$authoringGithub && this.$authoringGithub.signedIn
    },

    // Says which half is missing, because "cannot commit" on its own sends
    // people looking in the wrong place.
    blockedReason() {
      if (!this.backendUrl) return 'Connect a backend to commit these.'
      if (!this.token) return 'Sign in to commit these.'
      return ''
    },
  },

  watch: {
    /**
     * Go back to the changes when there are none left to send.
     *
     * Discarding everything from the Send panel leaves the reader looking at
     * destinations for work that no longer exists, and the one thing worth
     * saying, that the cart is empty, on a panel they are not on.
     */
    count(to) {
      if (!to && !this.unstaged.length && this.tab === 'send') this.tab = 'changes'
    },
  },

  methods: {
    /** What this change cannot be sent without, named rather than by id. */
    dependsOn(resource) {
      const map = dependencyMap(this.resources)
      return (map.get(resource.id) || []).map((id) => this.labelFor(id))
    },

    labelFor(id) {
      const resource = this.resources.find((r) => r.id === id)
      if (!resource) return id
      const attributes = resource.attributes || {}
      // A deletion carries no fields at all, and an edit carries only what
      // changed, so the title is often not among them. The page knows it.
      return (
        attributes.title ||
        attributes.name ||
        this.labelOnPage(resource.type, resource.id) ||
        resource.type
      )
    },

    /**
     * Send the cart to GitHub as a pull request.
     *
     * The cart is left exactly as it is on success as well as on failure: what
     * has been proposed has not yet been published, and clearing it would tell
     * the author their work had landed when it is waiting for review.
     */
    async openPullRequest() {
      this.opening = true
      this.pullRequest = null
      this.prError = null

      const state = this.$authoringGithub.state
      const result = await openChangeRequest({
        repository: state.repository,
        token: state.token,
        exported: exportCart(this.$store.state.authoringCart.entries),
        base: state.defaultBranch,
        fetch: window.fetch.bind(window),
      })

      this.opening = false
      if (result.ok) this.pullRequest = result.url
      else this.prError = result.reason
    },

    /** The document that will be sent, without the cart's own bookkeeping. */
    wireShape(resource) {
      return tidyResource(resource)
    },

    /** What the page is calling this, when the change itself does not say. */
    labelOnPage(type, id) {
      const el = document.querySelector(
        `[data-authoring-entity="${type}:${id}"] [data-testid="entity-label"]`
      )
      return el ? el.textContent.trim() : ''
    },

    /**
     * Unstage, unless something staged still needs it.
     *
     * Said, not silently corrected: re-ticking a box the author just unticked
     * teaches them the control does not work. The refusal names what needs it.
     */
    unstage(resource, event) {
      this.refusal = null
      const staged = this.resources.map((r) => r.id)
      const needed = requiredBy(resource.id, staged, this.resources)
      if (needed.length) {
        this.refusal = `${this.labelFor(needed[0])} references this, so it stays staged.`
        // The browser has already ticked the box off. Nothing else changed, so
        // Vue will not re-render it, and the box would sit there claiming a
        // state the cart does not have.
        if (event && event.target) event.target.checked = true
        return
      }
      this.$store.dispatch('authoringCart/unstage', {
        type: resource.type,
        id: resource.id,
      })
    },

    stageDraft(item) {
      this.refusal = null
      this.$store.dispatch('authoringCart/stageDraft', { type: item.type, id: item.id })
    },

    discardOne(resource) {
      this.refusal = null
      this.$store.dispatch('authoringCart/discardOne', {
        type: resource.type,
        id: resource.id,
      })
    },

    discardDraft(item) {
      this.$store.dispatch('authoringCart/clearDraft', { type: item.type, id: item.id })
    },

    /** As the site will render it, in whichever display is asked for. */
    preview(resource) {
      this.refusal = null
      this.previewing = { type: resource.type, id: resource.id }
    },

    /**
     * Where this content lives, if it has somewhere.
     *
     * New content has no route until it exists, so the control is not offered
     * for it rather than offered and broken.
     */
    routeFor(resource) {
      if (resource.isNew) return null
      const attributes = resource.attributes || {}
      const alias = ((attributes.path || {}).alias || '').trim()
      if (alias) return alias
      const onPage = document.querySelector(
        `[data-authoring-entity="${resource.type}:${resource.id}"] [data-testid="entity-link"]`
      )
      return onPage ? onPage.getAttribute('href') : null
    },

    go(resource) {
      const route = this.routeFor(resource)
      if (route) this.$router.push(route)
    },

    /**
     * Take the reader to the thing the row is about.
     *
     * The drawer sits beside a page that may be long, and a list of changes you
     * then have to go and find is most of a navigation problem.
     */
    reveal(item) {
      const entity = document.querySelector(`[data-authoring-entity="${item.type}:${item.id}"]`)
      if (!entity) {
        this.refusal = 'That content is not on this page.'
        return
      }
      this.refusal = null

      // The fields that actually changed, where the page is showing them.
      // Falling back to the whole entity for a deletion, which is about all of
      // it, and for a change to something this display does not render.
      const changed = Object.keys({
        ...(item.attributes || {}),
        ...(item.relationships || {}),
      })
      const found = changed
        .map((field) => entity.querySelector(`[data-authoring-field="${field}"]`))
        .filter(Boolean)
      const targets = found.length ? found : [entity]

      targets[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
      for (const target of targets) target.classList.add('is-revealed')
      window.setTimeout(() => {
        for (const target of targets) target.classList.remove('is-revealed')
      }, 1800)
    },

    /** One resource's own tree, open or shut. Shut by default: the drawer is a
     * list first, and a reader opens the one they care about. */
    isExpanded(resource) {
      return Boolean(this.expanded[resource.type + resource.id])
    },

    toggle(resource) {
      const key = resource.type + resource.id
      this.$set(this.expanded, key, !this.expanded[key])
    },

    close() {
      this.$store.dispatch('authoringCart/setDrawerOpen', false)
    },

    /** The verb the commit will use, and a word for it. */
    methodLabel(resource) {
      return { POST: 'New', DELETE: 'Delete', PATCH: 'Update' }[this.requestMethod(resource)]
    },

    requestMethod(resource) {
      return requestMethod(resource)
    },

    methodClass(resource) {
      if (resource.deleted) return 'bg-accent text-accent-contrast'
      if (resource.isNew) return 'border border-accent text-accent'
      return 'border border-hairline text-muted'
    },

    fieldNames(resource) {
      if (resource.deleted) return ''
      const fields = Object.keys({ ...resource.attributes, ...resource.relationships })
      return fields.length ? fields.join(', ') : 'new'
    },

    errorFor(resource) {
      return this.$store.getters['authoringCart/errorFor'](resource.type, resource.id)
    },

    async commit() {
      this.result = null
      const outcome = await this.$store.dispatch('authoringCart/commit', {
        backendUrl: this.backendUrl,
        token: this.token,
      })
      this.result = outcome.ok
        ? `Sent ${outcome.sent}. The backend has them now.`
        : outcome.reason || `Sent ${outcome.sent}, ${outcome.failed} rejected and still staged.`
    },

    /**
     * Hand the cart over as a file.
     *
     * The path that needs no backend: the same resources, as a document to
     * attach to a change request. Not a fetch, because there is deliberately
     * nothing to send it to.
     */
    download() {
      const entries = this.$store.state.authoringCart.entries
      const blob = new Blob([JSON.stringify(exportCart(entries), null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'authoring-cart.json'
      link.click()
      URL.revokeObjectURL(url)
      this.result = exportSummary(entries)
    },

    discard() {
      this.$store.dispatch('authoringCart/discardAll')
      this.result = null
    },
  },
}
</script>

<style>
/*
 * The drawer is monospace and square, and a native checkbox is neither: it
 * arrives rounded, blue and sized to whatever the browser thinks, which reads
 * as a form control dropped into a design rather than part of one.
 *
 * Drawn rather than tinted, because `accent-color` cannot change the shape and
 * the shape is most of the problem.
 */
input.authoring-check {
  appearance: none;
  -webkit-appearance: none;
  flex: none;
  width: 0.875rem;
  height: 0.875rem;
  margin: 0;
  /* Darker than a hairline: at hairline weight an empty box reads as a
     disabled one rather than as something to tick. */
  border: 1px solid rgb(var(--c-muted));
  background-color: rgb(var(--c-paper));
  cursor: pointer;
  position: relative;
  top: 0.125rem;
  transition:
    border-color 120ms,
    background-color 120ms;
}

input.authoring-check:hover {
  border-color: rgb(var(--c-accent));
}

input.authoring-check:focus-visible {
  outline: 2px solid rgb(var(--c-accent));
  outline-offset: 1px;
}

input.authoring-check:checked {
  /* The palette is raw channels, so every use goes through rgb(). `--accent`
     does not exist, and an invalid shorthand silently leaves the box
     transparent with a white tick drawn on nothing. */
  background-color: rgb(var(--c-accent));
  border-color: rgb(var(--c-accent));
}

/* A tick, drawn as two borders rotated, so it needs no font and no image. */
input.authoring-check:checked::after {
  content: '';
  position: absolute;
  left: 0.25rem;
  top: 0.0625rem;
  width: 0.25rem;
  height: 0.5rem;
  border: solid rgb(var(--c-accent-contrast));
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
</style>
