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

  test('a demo slide offers a session when there is none, and streams the backend being built', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.__opened = []
      window.open = (url) => {
        window.__opened.push(url)
        return null
      }
    })
    // GitHub's public Actions API, as it answers while a run builds.
    let asked = 0
    await page.route('https://api.github.com/**', (route) => {
      const url = route.request().url()
      const json = (body) =>
        route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
          body: JSON.stringify(body),
        })
      asked++
      if (url.includes('/actions/workflows/')) {
        return json({
          workflow_runs: [
            {
              id: 7,
              html_url: 'https://github.com/o/r/actions/runs/7',
              status: 'in_progress',
              conclusion: null,
              created_at: new Date().toISOString(),
            },
          ],
        })
      }
      if (url.includes('/actions/runs/7/jobs')) {
        return json({
          jobs: [
            {
              steps: [
                { name: 'Assembling', status: 'completed', conclusion: 'success' },
                { name: 'Opening the tunnel', status: 'in_progress', conclusion: null },
                { name: 'Provisioning', status: 'queued', conclusion: null },
              ],
            },
          ],
        })
      }
      return json({})
    })

    await page.goto('/drupalmel/prose-and-cons/5')
    await appReady(page)
    await page.evaluate(() => {
      window.$nuxt.$authoringGithub.state.repository = 'o/r'
    })
    const stage = page.getByTestId('deck-stage')
    await expect(stage.getByTestId('deck-session-start')).toBeVisible()
    await expect(stage.getByTestId('deck-session-connect')).toBeVisible()

    await stage.getByTestId('deck-session-start').click()
    expect(await page.evaluate(() => window.__opened)).toEqual([
      'https://github.com/o/r/actions/workflows/authoring.yml',
    ])
    await expect(stage.getByTestId('deck-session-status')).toContainText('Starting on GitHub')
    // The run is found within seconds, and its steps follow.
    await expect(stage.getByTestId('deck-session-step')).toHaveCount(3, { timeout: 15000 })
    await expect(stage.getByTestId('deck-session-step').nth(0)).toHaveClass(
      /deck-session__step--done/
    )
    await expect(stage.getByTestId('deck-session-step').nth(1)).toHaveClass(
      /deck-session__step--running/
    )
    await expect(stage.getByTestId('deck-session-status')).toContainText('1 of 3 steps')
    expect(asked).toBeGreaterThan(0)

    await stage.getByTestId('deck-session-stop').click()
    await expect(stage.getByTestId('deck-session-start')).toBeVisible()
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
