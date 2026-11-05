# Deciphered: the Nuxt application

The Nuxt 2 half of the site. It renders every page with
[Druxt](https://druxtjs.org) and generates the static site GitHub Pages serves.

Run it from the repository root rather than from here: the root scripts start
the Drupal backend it builds against, and find a free port.

```bash
npm run dev        # http://localhost:3000, backend started if it is not running
npm run generate   # the static site, written to nuxt/dist/
```

`nuxt.config.js` reads `BASE_URL` from the root `.env`. See the root
[README](../README.md) for setup.

`vendor/` holds built copies of Druxt modules that are not on npm yet. They are
installed with `file:` paths, and each one's README records where it was built
from.
