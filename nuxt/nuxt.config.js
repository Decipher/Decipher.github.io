import { DEFAULT_PACKAGES as CKEDITOR_PACKAGES } from '@druxt-contrib/ckeditor'
import { repositoryFromRemotes } from './lib/github.mjs'

require('dotenv').config({ path: '../.env' })

/**
 * Which repository this build belongs to.
 *
 * Set explicitly, given by Actions, or asked of git. The last one is what makes
 * a plain `npm run generate` in a clone produce a site that can find its own
 * sessions: without it the build carries no session record address, so it gives
 * up before fetching anything and waits forever on a backend that is already
 * running. Nothing about that failure names the variable that was missing.
 *
 * A consumer's tarball has no `.git` at all, which is the documented install
 * route, so this has to be allowed to find nothing.
 */
function contentRepository() {
  if (process.env.CONTENT_REPOSITORY) return process.env.CONTENT_REPOSITORY
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const remotes = require('child_process')
      .execSync('git remote -v', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
    return repositoryFromRemotes(remotes)
  } catch {
    return ''
  }
}

const CONTENT_REPOSITORY = contentRepository()

const baseUrl = process.env.BASE_URL || 'http://deciphered.ddev.site'

/**
 * Put Drupal's public files where the deployed site can serve them.
 *
 * An image inserted into a body field is a Drupal file, and its URL is served
 * by Drupal. A static build has no Drupal, so those images would all be broken
 * on the deployed site. Tome already exports the files into the repository, so
 * this copies them into the static output and `ice/src/files.mjs` points the markup
 * at the copies.
 *
 * Into `static/` rather than `dist/`, so `dev` and `start` serve them too.
 */
const copyDrupalFiles = function () {
  const { cpSync, existsSync, mkdirSync, rmSync } = require('fs')
  const { join } = require('path')
  const from = join(__dirname, '..', 'drupal', 'files', 'public')
  const to = join(__dirname, 'static', 'files')
  if (!existsSync(from)) return
  // Removed first, so a file deleted in Drupal stops being served here. The
  // directory is generated, and gitignored for that reason.
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })
  cpSync(from, to, {
    recursive: true,
    // Drupal's own protection for its files directory, which says nothing about
    // a static host and confuses the ones that read it.
    filter: (path) => !path.endsWith('.htaccess'),
  })
}


/**
 * The toolbar each text format is configured for, read at build time.
 *
 * It used to be fetched at runtime from `editor--editor` and nothing else, on
 * the reasoning that a change made in Drupal should reach the frontend without
 * a deploy. That resource needs `administer filters`, and the OAuth scope an
 * author signs in with grants the `authenticated` role, which does not have it.
 * So every real author got the fallback toolbar: no inline code, no image, none
 * of the buttons this site's own article is written with. The content could not
 * have been made with the editor that was being offered.
 *
 * Granting `administer filters` to read a toolbar would hand every author the
 * ability to edit text formats, which is how a text format becomes an XSS. The
 * configuration is already in the repository, exported by Tome, so the build
 * reads it from there instead. The runtime fetch still wins when it succeeds,
 * which keeps the no-deploy property for anyone who can actually use it.
 */
const configuredToolbars = function () {
  const { readdirSync, readFileSync } = require('fs')
  const { join } = require('path')
  const yaml = require('js-yaml')
  const dir = join(__dirname, '..', 'drupal', 'config')
  const toolbars = {}
  let names = []
  try {
    names = readdirSync(dir).filter((name) => /^editor\.editor\..+\.yml$/.test(name))
  } catch {
    // A checkout with no Drupal config still builds; it just has no toolbars.
    return toolbars
  }

  for (const name of names) {
    try {
      const config = yaml.load(readFileSync(join(dir, name), 'utf8')) || {}
      const items = (((config.settings || {}).toolbar || {}).items) || []
      const format = config.format || name.replace(/^editor\.editor\.|\.yml$/g, '')
      if (items.length) toolbars[format] = items
    } catch {
      // One unreadable format is not a reason to build without the others.
    }
  }
  return toolbars
}

