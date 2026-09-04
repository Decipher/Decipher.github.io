// The edit form itself: the widgets it renders, and what staging produces.
//
// The cart spec dispatches into the store the way the form is meant to. That
// left the form's own path untested, and it was broken in two ways at once: the
// buttons that stage were never rendered, and the diff behind them compared the
// entity against itself and always found nothing. Both looked fine from the
// store's side.
//
// A backend is stubbed here rather than required. Rendering a form needs the
// site's field configuration, which is not readable anonymously, so a test that
// waited for a real Drupal would only ever be skipped in CI.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const BACKEND = 'http://backend.test'

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'jsonapi')

const fixture = (name) => JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'))

// Which fixture answers which collection. Matched on the path alone: Druxt and
// the widgets both add filters, and the filter is not what is being tested.
const COLLECTIONS = [
  ['/jsonapi/entity_form_display/entity_form_display', 'entity_form_display'],
  ['/jsonapi/field_config/field_config', 'field_config'],
  ['/jsonapi/field_storage_config/field_storage_config', 'field_storage_config'],
  ['/jsonapi/taxonomy_term/tags', 'taxonomy_term_tags'],
  ['/jsonapi/user/user', 'user_user'],
  ['/jsonapi/editor/editor', 'editor'],
  ['/jsonapi/node/article', 'node_article'],
]

const ARTICLE = '34156cc1-48f9-4ee9-acd7-e3970ca00554'

/**
 * Stand a JSON:API backend up in the browser.
 *
 * Returns the writes it received, so a test can assert that staging sent
 * nothing and that committing sent exactly one thing.
 */
async function stubBackend(page) {
  const writes = []

  await page.route(`${BACKEND}/**`, async (route, request) => {
    const url = new URL(request.url())
    const headers = {
      'content-type': 'application/vnd.api+json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    }

    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })

    if (request.method() !== 'GET') {
      writes.push({ method: request.method(), url: request.url(), body: request.postDataJSON() })
      return route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ data: { type: 'node--article', id: ARTICLE, attributes: {} } }),
      })
    }

    // An individual resource, by uuid.
    const individual = url.pathname.match(/^\/jsonapi\/node\/article\/([0-9a-f-]{36})$/)
    if (individual) {
      const node = fixture('node_article').data.find((item) => item.id === individual[1])
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ data: node }) })
    }

    const match = COLLECTIONS.find(([path]) => url.pathname === path)
    if (match) {
      const body = fixture(match[1])
      // The autocomplete filters server side, so the stub has to as well, or
      // every query would "match" everything and prove nothing.
      const query = url.searchParams.get('filter[q][condition][value]')
      if (query && Array.isArray(body.data)) {
        const field = url.searchParams.get('filter[q][condition][path]')
        body.data = body.data.filter((item) =>
          String((item.attributes || {})[field] || '')
            .toLowerCase()
            .includes(query.toLowerCase())
        )
      }
      return route.fulfill({ status: 200, headers, body: JSON.stringify(body) })
    }

    if (url.pathname === '/jsonapi' || url.pathname === '/jsonapi/') {
      return route.fulfill({ status: 200, headers, body: JSON.stringify(fixture('index')) })
    }

    return route.fulfill({ status: 200, headers, body: JSON.stringify({ data: [] }) })
  })

  return writes
}

/** Connect, sign in, turn on edit mode and open the first article's form. */
async function openForm(page) {
  await page.goto('/')
  await page.evaluate((backend) => {
    localStorage.setItem('authoring.backend', JSON.stringify({ url: backend, clientId: null }))
    sessionStorage.setItem(
      'authoring.token',
      JSON.stringify({ token: 'stub-token', account: 'admin' })
    )
  }, BACKEND)

  await page.goto('/authoring', { waitUntil: 'networkidle' })
  await page.getByTestId('authoring-edit-toggle').click()
  await page.getByTestId(`edit-node--article-${ARTICLE}`).click()
  await expect(page.getByTestId('authoring-stage')).toBeVisible()
}

test.describe('the edit form', () => {
  test('every field gets the widget Drupal configured for it', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    // Reference fields are searched, not typed into: tags and the author.
    await expect(page.getByTestId('reference-input')).toHaveCount(2)
    // The URL alias is one field, not the whole path object.
    await expect(page.getByTestId('field-path')).toHaveCount(1)
    await expect(page.getByTestId('field-input').first()).toBeVisible()
  })

  test('the form offers to stage, and never to save', async ({ page }) => {
    const writes = await stubBackend(page)
    await openForm(page)

    // Druxt's own submit writes straight to the backend, which would bypass
    // the cart entirely. It has to be gone, not merely ignored.
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0)
    await expect(page.getByTestId('authoring-stage')).toBeVisible()

    await page.getByTestId('field-input').first().fill('An edited title')
    await page.getByTestId('authoring-stage').click()
    await expect(page.getByTestId('authoring-stage-message')).toContainText('Staged')
    expect(writes).toEqual([])
  })

  test('an edited field reaches the cart', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    await page.getByTestId('field-input').first().fill('An edited title')
    await page.getByTestId('authoring-stage').click()
    await expect(page.getByTestId('authoring-stage-message')).toContainText('Staged')

    const staged = await page.evaluate(
      () => window.$nuxt.$store.getters['authoringCart/resources'][0]
    )
    expect(staged.attributes.title).toBe('An edited title')
    // Only what changed: the rest of the entity is not the author's to send.
    expect(Object.keys(staged.attributes)).toEqual(['title'])
  })

  test('a URL alias is staged with its record intact', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    await page.getByTestId('field-path').fill('no-leading-slash')
    await page.getByTestId('field-path').blur()
    // Drupal rejects an alias without one, which is a round trip to find out.
    await expect(page.getByTestId('field-path')).toHaveValue('/no-leading-slash')

    await page.getByTestId('authoring-stage').click()
    const staged = await page.evaluate(
      () => window.$nuxt.$store.getters['authoringCart/resources'][0]
    )
    expect(staged.attributes.path.alias).toBe('/no-leading-slash')
    // pid identifies the alias record; rebuilding the value would drop it.
    expect(staged.attributes.path).toHaveProperty('langcode', 'en')
  })

  test('a reference is chosen from the backend and staged as a relationship', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    const tags = page.getByTestId('reference-input').first()
    await tags.fill('bre')
    await expect(page.getByTestId('reference-option')).toContainText('Bread')
    await page.getByTestId('reference-option').first().click()
    // Scoped to the tags field: the author field has a chip of its own.
    await expect(page.getByTestId('reference-selected').filter({ hasText: 'Bread' })).toHaveCount(1)

    await page.getByTestId('authoring-stage').click()
    const staged = await page.evaluate(
      () => window.$nuxt.$store.getters['authoringCart/resources'][0]
    )
    // A relationship, not an attribute, and carrying nothing but type and id.
    expect(staged.relationships.field_tags.data).toEqual([
      { type: 'taxonomy_term--tags', id: 'cf97bdbd-f6fa-4a2b-96b9-e8c1b3404c2f' },
    ])
  })

  test('an existing reference is shown by name, not by uuid', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    // The author relationship holds a uuid and nothing readable, so the label
    // has to be fetched. Asking someone to recognise a uuid is not a widget.
    await expect(page.getByTestId('reference-selected').filter({ hasText: 'admin' })).toHaveCount(1)
  })

  test('staging nothing stages nothing', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    await page.getByTestId('authoring-stage').click()
    await expect(page.getByTestId('authoring-stage-message')).toContainText('Nothing changed')
  })
})
