<template>
  <div class="authoring-github">
    <template v-if="signedIn">
      <p class="text-sm text-body" data-testid="github-signed-in">
        Signed in to GitHub as <strong>{{ state.login }}</strong>
        <span class="text-muted"> for {{ state.repository }}</span>
      </p>
      <!--
        Only for someone who can actually start one. Contents and Pull requests
        are enough to propose a change; starting a backend also needs Actions,
        and offering a button that cannot work is worse than not offering it.
      -->
      <button
        v-if="state.canStartBackend"
        type="button"
        class="mt-2 block rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-accent hover:text-accent disabled:opacity-60"
        :disabled="starting"
        data-testid="github-start-backend"
        @click="startBackend"
      >
        {{ starting ? 'Starting...' : 'Start a backend' }}
      </button>
      <p v-if="startMessage" class="mt-1 text-sm text-muted" data-testid="github-start-message">
        {{ startMessage }}
      </p>

      <button
        type="button"
        class="mt-2 font-mono text-[0.6875rem] uppercase tracking-eyebrow text-muted underline hover:text-accent"
        data-testid="github-sign-out"
        @click="signOut"
      >
        Sign out of GitHub
      </button>
    </template>

    <template v-else>
      <label class="block">
        <span class="eyebrow mb-1.5 block">Repository</span>
        <input
          v-model="repository"
          type="text"
          placeholder="owner/repository"
          :class="controlClass"
          data-testid="github-repository"
        />
      </label>

      <label class="mt-2 block">
        <span class="eyebrow mb-1.5 block">GitHub token</span>
        <input
          v-model="token"
          type="password"
          autocomplete="off"
          placeholder="github_pat_..."
          :class="controlClass"
          data-testid="github-token"
        />
      </label>

      <!--
        Said here rather than in a README nobody opens. The permissions are the
        two this needs and no others, and a reader can check that claim against
        what the code does.
      -->
      <p class="mt-2 text-sm text-muted">
        A
        <a
          href="https://github.com/settings/personal-access-tokens/new"
          target="_blank"
          rel="noreferrer noopener"
          >fine-grained token</a
        >
        for this repository alone, with <strong>Contents</strong> and
        <strong>Pull requests</strong> set to read and write. Add
        <strong>Actions</strong> as well to start a backend from here. It is kept
        for this tab only and never sent anywhere but github.com.
      </p>

      <button
        type="button"
        class="mt-2 rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90 disabled:opacity-60"
        :disabled="!ready || checking"
        data-testid="github-sign-in"
        @click="signIn"
      >
        {{ checking ? 'Checking...' : 'Sign in with GitHub' }}
      </button>

      <p v-if="state.error" class="mt-2 text-sm text-accent" data-testid="github-error">
        {{ state.error }}
      </p>
    </template>
  </div>
</template>

<script>
/**
 * Signing in to GitHub, so a change can leave without a backend.
 *
 * A token rather than a button that says "log in with GitHub", because the
 * device flow cannot be reached from a browser: github.com sends no CORS
 * headers on it, and every other flow needs a client secret and so a server.
 * Being honest about that in the interface is better than a button that
 * pretends to be OAuth and is not.
 */
export default {
  name: 'AuthoringGithub',

  data() {
    return { token: '', repository: '', starting: false, startMessage: null }
  },

  computed: {
    state() {
      return this.$authoringGithub.state
    },
    signedIn() {
      return this.$authoringGithub.signedIn
    },
    checking() {
      return this.state.status === 'checking'
    },
    ready() {
      return Boolean(this.token.trim() && this.repository.trim())
    },
    controlClass() {
      return 'w-full rounded border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none'
    },
  },

  created() {
    // The build knows which repository it came from, so most people never type
    // it. Still editable, because a fork's build may not.
    this.repository = this.state.repository || ''
  },

  methods: {
    async signIn() {
      const ok = await this.$authoringGithub.signIn(this.token.trim(), this.repository.trim())
      // Only on success: leaving it in the field after a refusal means the
      // author retypes a token they already have.
      if (ok) this.token = ''
    },

    /**
     * Ask GitHub Actions to stand a backend up.
     *
     * Nothing to wait for here: the dispatch answers with no run to follow, and
     * the session announces where it is by publishing its own record, which the
     * frontend already watches for.
     */
    async startBackend() {
      this.starting = true
      this.startMessage = null
      const result = await this.$authoringGithub.startBackend()
      this.starting = false
      this.startMessage = result.ok
        ? 'Asked GitHub to start one. It takes a few minutes, and the site connects itself when it is up.'
        : result.reason
    },

    signOut() {
      this.$authoringGithub.signOut()
    },
  },
}
</script>
