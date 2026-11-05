// The node preview page, as consumer_node_preview opens it: a draft that is
// not saved, read from this origin with the editor's cookie.
import { expect, test } from '@playwright/test'

import { appReady, isolateFromPublishedSessions } from './isolate.js'

const UUID = '753b6c4b-7684-4d69-8650-1ca4ab6af08a'
const PATH = `/jsonapi/node/slide/${UUID}/preview`

/** A slide as the preview document carries it, with a title nobody has saved. */
function draft(title) {
  return {
    jsonapi: { version: '1.0' },
    data: {
      type: 'node--slide',
      id: UUID,
      attributes: {
        title,
        field_order: 3,
        field_layout: 'bullets',
        body: {
          value: '<ul><li>A point that is still being written.</li></ul>',
          format: 'basic_html',
        },
      },
      relationships: {},
    },
    links: { self: { href: `http://127.0.0.1:4173${PATH}` } },
  }
}

test.describe('the node preview', () => {
  test.beforeEach(async ({ page }) => {
    await isolateFromPublishedSessions(page)
  })

  test('renders the draft from the document in the hash, and asks Drupal for nothing else', async ({
    page,
  }) => {
    const asked = []
    await page.route(`**${PATH}`, (route) => {
      asked.push(route.request().headers().accept)
      route.fulfill({
        json: draft('A title nobody saved yet'),
        contentType: 'application/vnd.api+json',
      })
    })
    const fetched = []
    page.on('request', (request) => {
      if (/\/jsonapi\//.test(request.url())) fetched.push(request.url())
    })
    await page.goto(`/preview?vm=default#${PATH}`)
    await appReady(page)
    await expect(page.getByTestId('deck-slide')).toHaveAttribute('data-layout', 'bullets')
    await expect(page.getByTestId('deck-slide')).toContainText('A title nobody saved yet')
    await expect(page.getByTestId('deck-slide')).toContainText(
      'A point that is still being written.'
    )
    // No editing controls in a preview: the draft is already being edited elsewhere.
    await expect(page.getByTestId('authoring-login-trigger')).toHaveCount(0)
    expect(asked).toEqual(['application/vnd.api+json'])
    expect(fetched).toEqual([`http://127.0.0.1:4173${PATH}`])
  })

  test('a hash that is not a preview path is refused, not fetched', async ({ page }) => {
    const fetched = []
    page.on('request', (request) => {
      if (/\/jsonapi\//.test(request.url())) fetched.push(request.url())
    })
    await page.goto(`/preview#https://evil.example${PATH}`)
    await appReady(page)
    await expect(page.getByTestId('preview-message')).toContainText('no preview to show')
    expect(fetched).toEqual([])
  })

  test('a session Drupal does not accept is said', async ({ page }) => {
    await page.route(`**${PATH}`, (route) => route.fulfill({ status: 403, json: { errors: [] } }))
    await page.goto(`/preview#${PATH}`)
    await appReady(page)
    await expect(page.getByTestId('preview-message')).toContainText(
      'Sign in to Drupal on this site'
    )
  })
})
