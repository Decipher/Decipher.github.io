<template>
  <div class="authoring-login">
    <button
      type="button"
      class="authoring-login__trigger"
      data-testid="authoring-login-trigger"
      @click="open"
    >
      {{ triggerLabel }}
    </button>

    <div
      v-if="dialog"
      class="authoring-login__backdrop"
      data-testid="authoring-login-dialog"
      @click.self="close"
    >
      <div class="authoring-login__panel" role="dialog" aria-modal="true" aria-labelledby="al-title">
        <h2 id="al-title" class="authoring-login__title">{{ title }}</h2>

        <!-- Step one: no backend, so there is nothing to log in to yet. -->
        <template v-if="!connected">
          <p class="authoring-login__blurb">
            This site is static. Point it at a Drupal backend to sign in and edit.
          </p>
          <label class="authoring-login__label" for="al-url">Backend URL</label>
          <input
            id="al-url"
            v-model="url"
            type="url"
            data-testid="authoring-backend-url"
            placeholder="https://something.trycloudflare.com"
            :disabled="checking"
            @keyup.enter="verify"
          />
          <p v-if="error" class="authoring-login__error" data-testid="authoring-error">
            {{ error }}
          </p>
          <div class="authoring-login__actions">
            <button type="button" :disabled="checking" data-testid="authoring-verify" @click="verify">
              {{ checking ? 'Verifying...' : 'Verify' }}
            </button>
            <button type="button" class="is-quiet" @click="close">Cancel</button>
          </div>
        </template>

        <!-- Step two: a verified backend, so offer the actual login. -->
        <template v-else-if="!authenticated">
          <p class="authoring-login__blurb">
            Connected to
            <code data-testid="authoring-backend-host">{{ host }}</code>.
          </p>
          <p v-if="error" class="authoring-login__error" data-testid="authoring-error">
            {{ error }}
          </p>
          <p class="authoring-login__note">
            The page still shows content from when the site was built. Reload to
            read it from this backend instead.
          </p>
          <div class="authoring-login__actions">
            <button type="button" data-testid="authoring-continue" @click="login">
              Log in with Drupal
            </button>
            <button type="button" class="is-quiet" data-testid="authoring-reload" @click="reload">
              Reload
            </button>
            <button type="button" class="is-quiet" data-testid="authoring-disconnect" @click="disconnect">
              Disconnect
            </button>
          </div>
        </template>

        <!-- Step three: signed in. -->
        <template v-else>
          <p class="authoring-login__blurb">
            Signed in as <strong data-testid="authoring-account">{{ accountName }}</strong>
            on <code>{{ host }}</code>.
          </p>
          <div class="authoring-login__actions">
            <button type="button" data-testid="authoring-logout" @click="logout">Log out</button>
            <button type="button" class="is-quiet" data-testid="authoring-disconnect" @click="disconnect">
              Disconnect
            </button>
            <button type="button" class="is-quiet" @click="close">Close</button>
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

<style scoped>
.authoring-login__trigger {
  background: none;
  border: 0;
  padding: 0.25rem 0.5rem;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.authoring-login__backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 1rem;
}

.authoring-login__panel {
  width: min(28rem, 100%);
  background: #fff;
  color: #1b1b1d;
  border-radius: 6px;
  padding: 1.25rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  font:
    15px/1.5 -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}

.authoring-login__title {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.authoring-login__blurb {
  margin: 0 0 0.9rem;
}

.authoring-login__label {
  display: block;
  margin-bottom: 0.3rem;
  font-weight: 600;
  font-size: 0.9rem;
}

.authoring-login__panel input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.6rem;
  border: 1px solid #b7b7b7;
  border-radius: 4px;
  font: inherit;
}

.authoring-login__note {
  margin: 0.6rem 0 0;
  color: #555;
  font-size: 0.9rem;
}

.authoring-login__error {
  margin: 0.6rem 0 0;
  color: #a4232a;
  font-size: 0.9rem;
}

.authoring-login__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.authoring-login__actions button {
  padding: 0.45rem 0.9rem;
  border: 1px solid #1b1b1d;
  border-radius: 4px;
  background: #1b1b1d;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.authoring-login__actions button.is-quiet {
  background: transparent;
  color: #1b1b1d;
  border-color: #b7b7b7;
}

.authoring-login__actions button[disabled] {
  opacity: 0.6;
  cursor: default;
}
</style>
