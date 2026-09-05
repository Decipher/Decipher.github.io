require('dotenv').config({ path: '../.env' })

const baseUrl = process.env.BASE_URL || 'http://quickstart-druxt-serverless.ddev.site'


// Bound to 0.0.0.0, Nuxt reports the container-internal interface IP as
// its listen URL - unreachable from the host. Rewrite the reported URL
// only: the bind stays 0.0.0.0 so container port forwarding keeps working.
const localhostListenURL = function () {
  this.nuxt.hook('listen', (server, listener) => {
    listener.host = 'localhost'
    listener.url = `http://localhost:${listener.port}/`
  })
}

export default {
  // Target full static build.
  target: 'static',

  // Serving path. A `<user>.github.io` user site serves from the domain root
  // and needs nothing here, which is why the PoC targets one. A project site at
  // `/<repo>/`, or any other subpath, needs its base set at build time because
  // a static build bakes asset paths in.
  router: {
    base: process.env.ROUTER_BASE || '/',
  },

  // Ensure the root route is generated and crawled.
  generate: {
    routes: ['/']
  },

  // Nuxt 2 defaults to binding 'localhost' (loopback only), which is not
  // reachable through devcontainer/DevPod port forwarding - the forwarded
  // port maps to the container's network interface, not its loopback.
  // Only affects `dev`/`start` (local preview) - `generate`'s static
  // output has no server to bind.
  // https://v2.nuxt.com/docs/configuration-glossary/configuration-server/
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: process.env.PORT || 3000
  },

  // Global page headers: https://go.nuxtjs.dev/config-head
  head: {
    title: 'quickstart-druxt-site',
    htmlAttrs: {
      lang: 'en'
    },
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'description', name: 'description', content: '' },
      { name: 'format-detection', content: 'telephone=no' }
    ],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
    ]
  },

  // Global CSS: https://go.nuxtjs.dev/config-css
  css: [
    // Self-hosted, per the design system: no Google Fonts link tags, and no
    // dependency on what a given machine happens to have installed. That
    // matters beyond preference here, because the visual baselines compare
    // rendered text: with a fallback stack, the same page renders differently
    // on a developer's machine and on a CI runner, and the diff is the fonts
    // rather than anything anyone changed.
    //
    // Only the weights actually used, so this stays a few files rather than
    // the whole family.
    '@fontsource/archivo/400.css',
    '@fontsource/archivo/600.css',
    '@fontsource/jetbrains-mono/400.css',
    '~/assets/css/main.css',
  ],

  // Plugins to run before rendering page: https://go.nuxtjs.dev/config-plugins
  plugins: [
    // Client only: the backend this site is edited against is resolved in the
    // browser at runtime, and must not be baked into the generated HTML.
    '~/plugins/authoring.client.js',
    { src: '~/plugins/authoring-auth.js', mode: 'client' },
    '~/plugins/authoring-github.client.js',
  ],

  // Values the authoring layer needs at runtime. For a static target these are
  // baked in at generate time, which is fine: they are stable. The backend URL
  // is deliberately NOT here - that is discovered in the browser, because the
  // backend does not exist when the site is built.
  publicRuntimeConfig: {
    // Resolved once, when the site is generated. The footer shows when the
    // site was built, which is a fact about the build; reading the browser's
    // clock instead made it change after deployment, and moved the visual
    // baseline every time the date rolled over in UTC.
    builtAt: new Date().toISOString(),
    authoring: {
      // Where a session provider publishes the live backend, if anywhere.
      //
      // Derived from the repository when nothing sets it, because a build that
      // does not know where sessions publish cannot ever find one: it returns
      // early before fetching anything, and the interface sits on "Building..."
      // about a backend that came up minutes ago. The deploy workflow set no
      // such variable, so that was every deployed build.
      sessionRecordUrl:
        process.env.SESSION_RECORD_URL ||
        (process.env.CONTENT_REPOSITORY || process.env.GITHUB_REPOSITORY
          ? `https://raw.githubusercontent.com/${
              process.env.CONTENT_REPOSITORY || process.env.GITHUB_REPOSITORY
            }/${process.env.SESSION_BRANCH || 'session'}/session.json`
          : ''),
      // The OAuth consumer. Provisioning pins this so it is stable across
      // sessions, which is the whole reason the frontend can hold it at build
      // time. The default matches `.devtools/provision-authoring`, so a build
      // that never saw a provisioned backend (CI, a fresh clone) still sends
      // the right client id rather than an empty one, which fails login with a
      // confusing `invalid_client`.
      clientId: process.env.OAUTH_CLIENT_ID || 'dfdd3969-6fe2-4a6f-92bb-82b6f59013ed',
      // Where a change request goes. Defaulted from the repository this site is
      // built from, so a fork gets its own without editing anything, and
      // overridable for a build that publishes somewhere else.
      repository: process.env.CONTENT_REPOSITORY || process.env.GITHUB_REPOSITORY || '',
      // The workflow that stands a backend up on demand.
      workflow: process.env.AUTHORING_WORKFLOW || 'authoring.yml',
    },
  },

  // Auto import components: https://go.nuxtjs.dev/config-components
  components: true,

  // Modules for dev and build (recommended): https://go.nuxtjs.dev/config-modules
  // @nuxt/image is genuinely build-time for Nuxt 2 (its docs say
  // buildModules) - it stays here.
  buildModules: [
    ['@nuxt/image', { domains: [baseUrl] }],
    // Tailwind. The design tokens live in tailwind.config.js and
    // assets/css/main.css, following the stuar.tc design system.
    '@nuxtjs/tailwindcss',
  ],

  tailwindcss: {
    // main.css is listed in `css` above, so the module must not inject its own
    // copy as well: two copies of the base layer double every reset rule.
    cssPath: false,
    viewer: false,
  },

  // Modules: https://go.nuxtjs.dev/config-modules
  //
  // Druxt belongs in `modules`, NOT `buildModules`: Nuxt 2 does not load
  // buildModules on `nuxt start`, so anything runtime the module
  // registers (the @nuxtjs/proxy serverMiddleware behind
  // `druxt.proxy.api`, axios defaults) silently vanishes from the local
  // production preview. Deployed static output never has a server
  // anyway - there the /jsonapi proxy is a host-level rewrite concern -
  // but `npm start` locally should behave like dev does. Matches the
  // druxt.js monorepo's own example placement.
  modules: [
    'druxt-site',
    localhostListenURL,
  ],

  // DruxtJS: https://druxtjs.org
  druxt: {
    baseUrl,
    // No API proxy. It rewrites Druxt's requests to be origin-relative and
    // relies on a serverMiddleware to forward them, which a full static build
    // deployed to a static host does not have. With it on, `/jsonapi` honoured
    // the runtime backend but `/router/translate-path` was still requested from
    // the site's own origin, where nothing answers. Absolute requests to the
    // connected backend are what CORS is configured for.
    proxy: { api: false },
    // Disable deprecated Entity fields.
    entity: { components: { fields: false }},
    // Disable the router middleware (redirect support) in favour of serverless.
    router: { middleware: false },
    // Set the default theme to render Site regions.
    site: { theme: 'olivero' },
  },

  // Build Configuration: https://go.nuxtjs.dev/config-build
  build: {
  }
}
