// The cart in a browser: staging with nothing behind the site, surviving a
// reload, and staying invisible to a visitor.
//
// No backend is stubbed for most of these on purpose. The point of the cart is
// that editing does not need one, so a test that provided one would not be
// testing the thing that matters.

import { expect, test } from '@playwright/test'

// Every navigation waits for networkidle. The cart is restored by a plugin
// during startup, so staging or asserting before that settles races it: the
// restore would overwrite an edit staged a moment too early.

/** Stage a change directly through the store, as the form does. */
async function stage(page, { type, id, original, edited }) {
  return page.evaluate(
    ([type, id, original, edited]) =>
      window.$nuxt.$store.dispatch('authoringCart/stage', { type, id, original, edited }),
    [type, id, original, edited]
  )
}

const count = (page) => page.evaluate(() => window.$nuxt.$store.getters['authoringCart/count'])

test.describe('authoring cart', () => {
  test('a visitor sees no cart', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('authoring-cart')).toHaveCount(0)
  })

  test('staging works with no backend connected, and sends nothing', async ({ page }) => {
    const requests = []
    page.on('request', (r) => {
      if (r.url().includes('/jsonapi')) requests.push(r.url())
    })

    await page.goto('/', { waitUntil: 'networkidle' })
    const staged = await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Before' },
      edited: { title: 'After' },
    })

    expect(staged).toBe(true)
    await expect(page.getByTestId('authoring-cart-count')).toContainText('1 change')
    expect(requests, 'nothing may be sent without a backend').toEqual([])
  })

  test('the cart says what is missing before it can be committed', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, { type: 'node--article', id: 'abc', original: {}, edited: { title: 'A' } })
    await expect(page.getByTestId('authoring-cart-blocked')).toContainText('Connect a backend')
  })

  test('staged changes survive a reload', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, { type: 'node--article', id: 'abc', original: {}, edited: { title: 'A' } })

    // networkidle, not the default: the cart is restored by a plugin during
    // startup, so asserting before that settles reads the pre-hydration page.
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('authoring-cart-count')).toContainText('1 change')
    expect(await count(page)).toBe(1)
  })

  test('two edits to one entity are one staged change', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, { type: 'node--article', id: 'abc', original: {}, edited: { title: 'A' } })
    await stage(page, { type: 'node--article', id: 'abc', original: {}, edited: { body: 'B' } })

    expect(await count(page)).toBe(1)
    const resource = await page.evaluate(
      () => window.$nuxt.$store.getters['authoringCart/resources'][0]
    )
    expect(Object.keys(resource.attributes).sort()).toEqual(['body', 'title'])
  })

  test('an edit that changes nothing stages nothing', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const staged = await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Same' },
      edited: { title: 'Same' },
    })
    expect(staged).toBe(false)
    await expect(page.getByTestId('authoring-cart')).toHaveCount(0)
  })

  test('discarding empties the cart and does not come back', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, { type: 'node--article', id: 'abc', original: {}, edited: { title: 'A' } })
    await page.getByTestId('authoring-cart-discard').click()

    await expect(page.getByTestId('authoring-cart')).toHaveCount(0)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('authoring-cart')).toHaveCount(0)
  })
})
