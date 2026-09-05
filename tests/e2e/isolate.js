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
