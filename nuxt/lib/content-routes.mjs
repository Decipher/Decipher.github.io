/**
 * The list of pages this site has, asked of Drupal at build time.
 *
 * Nuxt finds routes to generate by crawling links out of the ones it already
 * has. This site's front page renders a single node and links to nothing, so the
 * crawl found one page and the deployed site was one page. Asking the backend
 * what exists is also the only way to get a sitemap that is not a guess.
 */

import { textFrom } from './seo.mjs'

/** Resource types worth putting in front of a reader. */
const CONTENT_PREFIX = 'node--'

/**
 * Every published node, as a route.
 *
 * The path alias where a node has one, `/node/<id>` where it does not, which is
 * the URL Drupal itself would serve. Unpublished content is left out: it 403s
 * for the anonymous build anyway, and generating a page for it would publish it.
 */
export async function contentRoutes(baseUrl, { client } = {}) {
  // Imported here rather than at the top of the file. Druxt's ES build calls
  // `require`, which throws the moment a plain Node ES module loads it, and that
  // would make importing this file at all impossible outside a bundler.
  const { DruxtClient } = await import('druxt')
  const { DrupalJsonApiParams } = await import('drupal-jsonapi-params')

  const druxt = client || new DruxtClient(baseUrl, { proxy: { api: false } })
  const index = await druxt.getIndex()
  const types = Object.keys(index || {}).filter((type) => type.startsWith(CONTENT_PREFIX))

  const pages = []
  for (const type of types) {
    const query = new DrupalJsonApiParams()
      .addFields(type, ['title', 'path', 'body', 'changed', 'drupal_internal__nid'])
      .addFilter('status', '1')
    const collections = await druxt.getCollectionAll(type, query)
    for (const collection of collections) {
      for (const resource of collection.data || []) {
        const attributes = resource.attributes || {}
        const path = (attributes.path || {}).alias || `/node/${attributes.drupal_internal__nid}`
        const body = attributes.body || {}
        pages.push({
          path,
          type,
          title: attributes.title,
          // A summary is written to be an excerpt, so it beats the body it
          // summarises. Both are HTML, and a meta description is not.
          description: textFrom(body.summary || body.processed || body.value || ''),
          changed: attributes.changed,
        })
      }
    }
  }

  // A node reachable by both its alias and its id would otherwise be generated
  // and listed twice, competing with itself.
  const seen = new Set()
  return pages.filter((page) => !seen.has(page.path) && seen.add(page.path))
}

/**
 * The same pages, keyed by route.
 *
 * Baked into the build's runtime config so a page can set its own description
 * without waiting for the entity to load. `head()` runs before the entity has
 * been fetched, so reading it from the store there gets nothing, every time.
 */
export function pagesByPath(pages) {
  return Object.fromEntries(pages.map((page) => [page.path, page]))
}

/**
 * The same list, but never a reason for the build to fail.
 *
 * A build with no backend is a real case: CI builds the frontend to check that
 * it builds. That should produce a site with a homepage, not an error.
 */
export async function contentRoutesOrNone(baseUrl, options) {
  try {
    return await contentRoutes(baseUrl, options)
  } catch (error) {
    console.warn(`[seo] Could not list content from ${baseUrl}, generating the homepage only.`)
    console.warn(`[seo] ${error.message}`)
    return []
  }
}
