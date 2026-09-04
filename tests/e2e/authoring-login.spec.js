// The login flow, against a stubbed backend.
//
// Stubbed on purpose: these assert what the frontend does with each answer a
// backend can give, and a real Drupal cannot be made to give the awkward ones
// on demand. The real backend is covered by the session job, which stands one
// up and checks JSON:API, OAuth and CORS for real.

import { expect, test } from '@playwright/test'

const BACKEND = 'https://backend.test'

/** Answer /jsonapi the way a conforming Drupal does. */
async function stubConformingBackend(page) {
  await page.route(`${BACKEND}/jsonapi`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.api+json',
      body: JSON.stringify({ jsonapi: { version: '1.1' } }),
    })
  )
}

test.describe('authoring login', () => {
  test('a visitor sees only a login control, and no backend', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('authoring-login-trigger')).toHaveText('Log in')
    await expect(page.getByTestId('authoring-login-dialog')).toHaveCount(0)
  })

  test('clicking log in asks for a backend first', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('authoring-login-trigger').click()

    await expect(page.getByTestId('authoring-login-dialog')).toBeVisible()
    await expect(page.getByTestId('authoring-backend-url')).toBeVisible()
    // Nothing to log in to yet, so the login button must not be offered.
    await expect(page.getByTestId('authoring-continue')).toHaveCount(0)
  })

  test('a verified backend unlocks the login step', async ({ page }) => {
    await stubConformingBackend(page)
    await page.goto('/')

    await page.getByTestId('authoring-login-trigger').click()
    await page.getByTestId('authoring-backend-url').fill(BACKEND)
    await page.getByTestId('authoring-verify').click()

    await expect(page.getByTestId('authoring-continue')).toBeVisible()
    await expect(page.getByTestId('authoring-backend-host')).toHaveText('backend.test')
  })

  test('an unreachable backend is reported, and does not unlock login', async ({ page }) => {
    await page.route('https://nope.test/jsonapi', (route) => route.abort())
    await page.goto('/')

    await page.getByTestId('authoring-login-trigger').click()
    await page.getByTestId('authoring-backend-url').fill('https://nope.test')
    await page.getByTestId('authoring-verify').click()

    await expect(page.getByTestId('authoring-error')).toBeVisible()
    await expect(page.getByTestId('authoring-continue')).toHaveCount(0)
  })

  test('a URL that answers but is not Drupal is refused', async ({ page }) => {
    await page.route('https://notdrupal.test/jsonapi', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"hello":"world"}' })
    )
    await page.goto('/')

    await page.getByTestId('authoring-login-trigger').click()
    await page.getByTestId('authoring-backend-url').fill('https://notdrupal.test')
    await page.getByTestId('authoring-verify').click()

    await expect(page.getByTestId('authoring-error')).toContainText('not a JSON:API endpoint')
  })

  test('a backend named in the URL connects without being typed', async ({ page }) => {
    await stubConformingBackend(page)
    await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`)

    await page.getByTestId('authoring-login-trigger').click()
    await expect(page.getByTestId('authoring-continue')).toBeVisible()
  })

  test('a connected backend is remembered across a reload', async ({ page }) => {
    await stubConformingBackend(page)
    await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`)
    await page.getByTestId('authoring-login-trigger').click()
    await expect(page.getByTestId('authoring-continue')).toBeVisible()

    // Reloaded without the query string: it has to come from storage or not
    // at all.
    await page.goto('/')
    await page.getByTestId('authoring-login-trigger').click()
    await expect(page.getByTestId('authoring-continue')).toBeVisible()
  })

  test('disconnecting forgets the backend', async ({ page }) => {
    await stubConformingBackend(page)
    await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`)
    await page.getByTestId('authoring-login-trigger').click()
    await expect(page.getByTestId('authoring-disconnect')).toBeVisible()
    await page.getByTestId('authoring-disconnect').click()

    // Disconnecting reloads, so the dialog closes with it: the built content
    // only comes back on a fresh load. Reopen to see the state it left behind.
    await page.getByTestId('authoring-login-trigger').click()
    await expect(page.getByTestId('authoring-backend-url')).toBeVisible()

    // Reloaded: a disconnect has to survive, or a backend that has gone away
    // gets retried on every single load with no way out.
    await page.goto('/')
    await page.getByTestId('authoring-login-trigger').click()
    await expect(page.getByTestId('authoring-backend-url')).toBeVisible()
  })

  test('log in sends the browser to the backend with PKCE', async ({ page }) => {
    await stubConformingBackend(page)

    // Catch the redirect rather than follow it: the authorize endpoint belongs
    // to a backend that does not exist here, and what matters is the request
    // the frontend builds.
    let authorizeUrl = null
    await page.route(`${BACKEND}/oauth/authorize*`, (route) => {
      authorizeUrl = new URL(route.request().url())
      return route.abort()
    })

    await page.goto(`/?backend=${encodeURIComponent(BACKEND)}`)
    await page.getByTestId('authoring-login-trigger').click()
    await page.getByTestId('authoring-continue').click()

    await expect.poll(() => authorizeUrl !== null).toBe(true)
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code')
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorizeUrl.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(authorizeUrl.searchParams.get('redirect_uri')).toMatch(/\/callback$/)
  })

  test('the callback reports what the backend refused', async ({ page }) => {
    await page.goto('/callback?error=invalid_client&error_description=Client+authentication+failed')
    await expect(page.getByTestId('callback-error')).toContainText('Client authentication failed')
  })
})
