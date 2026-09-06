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
export const BANDS = ['top', 'hero', 'above', 'main', 'aside', 'below', 'bottom']

/**
 * Which band a region belongs in.
 *
 * Ordered, because the first match wins and the specific tests have to come
 * before the general ones: `content_above` is not the content, and
 * `footer_top` is not the top.
 */
const RULES = [
  [/^footer/, 'bottom'],
  [/^(header|nav|primary_menu|secondary_menu|top_|pre_header)/, 'top'],
  [/^(hero|banner|highlighted|help)/, 'hero'],
  [/^(sidebar|social|complementary|aside)/, 'aside'],
  [/^(content_above|breadcrumb|title|above)/, 'above'],
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
 * A theme's regions, grouped into bands.
 *
 * The theme's own order is kept within each band: Drupal declares regions in
 * the order the theme lists them, and that order is the closest thing to an
 * opinion the theme has given us.
 */
export function layoutFor(regions = []) {
  const layout = Object.fromEntries(BANDS.map((band) => [band, []]))
  for (const region of regions) layout[bandFor(region)].push(region)
  return layout
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
