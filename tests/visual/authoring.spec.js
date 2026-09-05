// Four viewports, three states: the site as a visitor sees it, the backend
// prompt, and the login step. The dialog is the part most likely to break
// silently on a narrow screen, so it is captured at every size.
//
// The page's own content is masked out. It comes from whichever backend built
// the site, so a developer's Drupal and a CI one produce different words and
// different heights, and the baseline would fail on content nobody styled.
// These test the design: the shell, the type, the dialog. What the articles say
// is the behaviour suite's business.

import { expect, test } from '@playwright/test'

const BACKEND = 'https://backend.test'

/**
 * Regions left out of every baseline.
 *
 * Mocking would be better: a screenshot with real words says more about the
 * design than one full of grey boxes. It does not work here. This is a full
 * static build, so the content is already rendered into the HTML that Playwright
 * loads; rewriting `window.__NUXT__` changes the hydration payload, but Vue
 * hydrates onto the existing DOM and leaves the text alone. Substituting
 * fixtures was a no-op, to the pixel.
 *
 * So these are masked instead, and for the same underlying reason: both vary
 * with something other than the stylesheet. `main` holds content from whichever
 * backend built the site, and the build date is whenever the build ran.
 *
 * To get real content into these, the baselines would have to be generated in
 * the same environment that verifies them, which means CI generating and
 * committing them rather than a developer doing it locally.
 */
const contentMask = (page) => [page.locator('main'), page.getByTestId('built-at')]

/**
 * Nuxt's loading bar, which is not part of any of these designs.
 *
 * Two pixels tall, fixed to the top, and as wide as a request is far along. It
 * is invisible at rest, so locally it never appeared in a baseline and never
 * had to; on CI a request settled slowly enough to catch it mid-flight and the
 * suite went red on 2560 pixels, which is 1280 wide by exactly its two rows.
 *
 * Hidden rather than masked: masking a zero-width element covers nothing, so a
 * mask would work only on the runs where the bar happened to show, which is the
 * timing dependency this is here to remove.
 */
const hideLoadingBar = (page) =>
  page.addStyleTag({ content: '.nuxt-progress { display: none !important; }' })

async function isolateFromBackends(page) {
  await page.route(/\/(jsonapi|router)\//, (route) => route.abort())
  // A build that knows where sessions are published looks for one on load.
  // Left to reach the network, these shots depend on whether a backend happens
  // to be running somewhere, which is not what they are testing.
  await page.route(/raw\.githubusercontent\.com/, (route) => route.abort())
}

async function stubConformingBackend(page) {
  await page.route(`${BACKEND}/jsonapi`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.api+json',
      body: JSON.stringify({ jsonapi: { version: '1.1' } }),
    })
  )
}

test('the site as a visitor sees it', async ({ page }) => {
  await isolateFromBackends(page)
  await page.goto('/')
  await hideLoadingBar(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('visitor.png', {
    fullPage: true,
    animations: 'disabled',
    mask: contentMask(page),
  })
})

test('the backend prompt', async ({ page }) => {
  await isolateFromBackends(page)
  await page.goto('/')
  await page.getByTestId('authoring-login-trigger').click()
  await expect(page.getByTestId('authoring-backend-url')).toBeVisible()
  await hideLoadingBar(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('connect.png', {
    animations: 'disabled',
    mask: contentMask(page),
  })
})

test('the login step', async ({ page }) => {
  await isolateFromBackends(page)
  await stubConformingBackend(page)
  await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`)
  await page.getByTestId('authoring-login-trigger').click()
  await expect(page.getByTestId('authoring-continue')).toBeVisible()
  await hideLoadingBar(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(page).toHaveScreenshot('login.png', {
    animations: 'disabled',
    mask: contentMask(page),
  })
})
