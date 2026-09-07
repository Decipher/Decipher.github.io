/**
 * Keep a test from finding a backend it did not ask for.
 *
 * A build knows where sessions publish themselves, and the site looks there on
 * load. That is the point of it, and it makes any test about "no backend
 * connected" depend on whether one happens to be running somewhere, which is
 * not what those tests are for.
 */
export async function isolateFromPublishedSessions(page) {
  await page.route(/raw\.githubusercontent\.com/, (route) => route.abort())
}

/**
 * Wait until the app is actually running before acting on it.
 *
 * Nuxt hydrates, the authoring plugins install, and the cart restores what the
 * last visit staged, all after the page has loaded. A test that navigates and
 * immediately clicks is racing that, and the race is only lost when the machine
 * is busy: these suites run in parallel against one static server, so the
 * failures appeared under load and never when the test was run on its own.
 *
 * Three tests were patched individually for this before it was clear they were
 * the same thing. This is the shared answer.
 */
export async function appReady(page) {
  await page.waitForFunction(
    () => Boolean(window.$nuxt && window.$nuxt.$store && window.$nuxt.$store.state.authoringCart),
    { timeout: 30000 }
  )
  // One tick past mount, so a restore committed during it has landed.
  await page.evaluate(() => new Promise((resolve) => window.$nuxt.$nextTick(resolve)))
}
