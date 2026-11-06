<template>
  <div
    class="deck-session"
    :class="{ 'deck-session--live': live, 'deck-session--failed': failed }"
    data-testid="deck-session-panel"
  >
    <div class="deck-session__head">
      <span class="deck-session__status" data-testid="deck-session-status">{{ status }}</span>
      <span v-if="awaiting" class="deck-session__clock" data-testid="deck-session-clock">{{ elapsed }}</span>
    </div>

    <div class="deck-session__body">
      <!-- No backend: start one on GitHub and watch it build, or point at one. -->
      <template v-if="!connected">
        <template v-if="awaiting">
          <ol v-if="steps.length" class="deck-session__steps">
            <li
              v-for="(step, i) in steps"
              :key="i"
              class="deck-session__step"
              :class="`deck-session__step--${stepState(step)}`"
              data-testid="deck-session-step"
            >
              {{ step.name }}
            </li>
          </ol>
          <p v-else class="deck-session__line">Waiting for GitHub to pick the run up.</p>
          <div class="deck-session__actions">
            <a :href="run ? run.url : workflowUrl" target="_blank" rel="noreferrer noopener" class="deck-session__button" data-testid="deck-session-run">{{ run ? 'watch on GitHub' : 'open the Run page' }}</a>
            <button type="button" class="deck-session__button" data-testid="deck-session-stop" @click="stop">stop waiting</button>
          </div>
        </template>
        <template v-else>
          <p class="deck-session__line">Start one on GitHub and watch it build, or connect one already running.</p>
          <div class="deck-session__actions">
            <button
              v-if="workflowUrl"
              type="button"
              class="deck-session__button deck-session__button--primary"
              data-testid="deck-session-start"
              @click="start"
            >
              start a backend on GitHub
            </button>
            <button type="button" class="deck-session__button" data-testid="deck-session-connect" @click="connect">
              connect one
            </button>
          </div>
          <p v-if="awaitMessage" class="deck-session__line deck-session__line--note" data-testid="deck-session-message">{{ awaitMessage }}</p>
        </template>
      </template>

      <!-- A backend, and nobody signed in to it yet. -->
      <template v-else-if="!authenticated">
        <p class="deck-session__line">
          Connected to <code class="deck-session__host">{{ host }}</code>. Nobody is signed in yet.
        </p>
        <div class="deck-session__actions">
          <button type="button" class="deck-session__button deck-session__button--primary" data-testid="deck-session-login" @click="login">
            log in
          </button>
        </div>
        <p v-if="error" class="deck-session__line deck-session__line--note" data-testid="deck-session-error">{{ error }}</p>
      </template>
    </div>
  </div>
</template>

<script>
/**
 * The session, started and joined from the slide that is about it.
 *
 * On the deployed deck there is no backend until somebody starts one, and the
 * sign-in demo is where that happens. Rather than send the presenter to a
 * dialog, the stage of a demo slide offers it: start a backend on GitHub and
 * watch its run build, step by step, from the repository's public Actions
 * API; or connect one already running; then log in. Once signed in the panel
 * leaves the stage to the demo.
 */
export default {
  name: 'DeckSession',

  data: () => ({ now: Date.now(), error: null, ticker: null }),

  computed: {
    ice() {
      return this.$druxtIce || null
    },
    github() {
      return this.$authoringGithub || null
    },
    connected() {
      return Boolean(this.ice && this.ice.state.status === 'connected')
    },
    authenticated() {
      return Boolean(this.ice && this.ice.auth && this.ice.auth.authenticated)
    },
    host() {
      const url = (this.ice && this.ice.state.url) || ''
      return url.replace(/^https?:\/\//, '')
    },
    workflowUrl() {
      return (this.github && this.github.workflowUrl) || ''
    },
    awaiting() {
      return Boolean(this.github && this.github.state.awaiting)
    },
    awaitMessage() {
      return (this.github && this.github.state.awaitMessage) || ''
    },
    run() {
      return (this.github && this.github.state.awaitRun) || null
    },
    steps() {
      return (this.github && this.github.state.steps) || []
    },
    /** How long the wait has been going, as m:ss. */
    elapsed() {
      const since = this.github && this.github.state.awaitSince
      if (!since) return ''
      const seconds = Math.max(0, Math.floor((this.now - new Date(since).getTime()) / 1000))
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    },
    /** The head's one line: where things stand, without the clock. */
    status() {
      if (this.connected) return 'Connected'
      if (!this.awaiting) return 'No backend'
      if (!this.run) return 'Starting on GitHub'
      if (this.failed) return `The run ${this.run.conclusion}`
      const done = this.steps.filter((step) => step.status === 'completed').length
      return `Building · ${done} of ${this.steps.length} steps`
    },
    failed() {
      return Boolean(this.run && this.run.conclusion && this.run.conclusion !== 'success')
    },
    live() {
      return this.connected || (this.awaiting && Boolean(this.run) && !this.failed)
    },
  },

  watch: {
    awaiting: { immediate: true, handler: 'tick' },
  },

  beforeDestroy() {
    if (this.ticker) window.clearInterval(this.ticker)
  },

  methods: {
    /** A clock that runs only while there is something to time. */
    tick(on) {
      if (this.ticker) window.clearInterval(this.ticker)
      this.ticker = null
      if (!on) return
      this.now = Date.now()
      this.ticker = window.setInterval(() => {
        this.now = Date.now()
      }, 1000)
    },
    stepState(step) {
      if (step.status !== 'completed') return step.status === 'in_progress' ? 'running' : 'queued'
      return step.conclusion === 'success' || step.conclusion === 'skipped' ? 'done' : 'failed'
    },
    start() {
      window.open(this.workflowUrl, '_blank', 'noopener')
      this.github.awaitStartedBackend()
    },
    stop() {
      this.github.stopAwaiting()
    },
    connect() {
      this.ice.openLogin()
    },
    async login() {
      this.error = null
      try {
        await this.ice.auth.login()
      } catch (e) {
        this.error = e.message
      }
    },
  },
}
</script>
