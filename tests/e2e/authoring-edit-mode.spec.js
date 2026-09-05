// Edit mode: turning it on, editing in place, and adding something new.
//
// No backend is connected for most of these on purpose. Editing stages into the
// cart, and the cart works without one, so a test that provided a backend would
// not be testing the thing that matters.

import { expect, test } from '@playwright/test'

// networkidle throughout: the cart and the edit mode are restored by a plugin
// during startup, and asserting before that settles reads the pre-hydration page.
const open = (page, path = '/authoring') => page.goto(path, { waitUntil: 'networkidle' })

test.describe('edit mode', () => {
  test('a visitor is offered edit mode but sees no editing UI', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('authoring-edit-toggle')).toHaveText('Edit')
    // Nothing to add and nothing to edit until the mode is on.
    await expect(page.getByTestId('authoring-add')).toHaveCount(0)
  })

  test('turning it on reveals the add control', async ({ page }) => {
    await open(page)
    await page.getByTestId('authoring-edit-toggle').click()

    await expect(page.getByTestId('authoring-edit-toggle')).toHaveText('Editing')
    await page.getByTestId('cart-tab-add').click()
    await expect(page.getByTestId('authoring-add')).toBeVisible()
  })

  test('edit mode survives a reload', async ({ page }) => {
    await open(page)
    await page.getByTestId('authoring-edit-toggle').click()
    await page.getByTestId('cart-tab-add').click()
    await expect(page.getByTestId('authoring-add')).toBeVisible()

    await open(page)
    await expect(page.getByTestId('authoring-edit-toggle')).toHaveText('Editing')
    // The mode survives; the drawer is left however it was last put.
    await expect(page.getByTestId('authoring-cart-toggle')).toBeVisible()
  })

  test('turning it off puts the page back to what a visitor sees', async ({ page }) => {
    await open(page)
    await page.getByTestId('authoring-edit-toggle').click()
    await page.getByTestId('cart-tab-add').click()
    await expect(page.getByTestId('authoring-add')).toBeVisible()

    await page.getByTestId('authoring-edit-toggle').click()
    await expect(page.getByTestId('authoring-add')).toHaveCount(0)
  })

  test('new content can be staged with no backend at all', async ({ page }) => {
    const requests = []
    page.on('request', (r) => {
      if (r.url().includes('/jsonapi')) requests.push(r.url())
    })

    await open(page)
    await page.getByTestId('authoring-edit-toggle').click()
    await page.getByTestId('cart-tab-add').click()
    await page.getByTestId('authoring-add').click()

    await expect(page.getByTestId('authoring-add-message')).toContainText(
      'nothing is staged or sent'
    )
    await page.getByTestId('authoring-add-done').click()
    await expect(page.getByTestId('authoring-cart-count')).toContainText('1 change')
    expect(requests, 'nothing may be sent without a backend').toEqual([])
  })

  test('something staged as new is sent as a create, not an edit', async ({ page }) => {
    await open(page)
    await page.getByTestId('authoring-edit-toggle').click()
    await page.getByTestId('cart-tab-add').click()
    await page.getByTestId('authoring-add').click()

    // Staged only when staged: pressing Add opens a form, it does not decide
    // to send anything.
    await page.getByTestId('authoring-add-done').click()

    const resource = await page.evaluate(
      () =>
        window.$nuxt.$store.state.authoringCart.entries[
          Object.keys(window.$nuxt.$store.state.authoringCart.entries)[0]
        ]
    )
    // The flag is what decides POST over PATCH at commit time, and it has to
    // survive the trip through being an unstaged draft.
    expect(resource.isNew).toBe(true)
    expect(resource.type).toBe('node--article')
    // A client-generated id, so the cart can key and name it before Drupal has
    // seen it.
    expect(resource.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('the page explains itself when no backend is connected', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('authoring-page-no-backend')).toBeVisible()
  })
})