/**
 * The display modes each bundle has, read at build time.
 *
 * Same reasoning as `configuredToolbars`. The editor offers a choice of how to
 * look at what you are writing, and the list comes from Drupal, and asking
 * Drupal needs a backend. Editing deliberately works without one, and offering
 * a single "default" there is offering nothing.
 *
 * From the filenames, which encode all three parts:
 * `core.entity_view_display.<entity type>.<bundle>.<mode>.yml`.
 */
const configuredViewModes = function () {
  const { readdirSync } = require('fs')
  const { join } = require('path')
  const modes = {}
  let names = []
  try {
    names = readdirSync(join(__dirname, '..', 'drupal', 'config'))
  } catch {
    return modes
  }

  for (const name of names) {
    const parts = /^core\.entity_view_display\.([^.]+)\.([^.]+)\.([^.]+)\.yml$/.exec(name)
    if (!parts) continue
    const [, entityType, bundle, mode] = parts
    const type = `${entityType}--${bundle}`
    modes[type] = modes[type] || ['default']
    if (!modes[type].includes(mode)) modes[type].push(mode)
  }
  return modes
}

/**
 * Which filters each text format runs, read at build time.
 *
 * A caption is stored one of two ways depending on this. With `filter_caption`
 * on, Drupal builds the figure at render time from a `data-caption` attribute,
 * so that is where the caption belongs. With it off, nothing ever reads that
 * attribute and a caption written into it is a caption nobody sees again.
 *
 * The integration used to assume it was on, which is true of every format this
 * site has and is not a safe thing to assume about someone else's. Same source
 * and same reasoning as `configuredToolbars`: the runtime resource needs
 * permission that an author's token does not carry.
 */
const configuredFilters = function () {
  const { readdirSync, readFileSync } = require('fs')
  const { join } = require('path')
  const yaml = require('js-yaml')
  const dir = join(__dirname, '..', 'drupal', 'config')
  const filters = {}
  let names = []
  try {
    names = readdirSync(dir).filter((name) => /^filter\.format\..+\.yml$/.test(name))
  } catch {
    return filters
  }

  for (const name of names) {
    try {
      const config = yaml.load(readFileSync(join(dir, name), 'utf8')) || {}
      const format = config.format || name.replace(/^filter\.format\.|\.yml$/g, '')
      filters[format] = Object.keys(config.filters || {})
    } catch {
      // One unreadable format is not a reason to build without the others.
    }
  }
  return filters
}

/**
 * The order a theme declares its regions in, read at build time.
 *
 * Druxt derives the region list from the blocks that are placed, so it arrives
 * in whatever order that query returned: the account menu before the branding,
 * and a header rendered backwards. This used to be corrected by a list of
 * regexes in `lib/regions.mjs` guessing the order from region names, which was
 * a guess at Olivero's naming made because there was no way to ask.
 *
 * `decoupled_settings` can serve the theme's declared order now, behind its
 * `expose_theme_manifest` setting. Read directly rather than through the
 * vendored Nuxt module, because the vendored build predates the manifest; when
 * that build is refreshed this should go and the module should supply it.
 *
 * An empty list is the honest answer when nothing served it, and
 * `layoutFor` then falls back to arrival order rather than to a guess.
 */
const declaredRegions = async function (baseUrl) {
  // `axios`, not `fetch`. This build runs on Node 16, which has no global
  // fetch, so a fetch here throws and the catch below turns that into "no
  // manifest" - a silent wrong answer rather than an error. It cost an
  // afternoon of wondering why the payload was empty when curl could see it.
  const axios = require('axios')
  const endpoint = `${String(baseUrl).replace(/\/+$/, '')}/jsonapi/decoupled/settings`
  try {
    const { data: body } = await axios.get(endpoint, {
      headers: { Accept: 'application/vnd.api+json' },
      timeout: 15000,
    })
    const data = Array.isArray(body.data) ? body.data[0] : body.data
    const regions = (((data || {}).attributes || {}).theme || {}).regions || {}
    return Object.keys(regions)
  } catch {
    // A build with no backend still builds; it just cannot order its regions.
    return []
  }
}

