// What each page tells a search engine and a share card about itself.
//
// The bug these were written against: every generated page carried a canonical
// pointing at the backend the build ran against, which is a tunnel or a
// localhost port that stops existing when the build finishes.

import assert from 'node:assert/strict'
import test from 'node:test'

import { pagesByPath } from '../../nuxt/lib/content-routes.mjs'
import { clampDescription, seoHead, textFrom } from '../../nuxt/lib/seo.mjs'
import { escapeXml, llmsTxt, robotsTxt, sitemapXml } from '../../nuxt/lib/sitemap.mjs'
import {
  SITE_NAME,
  canonicalUrl,
  cardFileName,
  isPrivateRoute,
  isSyndicated,
  siteUrl,
} from '../../nuxt/lib/site.mjs'

const metaOf = (head, hid) => (head.meta.find((tag) => tag.hid === hid) || {}).content

test('siteUrl collapses the variants of one URL onto one', () => {
  assert.equal(siteUrl('/about'), 'https://decipher.github.io/about')
  assert.equal(siteUrl('/about/'), 'https://decipher.github.io/about')
  assert.equal(siteUrl('about'), 'https://decipher.github.io/about')
  assert.equal(siteUrl('//a//b//'), 'https://decipher.github.io/a/b')
  assert.equal(siteUrl('/'), 'https://decipher.github.io/')
})

test('a page is canonically itself unless it says otherwise', () => {
  assert.equal(canonicalUrl({ path: '/a' }), 'https://decipher.github.io/a')
  assert.equal(isSyndicated({ path: '/a' }), false)
})

test('syndicated content points back at the original', () => {
  // The whole point: a copy here must not outrank the post it was copied from.
  const canonical = 'https://stuar.tc/posts/something'
  assert.equal(canonicalUrl({ path: '/something', canonical }), canonical)
  assert.equal(isSyndicated({ path: '/something', canonical }), true)
})

test('the canonical is the site, never the backend the build used', () => {
  const head = seoHead({ title: 'Theming check', path: '/a-new-alias' })
  assert.equal(head.link[0].href, 'https://decipher.github.io/a-new-alias')
  assert.equal(metaOf(head, 'og:url'), 'https://decipher.github.io/a-new-alias')
})

test('a title carries the site name, once', () => {
  const head = seoHead({ title: 'Theming check', path: '/a' })
  assert.equal(head.title, 'Theming check | Deciphered')
  assert.equal(metaOf(head, 'og:title'), 'Theming check | Deciphered')

  // The homepage has no title of its own, and is not called "| Deciphered".
  assert.equal(seoHead({ path: '/' }).title, SITE_NAME)
})

test('a page with nothing to say describes the site rather than nothing', () => {
  assert.match(metaOf(seoHead({ path: '/a' }), 'description'), /^A statically generated/)
})

test('the homepage is a website and everything else is an article', () => {
  assert.equal(metaOf(seoHead({ path: '/' }), 'og:type'), 'website')
  assert.equal(metaOf(seoHead({ path: '/a' }), 'og:type'), 'article')
})

test('machinery is kept out of the index', () => {
  assert.equal(isPrivateRoute('/callback'), true)
  assert.equal(isPrivateRoute('/authoring'), true)
  assert.equal(isPrivateRoute('/authoring/anything'), true)
  assert.equal(isPrivateRoute('/a-new-alias'), false)

  assert.equal(metaOf(seoHead({ path: '/callback' }), 'robots'), 'noindex, follow')
  assert.equal(metaOf(seoHead({ path: '/a' }), 'robots'), undefined)
})

test('a share image of unknown size gets no dimensions claimed for it', () => {
  // A scraper reserves space from these before it fetches the image, so a wrong
  // claim is worse than none.
  assert.equal(metaOf(seoHead({ path: '/a' }), 'og:image:width'), '1200')
  const supplied = seoHead({ path: '/a', image: 'https://example.test/card.png' })
  assert.equal(metaOf(supplied, 'og:image'), 'https://example.test/card.png')
  assert.equal(metaOf(supplied, 'og:image:width'), undefined)
})

test('a long description is cut at a word, not mid-word', () => {
  const long = `${'word '.repeat(60)}end`
  const cut = clampDescription(long)
  assert.ok(cut.length <= 160)
  assert.ok(cut.endsWith('...'))
  assert.ok(!cut.includes('wor...'))
  assert.equal(clampDescription('  spaced   out  '), 'spaced out')
})

