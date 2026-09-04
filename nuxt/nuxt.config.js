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
  ],

  // Plugins to run before rendering page: https://go.nuxtjs.dev/config-plugins
  plugins: [
    // Client only: the backend this site is edited against is resolved in the
    // browser at runtime, and must not be baked into the generated HTML.
    '~/plugins/authoring.client.js',
    { src: '~/plugins/authoring-auth.js', mode: 'client' },
  ],

  // Values the authoring layer needs at runtime. For a static target these are
  // baked in at generate time, which is fine: they are stable. The backend URL
  // is deliberately NOT here - that is discovered in the browser, because the
  // backend does not exist when the site is built.
  publicRuntimeConfig: {
    authoring: {
      // Where a session provider publishes the live backend, if anywhere.
      sessionRecordUrl: process.env.SESSION_RECORD_URL || '',
      // The OAuth consumer, which provisioning pins so it is stable across
      // sessions and can be known at build time.
      clientId: process.env.OAUTH_CLIENT_ID || '',
    },
  },

  // Auto import components: https://go.nuxtjs.dev/config-components
  components: true,

  // Modules for dev and build (recommended): https://go.nuxtjs.dev/config-modules
  // @nuxt/image is genuinely build-time for Nuxt 2 (its docs say
  // buildModules) - it stays here.
  buildModules: [
    ['@nuxt/image', { domains: [baseUrl] }],
  ],

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
