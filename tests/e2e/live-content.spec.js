// Does connecting a backend actually show content written after the build?
//
// This one runs against a real Drupal, not a stub, because the thing being
// tested is exactly what a stub would paper over: a full static build renders
// from a payload baked at generate time, so content created afterwards is
// absent by definition until the page re-fetches.
//
// Skipped when no backend is reachable, so the suite still runs anywhere.

import { expect, test } from '@playwright/test'

const BACKEND = process.env.LIVE_BACKEND_URL || 'http://127.0.0.1:8889'

test.describe('live content', () => {
  test.beforeEach(async ({ request }) => {
    let reachable = false
    try {
      const response = await request.get(`${BACKEND}/jsonapi`, { timeout: 5000 })
      reachable = response.ok()
    } catch {
      reachable = false
    }
    test.skip(!reachable, `No backend at ${BACKEND}`)
  })

  test('an article created after the build appears once a backend is connected', async ({
    page,
    request,
  }) => {
    const listing = await request.get(`${BACKEND}/jsonapi/node/article`)
    const articles = (await listing.json()).data
    test.skip(articles.length === 0, 'The backend has no articles to look for')

    // Assert on body text rather than the title: the front page renders
    // teasers, and body text is the part that could not have come from
    // anywhere but a live request.
    const bodies = articles
      .map((node) => (node.attributes.body || {}).value)
      .filter(Boolean)
      .map((html) => html.replace(/<[^>]+>/g, '').trim())
      .filter((text) => text.length > 20)
    test.skip(bodies.length === 0, 'No article body long enough to identify')

    await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`)
    await expect(page.locator('#__nuxt')).toContainText(bodies[0].slice(0, 40), {
      timeout: 15000,
    })
  })

  test('requests go to the connected backend, not the site\'s own origin', async ({ page }) => {
    const elsewhere = []
    page.on('request', (r) => {
      const url = r.url()
      // `/router/translate-path` is the one that used to be requested
      // origin-relative, which cannot work on a static host with no proxy.
      if ((url.includes('/jsonapi') || url.includes('/router/')) && !url.startsWith(BACKEND)) {
        elsewhere.push(url)
      }
    })

    await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`, { waitUntil: 'networkidle' })
    expect(elsewhere, `these went somewhere other than ${BACKEND}`).toEqual([])
  })

  // The mechanism behind the test above, asserted directly so a regression says
  // what broke rather than just "content is stale".
  test('hydration data is dropped when connected, and kept when not', async ({ page }) => {
    await page.goto('/')
    expect(
      await page.evaluate(() => window.__NUXT__ && window.__NUXT__.serverRendered),
      'a visitor with no backend must keep the static payload'
    ).toBe(true)

    await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`)
    expect(
      await page.evaluate(() => window.__NUXT__ && window.__NUXT__.serverRendered),
      'a connected site must re-fetch rather than hydrate from the build'
    ).toBe(false)
  })

  test('disconnecting goes back to the built content', async ({ page }) => {
    // networkidle, not the default `load`: connecting is asynchronous, and
    // clicking before it settles finds the dialog on its "choose a backend"
    // step instead of the connected one.
    await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`, { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => window.__NUXT__.serverRendered)).toBe(false)

    await page.getByTestId('authoring-login-trigger').click()
    await expect(page.getByTestId('authoring-disconnect')).toBeVisible()

    // Disconnecting navigates, dropping `?backend=` so the reload does not
    // reconnect from the address bar. Wait for that URL change rather than
    // polling across the navigation, which reads whichever document is current.
    await page.getByTestId('authoring-disconnect').click()
    await page.waitForURL((url) => !url.searchParams.has('backend'), { timeout: 15000 })
    await page.waitForLoadState('networkidle')

    // A reload is the only way back: connecting threw the static payload away,
    // so disconnecting has nothing in memory to restore.
    expect(await page.evaluate(() => window.__NUXT__.serverRendered)).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('authoring.backend'))).toBe(null)
  })
})
