<template>
  <div class="authoring-login">
    <button
      type="button"
      class="font-mono text-xs uppercase tracking-eyebrow text-muted hover:text-accent underline transition-colors"
      data-testid="authoring-login-trigger"
      @click="open"
    >
      {{ triggerLabel }}
    </button>

    <div
      v-if="dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink bg-opacity-50 p-4"
      data-testid="authoring-login-dialog"
      @click.self="close"
    >
      <div
        class="w-full max-w-md rounded-lg bg-surface border border-hairline shadow-xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="al-title"
      >
        <p class="eyebrow mb-2">Authoring</p>
        <h2 id="al-title" class="text-xl mb-3">{{ title }}</h2>

        <!-- Step one: no backend, so there is nothing to log in to yet. -->
        <template v-if="!connected">
          <p class="text-sm text-body mb-4">
            This site is static. Point it at a Drupal backend to sign in and edit.
          </p>
          <label class="eyebrow block mb-1.5" for="al-url">Backend URL</label>
          <input
            id="al-url"
            v-model="url"
            type="url"
            class="w-full rounded border border-hairline bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none"
            data-testid="authoring-backend-url"
            placeholder="https://something.trycloudflare.com"
            :disabled="checking"
            @keyup.enter="verify"
          />
          <p v-if="error" class="text-sm text-accent mt-3" data-testid="authoring-error">
            {{ error }}
          </p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90 disabled:opacity-60 transition-opacity"
              :disabled="checking"
              data-testid="authoring-verify"
              @click="verify"
            >
              {{ checking ? 'Verifying...' : 'Verify' }}
            </button>
            <button type="button" class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink hover:text-ink transition-colors" @click="close">Cancel</button>
          </div>
        </template>

        <!-- Step two: a verified backend, so offer the actual login. -->
        <template v-else-if="!authenticated">
          <p class="text-sm text-body mb-4">
            Connected to
            <code class="font-mono text-ink" data-testid="authoring-backend-host">{{ host }}</code>.
          </p>
          <p v-if="error" class="text-sm text-accent mt-3" data-testid="authoring-error">
            {{ error }}
          </p>
          <p class="text-sm text-muted mt-3">
            The page still shows content from when the site was built. Reload to
            read it from this backend instead.
          </p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button type="button" class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90 transition-opacity" data-testid="authoring-continue" @click="login">
              Log in with Drupal
            </button>
            <button type="button" class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink hover:text-ink transition-colors" data-testid="authoring-reload" @click="reload">
              Reload
            </button>
            <button type="button" class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink hover:text-ink transition-colors" data-testid="authoring-disconnect" @click="disconnect">
              Disconnect
            </button>
          </div>
        </template>

        <!-- Step three: signed in. -->
        <template v-else>
          <p class="text-sm text-body mb-4">
            Signed in as <strong class="text-ink" data-testid="authoring-account">{{ accountName }}</strong>
            on <code>{{ host }}</code>.
          </p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button type="button" class="rounded bg-accent px-3 py-1.5 text-sm text-accent-contrast hover:opacity-90 transition-opacity" data-testid="authoring-logout" @click="logout">Log out</button>
            <button type="button" class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink hover:text-ink transition-colors" data-testid="authoring-disconnect" @click="disconnect">
              Disconnect
            </button>
            <button type="button" class="rounded border border-hairline px-3 py-1.5 text-sm text-body hover:border-ink hover:text-ink transition-colors" @click="close">Close</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AuthoringLogin',

  data: () => ({
    dialog: false,
    url: '',
    checking: false,
    error: null,
  }),

  computed: {
    // Both plugins are client-only, so neither exists while `nuxt generate`
    // renders these pages. Without the guards the static build fails on every
    // route.
    state() {
      return (this.$authoring && this.$authoring.state) || null
    },

    connected() {
      return Boolean(this.state && this.state.status === 'connected')
    },

    authenticated() {
      return Boolean(this.$authoringAuth && this.$authoringAuth.authenticated)
    },

    host() {
      return this.state && this.state.url ? this.state.url.replace(/^https?:\/\//, '') : ''
    },

    accountName() {
      const account = this.$authoringAuth && this.$authoringAuth.account
      return (account && (account.name || account.preferred_username)) || 'this account'
    },

    triggerLabel() {
      return this.authenticated ? 'Account' : 'Log in'
    },

    title() {
      if (this.authenticated) return 'Account'
      return this.connected ? 'Log in' : 'Connect a backend'
    },
  },

  methods: {
    open() {
      this.error = null
      this.url = (this.state && this.state.url) || ''
      this.dialog = true
    },

    close() {
      this.dialog = false
    },

    async verify() {
      this.checking = true
      this.error = null
      const ok = await this.$authoring.connect(this.url)
      this.checking = false
      if (!ok) this.error = this.state.error
      // Connecting does not change what is on screen. The page was rendered
      // from a payload baked at build time, so the dialog offers a reload
      // rather than doing it unannounced.
    },

    async login() {
      this.error = null
      try {
        await this.$authoringAuth.login()
      } catch (e) {
        this.error = e.message
      }
    },

    /**
     * Forget the backend entirely: the connection, the token, and the
     * remembered URL.
     *
     * Distinct from logging out, which ends the Drupal session but keeps the
     * site pointed at the backend. Disconnecting puts the site back to exactly
     * what a visitor gets, which is also the way out when a backend has gone
     * away and its stored URL would otherwise be retried on every load.
     */
    disconnect() {
      this.$authoring.disconnect()
      this.$authoringAuth.logout()
      this.url = ''
      this.error = null
      // Reload, or the page keeps showing what it fetched from the backend.
      // Connecting discards the static payload so the page can render live;
      // there is nothing left in memory to fall back to, and the built content
      // only comes back on a fresh load. Without this, disconnecting looks like
      // it did nothing.
      //
      // Dropping `?backend=` on the way: it is the highest priority source, so
      // reloading with it still in the address bar reconnects immediately and
      // the disconnect appears to fail.
      this.reload({ forget: true })
    },

    /**
     * Reload so the whole page comes from the connected backend.
     *
     * Not `$nuxt.refresh()`: under Nuxt 2 full static that serves the payload
     * baked at generate time, and Druxt caches every resource it has already
     * seen, so neither re-reads the backend. A reload re-runs the plugin first,
     * which points the client at the backend before anything fetches.
     *
     * Offered rather than done automatically. Navigating out from under someone
     * mid-task, to fix something they may not have noticed, is worse than
     * telling them what it will do.
     */
    reload({ forget = false } = {}) {
      if (!forget) {
        window.location.reload()
        return
      }
      const url = new URL(window.location.href)
      url.searchParams.delete('backend')
      window.location.replace(url.toString())
    },

    async logout() {
      this.$authoringAuth.logout()
      this.close()
      // Back to what an anonymous visitor would see, rather than leaving
      // authenticated content on screen after signing out.
      this.reload()
    },
  },
}
</script>
