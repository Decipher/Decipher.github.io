// The deck, as a presenter meets it: on the deployed site, with no backend.
import { expect, test } from '@playwright/test'

import { appReady, isolateFromPublishedSessions } from './isolate.js'

/** Hosts the deck must never ask anything of. */
const THIRD_PARTIES =
  /fonts\.googleapis|fonts\.gstatic|qrserver|chart\.googleapis|unpkg|jsdelivr|cdnjs/

test.describe('the deck', () => {
  test.beforeEach(async ({ page }) => {
    await isolateFromPublishedSessions(page)
  })

  test('presents with no backend, and the keys move through it', async ({ page }) => {
    await page.goto('/drupalmel/prose-and-cons/1')
    await appReady(page)
    const slide = page.getByTestId('deck-slide')
    await expect(slide).toHaveAttribute('data-layout', 'intro')
    await expect(page.getByTestId('deck-number')).toHaveText(/^1 \/ \d+$/)

    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/prose-and-cons\/2$/)
    await expect(page.getByTestId('deck-number')).toHaveText(/^2 \/ \d+$/)

    await page.keyboard.press('PageUp')
    await expect(page).toHaveURL(/\/prose-and-cons\/1$/)

    await page.keyboard.press('End')
    const total = await page.getByTestId('deck-number').textContent()
    const last = Number(total.split('/')[1].trim())
    await expect(page).toHaveURL(new RegExp(`/drupalmel/prose-and-cons/${last}$`))
    await expect(page.getByTestId('deck-slide')).toHaveAttribute('data-layout', 'close')

    await page.keyboard.press('Home')
    await expect(page).toHaveURL(/\/prose-and-cons\/1$/)
  })

  test('the deck path itself opens on the first slide', async ({ page }) => {
    await page.goto('/drupalmel/prose-and-cons')
    await appReady(page)
    await expect(page.getByTestId('deck-slide')).toHaveAttribute('data-layout', 'intro')
    await expect(page.getByTestId('deck-number')).toHaveText(/^1 \/ \d+$/)
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/prose-and-cons\/2$/)
  })

  test('the intro carries a QR code made at build time, and asks no third party for anything', async ({
    page,
  }) => {
    const outside = []
    page.on('request', (request) => {
      if (THIRD_PARTIES.test(request.url())) outside.push(request.url())
    })
    await page.goto('/drupalmel/prose-and-cons/1')
    await appReady(page)
    await expect(page.getByTestId('deck-qr').locator('svg')).toHaveCount(1)
    await expect(page.getByTestId('deck-qr')).toContainText('stuar.tc')
    expect(outside).toEqual([])
  })

  test('the theme toggles with t and is remembered on reload', async ({ page }) => {
    await page.goto('/drupalmel/prose-and-cons/2')
    await appReady(page)
    const deck = page.getByTestId('deck')
    await expect(deck).toHaveAttribute('data-theme', 'light')
    await page.keyboard.press('t')
    await expect(deck).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await appReady(page)
    await expect(page.getByTestId('deck')).toHaveAttribute('data-theme', 'dark')
  })

  test('arrow keys move the caret, not the slide, while typing', async ({ page }) => {
    await page.goto('/drupalmel/prose-and-cons/1')
    await appReady(page)
    // Walk to the Vale slide, which has a textarea on it.
    const total = Number((await page.getByTestId('deck-number').textContent()).split('/')[1])
    let found = false
    for (let n = 1; n <= total; n++) {
      await page.goto(`/drupalmel/prose-and-cons/${n}`)
      await appReady(page)
      if ((await page.getByTestId('deck-slide').getAttribute('data-layout')) === 'vale') {
        found = true
        break
      }
    }
    expect(found).toBe(true)
    const url = page.url()
    const box = page.getByTestId('deck-vale-text')
    await box.click()
    await box.type('A sentence of my own.')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press(' ')
    expect(page.url()).toBe(url)
    // The space landed where the caret had moved to, before the full stop.
    await expect(box).toHaveValue('A sentence of my own .')
  })

  test('the public export says nothing about a session', async ({ page }) => {
    await page.goto('/drupalmel/prose-and-cons/3')
    await appReady(page)
    await expect(page.getByTestId('deck-session')).toHaveCount(0)
    await expect(page.getByTestId('deck-slogan')).not.toBeEmpty()
  })
})
