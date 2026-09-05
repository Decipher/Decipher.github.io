/**
 * Render one Open Graph PNG per page, at build time.
 *
 * Runs from the generate:done hook next to the sitemap. A node's own image is
 * not used: `@nuxt/image` rewrites those to a content-hashed path only it knows,
 * and the original lives on a backend that stops existing when the build ends,
 * so linking to either gives a card that breaks. A card drawn here is a file in
 * the export like any other.
 *
 * Satori and resvg are dev dependencies. Nothing here reaches the browser.
 */

import { readFileSync } from 'fs'

import { CARD_HEIGHT, CARD_WIDTH, ogCard } from './og-card.mjs'
import { cardFileName, isPrivateRoute } from './site.mjs'

/**
 * The fonts the card is drawn with, as the site's own files.
 *
 * `.woff` rather than `.woff2`, which Satori cannot read. These are the same
 * faces the stylesheet loads, so a card and the page it links to are set in the
 * same type rather than in whatever the renderer had to hand.
 */
const FONT_FILES = [
  { name: 'Archivo', weight: 400, path: '@fontsource/archivo/files/archivo-latin-400-normal.woff' },
  { name: 'Archivo', weight: 600, path: '@fontsource/archivo/files/archivo-latin-600-normal.woff' },
  {
    name: 'JetBrains Mono',
    weight: 400,
    path: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff',
  },
]

function loadFonts(resolve) {
  return FONT_FILES.map(({ name, weight, path }) => ({
    name,
    weight,
    style: 'normal',
    data: readFileSync(resolve(path)),
  }))
}

/** Turn one card into a PNG buffer. */
async function renderCard(card, fonts, { satori, Resvg }) {
  const svg = await satori(card, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts })
  return new Resvg(svg, { fitTo: { mode: 'width', value: CARD_WIDTH } }).render().asPng()
}

/**
 * Every card the build should write, as `{ name, png }`.
 *
 * The site card first, because it is the fallback for any page that has none:
 * a card that fails to render should be a missing image, not a missing build.
 */
export async function ogImages(pages = [], { resolve = (p) => p, satori, Resvg } = {}) {
  const fonts = loadFonts(resolve)
  const cards = [
    {
      name: 'site.png',
      card: ogCard({
        eyebrow: 'Serverless Drupal',
        description: 'Druxt on GitHub Pages, with a backend that only exists while someone writes.',
      }),
    },
    ...pages
      .filter((page) => !isPrivateRoute(page.path))
      .map((page) => ({
        name: cardFileName(page.path),
        card: ogCard({
          eyebrow: 'Article',
          title: page.title,
          description: page.description,
        }),
      })),
  ]

  const rendered = []
  for (const { name, card } of cards) {
    rendered.push({ name, png: await renderCard(card, fonts, { satori, Resvg }) })
  }
  return rendered
}
