/**
 * Where a theme's regions go, inferred from what they are called.
 *
 * Drupal tells a decoupled frontend which regions a theme has, and nothing at
 * all about where they belong: the arrangement lives in the theme's own page
 * template, which is Twig, which a Nuxt site never sees. Druxt hands every
 * region over as a slot and leaves the placing to whoever is rendering.
 *
 * So this infers it. Region names are conventional across Drupal themes -
 * `header`, `footer_top`, `sidebar_first`, `content_above` - and the convention
 * carries enough to build a page that reads correctly. It is a guess, and a
 * theme that names its regions unusually will be arranged oddly rather than
 * wrongly: an unrecognised region goes above the content, where it is visible
 * and can be moved, rather than being dropped.
 *
 * Pure, so the arranging can be tested without a browser or a backend.
 */

/**
 * The bands a page is built from, in the order they are rendered.
 *
 * `main` and `aside` sit side by side; the rest are full width.
 */
export const BANDS = ['top', 'bar', 'hero', 'above', 'main', 'aside', 'below', 'bottom']

/**
 * Which band a region belongs in.
 *
 * Ordered, because the first match wins and the specific tests have to come
 * before the general ones: `content_above` is not the content, and
 * `footer_top` is not the top.
 */
const RULES = [
  [/^footer/, 'bottom'],
  // Its own band, and not part of `above`, because it is a second sticky layer
  // under the header rather than something at the top of the content. The page
  // title sits in `above` and must scroll away; this must not.
  [/^breadcrumb/, 'bar'],
  [/^(header|nav|primary_menu|secondary_menu|top_|pre_header)/, 'top'],
  [/^(hero|banner|highlighted|help)/, 'hero'],
  [/^(sidebar|social|complementary|aside)/, 'aside'],
  [/^(content_above|title|above)/, 'above'],
  [/^(content_below|below|post_content)/, 'below'],
  [/^content$|^main$/, 'main'],
]

export function bandFor(region) {
  const name = String(region || '')
  const rule = RULES.find(([pattern]) => pattern.test(name))
  // Not recognised, so put it where it will be seen. A region silently dropped
  // is a block placed into nothing, and nothing on the page says why.
  return rule ? rule[1] : 'above'
}

/**
 * Where a region sits within its band.
 *
 * The order regions arrive in is not the theme's. Druxt derives them from the
 * blocks that are placed, so it follows whatever order that query returned:
 * the account menu came before the branding, and the header rendered backwards.
 * Ranked by name instead, which is the same convention the bands rest on.
 *
 * Everything unmatched sorts last, keeping the order it arrived in, so a region
 * this does not recognise is put after the ones it does rather than in front.
 */
/**
 * The order to fall back on when the theme will not say.
 *
 * A guess, and named as one. It matches on region names, which is to say it
 * guesses at Olivero's naming and hopes other themes agree. It exists because
 * Druxt derives the region list from the blocks that are placed, so regions
 * arrive in whatever order that query returned: the account menu before the
 * branding, and a header rendered backwards.
 *
 * Kept because most sites cannot answer the question yet. Reading the theme's
 * declared order needs `decoupled_settings` with its theme manifest exposed,
 * and a build with no backend cannot ask at all. Removing this and falling
 * back to arrival order put the account menu ahead of the branding on every
 * build but the one machine that had the manifest.
 */
const FALLBACK_ORDER = [
  /branding/,
  /^header/,
  /^pre_?header/,
  /primary/,
  /secondary/,
  /^footer_top/,
  /^footer/,
]

/**
 * Where a region sits.
 *
 * The theme's declared order when it was served, which is a fact Drupal
 * records. The guess above when it was not.
 */
export function rankOf(region, declared = []) {
  const index = declared.indexOf(region)
  if (index !== -1) return index
  if (declared.length) return declared.length

  const guessed = FALLBACK_ORDER.findIndex((pattern) => pattern.test(String(region || '')))
  return guessed === -1 ? FALLBACK_ORDER.length : guessed
}

/**
 * A theme's regions, grouped into bands and ordered within them.
 */
export function layoutFor(regions = [], declared = []) {
  const layout = Object.fromEntries(BANDS.map((band) => [band, []]))
  regions.forEach((region, arrived) => layout[bandFor(region)].push({ region, arrived }))
  return Object.fromEntries(
    Object.entries(layout).map(([band, entries]) => [
      band,
      entries
        .sort((a, b) => rankOf(a.region, declared) - rankOf(b.region, declared) || a.arrived - b.arrived)
        .map((entry) => entry.region),
    ])
  )
}

/**
 * Whether the page needs its two-column row at all.
 *
 * A site with nothing in the sidebar should not be laid out around one: the
 * content would be narrower than the page for no reason a reader can see.
 */
export function hasAside(layout) {
  return Boolean((layout.aside || []).length)
}
