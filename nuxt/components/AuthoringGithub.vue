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
        class="mt-2 flex items-center gap-2 rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="state.starting"
        data-testid="github-start-backend"
        @click="startBackend"
      >
        <!--
          Drawn rather than a character, so it turns rather than flickering, and
          hidden from a reader who is not looking at it.
        -->
        <span
          v-if="state.starting"
          class="authoring-spinner"
          aria-hidden="true"
          data-testid="github-spinner"
        ></span>
        {{ startLabel }}
      </button>

      <p
        v-if="startMessage || runOutcome"
        class="mt-1 text-sm"
        :class="runFailed ? 'text-accent' : 'text-muted'"
        data-testid="github-start-message"
      >
        {{ runOutcome || startMessage }}
        <!--
          The dispatch answers with no run id, so this link arrives a few
          seconds after the click rather than with it.
        -->
        <a
          v-if="state.run"
          :href="state.run.url"
          target="_blank"
          rel="noreferrer noopener"
          data-testid="github-run-link"
          >Watch the job</a
        >
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
    return { token: '', repository: '', startMessage: null }
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

    /**
     * What became of the run, once it is over.
     *
     * A job that fails and says nothing is worse than one that never started:
     * the author waits for a backend that is not coming.
     */
    runOutcome() {
      const run = this.state.run
      if (!run || !run.conclusion) return null
      if (run.conclusion === 'success') return 'The backend finished its run.'
      if (run.conclusion === 'cancelled') return 'That run was cancelled.'
      return `That run ${run.conclusion}. Nothing is listening.`
    },

    runFailed() {
      const conclusion = (this.state.run || {}).conclusion
      return Boolean(conclusion) && conclusion !== 'success'
    },

    /** Says which part of starting it is in, rather than just "starting". */
    startLabel() {
      if (!this.state.starting) return 'Start a backend'
      if (!this.state.run) return 'Asking GitHub...'
      return this.state.run.status === 'queued' ? 'Queued...' : 'Building...'
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
      this.startMessage = null
      const result = await this.$authoringGithub.startBackend()
      this.startMessage = result.ok
        ? 'It takes a few minutes. The site connects itself when the backend is up.'
        : result.reason
    },

    signOut() {
      this.$authoringGithub.signOut()
    },
  },
}
</script>

<style>
.authoring-spinner {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border: 1.5px solid rgb(var(--c-hairline));
  border-top-color: rgb(var(--c-accent));
  border-radius: 50%;
  animation: authoring-spin 700ms linear infinite;
}

@keyframes authoring-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Someone who has asked not to see movement should not be made to. */
@media (prefers-reduced-motion: reduce) {
  .authoring-spinner {
    animation: none;
    border-top-color: rgb(var(--c-hairline));
  }
}
</style>