test('a body is reduced to the sentence under the markup', () => {
  assert.equal(textFrom('<p>Some <em>body</em> text.</p>'), 'Some body text.')
  assert.equal(textFrom('<p>Tom &amp; Jerry&#39;s</p>'), "Tom & Jerry's")
  assert.equal(textFrom(undefined), '')
})

test('pages are keyed by the route they are served at', () => {
  const keyed = pagesByPath([
    { path: '/a-new-alias', title: 'Theming check' },
    { path: '/node/5', title: 'Another' },
  ])
  assert.equal(keyed['/a-new-alias'].title, 'Theming check')
  assert.equal(keyed['/node/5'].title, 'Another')
})

test('the sitemap lists what a crawler should fetch, and nothing else', () => {
  const xml = sitemapXml([
    { path: '/a-new-alias', title: 'Theming check', changed: '2026-09-05T02:11:15+00:00' },
    { path: '/callback', title: 'Signing in' },
    { path: '/elsewhere', title: 'Copy', canonical: 'https://stuar.tc/x' },
  ])

  assert.match(xml, /<loc>https:\/\/decipher\.github\.io\/<\/loc>/)
  assert.match(xml, /<loc>https:\/\/decipher\.github\.io\/a-new-alias<\/loc>/)
  // Machinery, and a page that disclaims itself in favour of the original.
  assert.ok(!xml.includes('/callback'))
  assert.ok(!xml.includes('/elsewhere'))
})

test('lastmod is what Drupal changed, not when the build ran', () => {
  const xml = sitemapXml([{ path: '/a', changed: '2026-09-05T02:11:15+00:00' }])
  assert.match(xml, /<lastmod>2026-09-05<\/lastmod>/)
  // No date at all beats a date that means "this build ran today".
  assert.ok(!sitemapXml([{ path: '/a' }]).includes('lastmod'))
})

test('one apostrophe cannot invalidate the whole sitemap', () => {
  // A malformed sitemap is rejected whole, not in part, so a single unescaped
  // character in one title would cost the site every URL in the file.
  const loc = sitemapXml([{ path: "/tom-&-jerry's" }])
    .split('\n')
    .find((line) => line.includes('tom-'))
  assert.equal(loc, '    <loc>https://decipher.github.io/tom-&amp;-jerry&apos;s</loc>')
  assert.equal(escapeXml('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;')
})

test('robots points at the sitemap and keeps crawlers off the machinery', () => {
  const robots = robotsTxt()
  assert.match(robots, /^User-agent: \*$/m)
  assert.match(robots, /^Sitemap: https:\/\/decipher\.github\.io\/sitemap\.xml$/m)
  assert.match(robots, /^Disallow: \/authoring$/m)
  assert.match(robots, /^Disallow: \/_nuxt\/$/m)
})

test('llms.txt says what each page is, which is what a sitemap does not', () => {
  const txt = llmsTxt([
    { path: '/a-new-alias', title: 'Theming check', description: 'Some body text.' },
    { path: '/callback', title: 'Signing in' },
  ])
  assert.match(txt, /^# Deciphered$/m)
  assert.match(txt, /^> A statically generated/m)
  assert.match(
    txt,
    /^- \[Theming check\]\(https:\/\/decipher\.github\.io\/a-new-alias\): Some body text\.$/m
  )
  assert.ok(!txt.includes('/callback'))
})

test('an empty site still produces a valid llms.txt', () => {
  assert.match(llmsTxt([]), /^- No content published yet\.$/m)
})

test('a card file name cannot collide across route shapes', () => {
  assert.equal(cardFileName('/'), 'site.png')
  assert.equal(cardFileName('/node/7'), 'node-7.png')
  assert.equal(cardFileName('/a-new-alias'), 'a-new-alias.png')
  // `/node/7` and a page aliased `/node-7` would otherwise be the same file.
  assert.notEqual(cardFileName('/node/7'), cardFileName('/node/7/x'))
})

test('a page shares its own card, and machinery shares the site one', () => {
  assert.equal(
    metaOf(seoHead({ path: '/a-new-alias' }), 'og:image'),
    'https://decipher.github.io/og/a-new-alias.png'
  )
  // No card is drawn for these, so pointing at one would share a broken image.
  assert.equal(
    metaOf(seoHead({ path: '/callback' }), 'og:image'),
    'https://decipher.github.io/og/site.png'
  )
})