/**
 * One route per published slide, in deck order.
 *
 * Asked of the build backend the same way the regions are, and for the same
 * reason: the deck is static, so the build has to know how many slides there
 * are. A backend that does not answer builds a site with no deck rather than
 * no site.
 */
const slideRoutes = async function (baseUrl) {
  const axios = require('axios')
  const endpoint = `${String(baseUrl).replace(/\/+$/, '')}/jsonapi/node/slide`
  try {
    const { data: body } = await axios.get(endpoint, {
      params: { 'filter[status]': 1, 'fields[node--slide]': 'field_order', 'page[limit]': 50 },
      headers: { Accept: 'application/vnd.api+json' },
      timeout: 15000,
    })
    const count = (body.data || []).length
    return Array.from({ length: count }, (_, i) => `/slides/${i + 1}`)
  } catch {
    return []
  }
}

const localhostListenURL = function () {
  this.nuxt.hook('listen', (server, listener) => {
    listener.host = 'localhost'
    listener.url = `http://localhost:${listener.port}/`
  })
}

// An async factory rather than a plain object, because the site's identity is
// read from Drupal and `publicRuntimeConfig` is serialised the moment this is
// loaded. Nuxt 2 accepts a function returning a promise here.
export default async () => ({
  // Target full static build.
  target: 'static',

  // Serving path. A `<user>.github.io` user site serves from the domain root
  // and needs nothing here, which is why the PoC targets one. A project site at
  // `/<repo>/`, or any other subpath, needs its base set at build time because
  // a static build bakes asset paths in.
  router: {
    base: process.env.ROUTER_BASE || '/',
  },

  // Ensure the root route is generated and crawled, and generate every slide:
  // the deck's routes are not linked from the site, so the crawler never
  // reaches them on its own.
  generate: {
    routes: async () => ['/', ...(await slideRoutes(baseUrl))],
  },

  // A route that throws while generating is a page the site would ship broken,
  // or not at all. Nuxt 2 logs it and still exits 0, so a deploy could carry a
  // missing slide or a QR code that points somewhere it must not. Fail the
  // build instead. A handled error, such as a 404 the page asked for, is not
  // one of these.
  hooks: {
    'generate:done': (generator, errors) => {
      const unhandled = (errors || []).filter((e) => e.type === 'unhandled')
      if (unhandled.length) {
        const routes = unhandled.map((e) => e.route).join(', ')
        throw new Error(`${unhandled.length} route(s) failed to generate: ${routes}`)
      }
    },
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
    title: 'Deciphered',
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
    // The deck's own tokens and frame. Global because Nuxt 2 CSS is, and
    // harmless elsewhere: everything in it is scoped under `.deck`.
    '~/assets/css/deck.css',
  ],

  // Plugins to run before rendering page: https://go.nuxtjs.dev/config-plugins
  plugins: [
    // The connection and the OAuth half of authoring now come from
    // @druxt-contrib/inline-content-edit, which registers its own plugin. The
    // GitHub destination stays here: the module has no destinations interface
    // yet, and that is tracked as its own issue.
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
      // The buttons each text format is configured for, from the committed
      // config. See `configuredToolbars` for why this is not left to runtime.
      // The theme's own region order, so the header is not assembled in
      // whatever order the block query happened to return.
      regions: await declaredRegions(baseUrl),

      toolbars: configuredToolbars(),

      // The display modes each bundle has, so the editor can offer a choice of
      // them with no backend to ask. See `configuredViewModes`.
      viewModes: configuredViewModes(),

      // Which filters each format runs, so the editor knows where a caption
      // belongs. See `configuredFilters`.
      filters: configuredFilters(),

      // Where a session provider publishes the live backend, if anywhere.
      //
      // Derived from the repository when nothing sets it, because a build that
      // does not know where sessions publish cannot ever find one: it returns
      // early before fetching anything, and the interface sits on "Building..."
      // about a backend that came up minutes ago. The deploy workflow set no
      // such variable, so that was every deployed build.
      sessionRecordUrl:
        process.env.SESSION_RECORD_URL ||
        (CONTENT_REPOSITORY
          ? `https://raw.githubusercontent.com/${CONTENT_REPOSITORY}/${
              process.env.SESSION_BRANCH || 'session'
            }/session.json`
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
      repository: CONTENT_REPOSITORY,
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
    copyDrupalFiles,
    // Before druxt-site, because it reads `druxt.baseUrl` and writes the
    // settings into the runtime config the rest of the build then uses.
    //
    // Vendored, not installed: the package is not published yet, and a
    // dependency on the branch it lives on would be a private host in a public
    // repository. See nuxt/vendor/decoupled-settings/README.md.
    '~/vendor/decoupled-settings',
    'druxt-site',
    // The authoring engine and the editor, extracted from this site's own
    // ice/ directory into contrib modules. In `modules` for the same reason
    // druxt-site is: they register runtime plugins, and Nuxt 2 does not load
    // buildModules on `nuxt start`.
    '@druxt-contrib/inline-content-edit',
    '@druxt-contrib/ckeditor',
    // Registers `v-diff`, which marks a field's staged change into the markup
    // that field already rendered.
    '@druxt-contrib/diff',
    '@druxt-contrib/admin',
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
    // No server cache. Druxt 0.25 caches JSON:API responses on the server in
    // production. A generated site has no server, so it changes nothing there,
    // but a `nuxt start` session frontend would serve stale menus and settings
    // while the backend is being edited live.
    cache: false,
    // Disable deprecated Entity fields.
    entity: { components: { fields: false }},
    // Disable the router middleware (redirect support) in favour of serverless.
    router: { middleware: false },
    // Set the default theme to render Site regions.
    site: { theme: 'olivero' },

    // Drupal's administration. `link` sends /admin/* to the backend, and a
    // generated site has no admin routes, so on GitHub Pages it renders
    // nothing. `DRUXT_ADMIN_MODE=proxy npm run dev` serves Drupal's admin
    // from this origin instead. That is server middleware, so only `dev` runs
    // it here: this site is a static target, and neither the generated files
    // nor `nuxt start` on them run server middleware.
    admin: {
      mode: process.env.DRUXT_ADMIN_MODE || 'link',
    },

    // Copy the editor builds into this site and load them from here. Needed
    // because the site is served with no backend attached: an author stages
    // edits offline, and resolving the scripts against a backend URL would
    // mean no editor at all.
    ckeditor: {
      copy: true,
      packages: CKEDITOR_PACKAGES,
    },

    // The authoring engine. The same two values the deleted plugins read out
    // of publicRuntimeConfig, moved to where the module looks for them. The
    // rest of `publicRuntimeConfig.authoring` stays: the components and the
    // GitHub destination still read it, and the module knows nothing of it.
    ice: {
      clientId:
        process.env.OAUTH_CLIENT_ID || 'dfdd3969-6fe2-4a6f-92bb-82b6f59013ed',
      sessionRecord: {
        url:
          process.env.SESSION_RECORD_URL ||
          (CONTENT_REPOSITORY
            ? `https://raw.githubusercontent.com/${CONTENT_REPOSITORY}/${
                process.env.SESSION_BRANCH || 'session'
              }/session.json`
            : ''),
        // Where the GitHub sign-in keeps its token. The module reads it to
        // ask the contents API for the record rather than the CDN, so a
        // signed-in author sees a backend the moment its job pushes.
        tokenKey: 'authoring.github',
      },
      // This site's record is published to a raw URL behind a CDN, and the
      // module does not know that host. The destination tells it.
      destination: '~/plugins/authoring-github-destination.js',
    },
  },

  // Build Configuration: https://go.nuxtjs.dev/config-build
  build: {
  }
})
