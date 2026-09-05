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

/** A 4x4 red PNG, small enough to keep in the test and real enough to upload. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
  'base64'
)

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

    // A file upload is not a JSON:API document: it is raw bytes at the field's
    // own route, with the filename in a header.
    if (request.method() === 'POST' && url.pathname.endsWith('/field_image')) {
      writes.push({
        method: 'POST',
        url: request.url(),
        contentType: request.headers()['content-type'],
        disposition: request.headers()['content-disposition'],
        bytes: (request.postDataBuffer() || Buffer.alloc(0)).length,
      })
      return route.fulfill({
        status: 201,
        headers,
        body: JSON.stringify({
          data: { type: 'file--file', id: 'uploaded-file-id', attributes: { filename: 'red.png' } },
        }),
      })
    }

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
    await page.getByTestId('authoring-advanced').click()

    // Reference fields are searched, not typed into: tags and the author.
    await expect(page.getByTestId('reference-input')).toHaveCount(2)
    // The URL alias is one field, not the whole path object.
    await expect(page.getByTestId('field-path')).toHaveCount(1)
    // A timestamp is a moment, not a string to be typed.
    await expect(page.getByTestId('field-date')).toHaveCount(1)
    await expect(page.getByTestId('field-input').first()).toBeVisible()
    // Nothing falls through to the untyped default any more.
    await expect(page.getByTestId('field-textarea')).toHaveCount(0)
  })

  test('the settings around the content are out of the way', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    // Writing something should not mean scrolling past the publishing flags
    // to reach the body. Drupal puts these in a sidebar for the same reason.
    await expect(page.getByTestId('field-path')).toBeHidden()
    await expect(page.getByTestId('field-date')).toBeHidden()
    // What the author is actually writing stays in front of them.
    await expect(page.getByTestId('field-input').first()).toBeVisible()

    await page.getByTestId('authoring-advanced').click()
    await expect(page.getByTestId('field-path')).toBeVisible()
  })

  test('a tag that does not exist yet can be made from the field', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    // Drupal's tags widget creates a term for anything typed that does not
    // match, which is why tagging feels like typing rather than picking.
    const tags = page.getByTestId('reference-input').first()
    await tags.fill('Sourdough')
    await expect(page.getByTestId('reference-create')).toContainText('Sourdough')
    await page.getByTestId('reference-create').click()

    const staged = await page.evaluate(() => window.$nuxt.$store.getters['authoringCart/resources'])
    const term = staged.find((r) => r.type === 'taxonomy_term--tags')
    // Staged, not created: nothing reaches the site until the cart is sent.
    expect(term.attributes.name).toBe('Sourdough')
  })

  test('one character is told to keep typing, not left silent', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    // A search box that answers nothing looks broken, and the reason it
    // answered nothing is not guessable.
    await page.getByTestId('reference-input').first().fill('b')
    await expect(page.getByTestId('reference-status').first()).toContainText('Keep typing')
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

    // The alias is a setting, not the content, so it lives behind Advanced.
    await page.getByTestId('authoring-advanced').click()
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

  test('an edit that was never staged is kept, not reverted', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    await page.getByTestId('field-input').first().fill('Typed but not staged')
    // "Done" is not "discard". Reverting an afternoon's work is the worst
    // available reading of that word.
    await page.getByTestId('authoring-editable-close').click()

    await expect(page.getByTestId('unstaged-badge')).toBeVisible()
    // Kept, but not counted: the drawer must not claim work it will not send.
    expect(await page.evaluate(() => window.$nuxt.$store.getters['authoringCart/count'])).toBe(0)

    // And reopening puts it back in front of the author.
    await page.getByTestId(`edit-node--article-${ARTICLE}`).click()
    await expect(page.getByTestId('field-input').first()).toHaveValue('Typed but not staged')
  })

  test('staging an unstaged edit turns it into a staged one', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)
    await page.getByTestId('field-input').first().fill('First typed, then staged')
    await page.getByTestId('authoring-editable-close').click()
    await expect(page.getByTestId('unstaged-badge')).toBeVisible()

    await page.getByTestId(`edit-node--article-${ARTICLE}`).click()
    await page.getByTestId('authoring-stage').click()
    await page.getByTestId('authoring-editable-close').click()

    // One state at a time: it is either going to be sent, or it is not.
    await expect(page.getByTestId('staged-badge')).toBeVisible()
    await expect(page.getByTestId('unstaged-badge')).toHaveCount(0)
  })

  test('a tag taken out again leaves nothing behind', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    const tags = page.getByTestId('reference-input').first()
    await tags.fill('Sourdough')
    await page.getByTestId('reference-create').click()
    await expect(
      page.getByTestId('reference-selected').filter({ hasText: 'Sourdough' })
    ).toHaveCount(1)

    // Changing your mind should not leave a term in the vocabulary, nor a
    // change in the drawer that the author cannot see the point of.
    await page
      .getByTestId('reference-selected')
      .filter({ hasText: 'Sourdough' })
      .getByTestId('reference-remove')
      .click()
    const staged = await page.evaluate(() => window.$nuxt.$store.getters['authoringCart/resources'])
    expect(staged.filter((r) => r.type === 'taxonomy_term--tags')).toHaveLength(0)
  })

  test('the same tag added twice is one tag', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    const tags = page.getByTestId('reference-input').first()
    for (const _ of [1, 2]) {
      await tags.fill('Sourdough')
      await page.getByTestId('reference-create').click()
      await page
        .getByTestId('reference-selected')
        .filter({ hasText: 'Sourdough' })
        .getByTestId('reference-remove')
        .click()
    }
    await tags.fill('Sourdough')
    await page.getByTestId('reference-create').click()

    const staged = await page.evaluate(() => window.$nuxt.$store.getters['authoringCart/resources'])
    // Added, removed and added again is one change, not three.
    expect(staged.filter((r) => r.type === 'taxonomy_term--tags')).toHaveLength(1)
  })

  test('an image is held until there is somewhere to send it', async ({ page }) => {
    const writes = await stubBackend(page)
    await openForm(page)

    await page.getByTestId('image-input').setInputFiles({
      name: 'red.png',
      mimeType: 'image/png',
      buffer: PNG,
    })

    // Choosing a picture must not need a backend, the same as every other edit.
    await expect(page.getByTestId('image-preview')).toBeVisible()
    await expect(page.getByTestId('image-pending')).toBeVisible()
    expect(writes).toEqual([])
  })

  test('the field says which files it will take', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    await page.getByTestId('image-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    })

    // Told before committing everything else along with it.
    await expect(page.getByTestId('image-error')).toContainText('png')
    await expect(page.getByTestId('image-preview')).toHaveCount(0)
  })

  test('committing sends the bytes, then points the field at them', async ({ page }) => {
    const writes = await stubBackend(page)
    await openForm(page)

    await page.getByTestId('image-input').setInputFiles({
      name: 'red.png',
      mimeType: 'image/png',
      buffer: PNG,
    })
    await page.getByTestId('image-alt').fill('A small red square')
    await page.getByTestId('authoring-stage').click()
    await expect(page.getByTestId('authoring-stage-message')).toContainText('Staged')

    await page.evaluate(
      ([token]) =>
        window.$nuxt.$store.dispatch('authoringCart/commit', {
          backendUrl: 'http://backend.test',
          token,
        }),
      ['stub-token']
    )

    const upload = writes.find((w) => w.url.endsWith('/field_image'))
    // The bytes go to the field's own route as an octet stream. JSON:API's
    // media type here is a 415, and without the disposition there is no
    // filename at all.
    expect(upload.url).toBe('http://backend.test/jsonapi/node/article/field_image')
    expect(upload.contentType).toBe('application/octet-stream')
    expect(upload.disposition).toBe('file; filename="red.png"')
    expect(upload.bytes).toBe(PNG.length)

    // Then the entity is pointed at whatever came back, not at the id the
    // browser invented, and the alt goes with it: a relationship sent without
    // meta answers 200 and silently clears the alt.
    const patch = writes.find((w) => w.method === 'PATCH')
    const image = patch.body.data.relationships.field_image.data
    expect(image.id).toBe('uploaded-file-id')
    expect(image.meta.alt).toBe('A small red square')
  })

  test('staging nothing stages nothing', async ({ page }) => {
    await stubBackend(page)
    await openForm(page)

    await page.getByTestId('authoring-stage').click()
    await expect(page.getByTestId('authoring-stage-message')).toContainText('Nothing changed')
  })
})
