/**
 * Per-page head fragments.
 *
 * Druxt's router sets a title and a canonical of its own, and the canonical it
 * sets is the one Drupal reported: at generate time that is the build's own
 * backend, so every deployed page shipped a canonical pointing at a tunnel or
 * at 127.0.0.1. Search engines were being told the real copy of this site lives
 * somewhere that stops existing when the build finishes.
 *
 * So the head is decided here instead, from the site's own address.
 */

import {
  SITE_NAME,
  SITE_DESCRIPTION,
  TITLE_SUFFIX,
  canonicalUrl,
  isPrivateRoute,
  shareImageUrl,
  siteUrl,
} from './site.mjs'

/** Longest description worth emitting. Search results truncate around here. */
const DESCRIPTION_LIMIT = 160

/**
 * Trim a description to a whole word within the limit.
 *
 * Cutting mid-word reads as a truncation bug rather than a summary, and the
 * result is what a search result and a share card both quote.
 */
export function clampDescription(text) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (value.length <= DESCRIPTION_LIMIT) return value

  const cut = value.slice(0, DESCRIPTION_LIMIT - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.]$/, '')}...`
}

/**
 * Strip a rendered field back to the sentence underneath it.
 *
 * A node body arrives as HTML. Meta descriptions are plain text, and a tag left
 * in one is shown to a reader verbatim.
 */
export function textFrom(html) {
  return clampDescription(
    String(html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
  )
}

/**
 * A complete `head()` fragment for a page.
 *
 * Everything is keyed by `hid` so a page deeper in the tree can replace one tag
 * by name rather than emitting a second copy of it beside the first.
 */
export function seoHead({ title, description, path = '/', image, canonical, type } = {}) {
  const url = canonicalUrl({ path, canonical })
  const summary = clampDescription(description) || SITE_DESCRIPTION
  // The suffix is added here rather than by a `titleTemplate` in nuxt.config,
  // which Nuxt serialises into the bundle without the constants it closes over.
  // A share card wants it regardless: it stands alone, with no browser chrome to
  // say which site it came from.
  const shareTitle = title ? `${title}${TITLE_SUFFIX}` : SITE_NAME
  const shareImage = image || shareImageUrl(path)
  const private_ = isPrivateRoute(path)

  return {
    title: shareTitle,
    meta: [
      { hid: 'description', name: 'description', content: summary },

      { hid: 'og:type', property: 'og:type', content: type || (path === '/' ? 'website' : 'article') },
      { hid: 'og:title', property: 'og:title', content: shareTitle },
      { hid: 'og:description', property: 'og:description', content: summary },
      { hid: 'og:url', property: 'og:url', content: url },
      { hid: 'og:image', property: 'og:image', content: shareImage },
      { hid: 'og:site_name', property: 'og:site_name', content: SITE_NAME },
      // A scraper reserves space for the card before it fetches the image, and
      // several will not render one at all without the dimensions. They describe
      // this site's own cards, so a caller's image of unknown size gets no claim
      // rather than a wrong one.
      ...(image
        ? []
        : [
            { hid: 'og:image:width', property: 'og:image:width', content: '1200' },
            { hid: 'og:image:height', property: 'og:image:height', content: '630' },
          ]),

      { hid: 'twitter:card', name: 'twitter:card', content: 'summary_large_image' },
      { hid: 'twitter:title', name: 'twitter:title', content: shareTitle },
      { hid: 'twitter:description', name: 'twitter:description', content: summary },
      { hid: 'twitter:image', name: 'twitter:image', content: shareImage },

      // The authoring tool and the OAuth callback are machinery. Indexing them
      // puts a page that only works for someone signed in into search results.
      ...(private_ ? [{ hid: 'robots', name: 'robots', content: 'noindex, follow' }] : []),
    ],
    link: [
      // The tag that collapses the trailing-slash and query-tagged variants of a
      // URL onto one indexed page, and the one Druxt was getting wrong.
      { hid: 'canonical', rel: 'canonical', href: url },
    ],
  }
}

/** The head for a route with nothing of its own to say. */
export function defaultHead(path) {
  return seoHead({ path, canonical: siteUrl(path) })
}
