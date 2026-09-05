// The cart in a browser: staging with nothing behind the site, surviving a
// reload, and staying invisible to a visitor.
//
// No backend is stubbed for most of these on purpose. The point of the cart is
// that editing does not need one, so a test that provided one would not be
// testing the thing that matters.

import { expect, test } from '@playwright/test'

import { isolateFromPublishedSessions } from './isolate.js'

// Every navigation waits for networkidle. The cart is restored by a plugin
// during startup, so staging or asserting before that settles races it: the
// restore would overwrite an edit staged a moment too early.

/** Stage a change directly through the store, as the form does. */
async function stage(page, { type, id, original, edited, relationships }) {
  return page.evaluate(
    ([type, id, original, edited, relationships]) =>
      window.$nuxt.$store.dispatch('authoringCart/stage', {
        type,
        id,
        original,
        edited,
        relationships,
      }),
    [type, id, original, edited, relationships]
  )
}

const count = (page) => page.evaluate(() => window.$nuxt.$store.getters['authoringCart/count'])

/** Edits made and not staged, which is where new content starts. */
const drafts = (page) =>
  page.evaluate(() => Object.keys(window.$nuxt.$store.state.authoringCart.drafts).length)

// Every test in this file, not only the first describe: a build knows where
// sessions publish themselves and looks there on load, so anything asserting
// "no backend" would depend on whether one happens to be running.
test.beforeEach(({ page }) => isolateFromPublishedSessions(page))

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

    // The drawer starts closed on a fresh load: whether a panel is open is a
    // property of this visit, not of the work. The header says what is held.
    await expect(page.getByTestId('authoring-cart-toggle')).toContainText('Edits 1')
    expect(await count(page)).toBe(1)

    await page.getByTestId('authoring-cart-toggle').click()
    await expect(page.getByTestId('authoring-cart-count')).toContainText('1 change')
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
    await expect(page.getByTestId('authoring-drawer')).toHaveCount(0)
  })

  test('discarding empties the cart and does not come back', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, { type: 'node--article', id: 'abc', original: {}, edited: { title: 'A' } })
    // Discard lives with the other destinations now.
    await page.getByTestId('cart-tab-send').click()
    await page.getByTestId('authoring-cart-discard').click()

    await expect(page.getByTestId('authoring-cart-empty')).toBeVisible()
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByTestId('authoring-drawer')).toHaveCount(0)
  })
})

test.describe('adding content', () => {
  test('a new article can be abandoned', async ({ page }) => {
    await page.goto('/authoring', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()
    await page.getByTestId('cart-tab-add').click()
    await page.getByTestId('authoring-add').click()
    await expect(page.getByTestId('authoring-add-cancel')).toBeVisible()
    // Pressing Add is opening a form, not deciding to send anything, so it is
    // unstaged until it is staged.
    expect(await count(page)).toBe(0)
    expect(await drafts(page)).toBe(1)

    // And abandoning it leaves nothing behind at all.
    await page.getByTestId('authoring-add-cancel').click()
    await expect(page.getByTestId('authoring-add-cancel')).toHaveCount(0)
    expect(await count(page)).toBe(0)
    expect(await drafts(page)).toBe(0)
  })

  test('a new article can be put down without being thrown away', async ({ page }) => {
    await page.goto('/authoring', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()
    await page.getByTestId('cart-tab-add').click()
    await page.getByTestId('authoring-add').click()

    // "Done" means finished with the form, not finished with the idea. Without
    // it the only ways out were to discard the work or leave the form open.
    await page.getByTestId('authoring-add-done').click()
    await expect(page.getByTestId('authoring-add-done')).toHaveCount(0)
    expect(await count(page)).toBe(1)
  })

  test('the drawer can be opened with nothing staged in it', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()

    // Edit mode opens its own surface, and the toggle is there to shut it and
    // bring it back. Counting staged changes alone left an author who had
    // edited things and staged none of them with no way in at all.
    await expect(page.getByTestId('authoring-cart')).toBeVisible()
    await page.getByTestId('authoring-cart-toggle').click()
    await expect(page.getByTestId('authoring-cart')).toHaveCount(0)
    await page.getByTestId('authoring-cart-toggle').click()
    await expect(page.getByTestId('authoring-cart')).toBeVisible()
  })

  test('a deletion reads as a deletion, not as an edit', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.evaluate(() =>
      window.$nuxt.$store.dispatch('authoringCart/stageDeletion', {
        type: 'node--article',
        id: 'gone',
      })
    )
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))

    // Tidied for the wire, a deletion is indistinguishable from an edit that
    // changed nothing, so the drawer reads the cart's own copy.
    await expect(page.getByTestId('cart-method-gone')).toHaveText('Delete')
  })

  test('unticking a deletion holds it back rather than calling it off', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.evaluate(() =>
      window.$nuxt.$store.dispatch('authoringCart/stageDeletion', {
        type: 'node--article',
        id: 'gone',
      })
    )
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))

    await page.getByTestId('cart-select-gone').click()

    // Unticking means "not in this commit", not "forget I said it". It
    // disappearing entirely read as a discard nobody asked for.
    expect(await count(page)).toBe(0)
    await expect(page.getByTestId('cart-method-draft-gone')).toHaveText('Delete')

    // And it can be put back.
    await page.getByTestId('cart-stage-gone').click()
    expect(await count(page)).toBe(1)
    await expect(page.getByTestId('cart-method-gone')).toHaveText('Delete')
  })

  test('the staged json reads as a change, not just its result', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'The old title' },
      edited: { title: 'The new title' },
    })
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))
    await page.getByTestId('authoring-cart-expand').first().click()

    // A staged resource is a delta: on its own it says what a field will be
    // without saying what it was, which is the half a reviewer needs.
    await expect(page.getByTestId('json-was')).toContainText('The old title')
    await expect(page.getByTestId('json-leaf').filter({ hasText: 'The new title' })).toBeVisible()
  })

  test('adding content is reachable from any page', async ({ page }) => {
    // Editing became site-wide and adding was left on one route.
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()
    await page.getByTestId('cart-tab-add').click()
    await expect(page.getByTestId('authoring-add')).toBeVisible()
  })

  test('a pull request needs signing in, and says so', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))

    // A token rather than an OAuth button: GitHub's device flow endpoints send
    // no CORS headers, so a browser cannot reach them at all.
    await page.getByTestId('cart-tab-send').click()
    await expect(page.getByTestId('authoring-cart-pr')).toBeDisabled()
    await expect(page.getByTestId('github-token')).toBeVisible()
    await expect(page.getByTestId('github-sign-in')).toBeDisabled()
  })

  test('GitHub says no and the cart says why', async ({ page }) => {
    await page.route('https://api.github.com/**', (route) =>
      route.fulfill({
        status: 401,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({ message: 'Bad credentials' }),
      })
    )
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))

    await page.getByTestId('github-repository').fill('o/r')
    await page.getByTestId('github-token').fill('not-a-real-token')
    await page.getByTestId('github-sign-in').click()

    await expect(page.getByTestId('github-error')).toContainText('did not accept')
    // And the work is still there to try again with.
    expect(await count(page)).toBe(1)
  })

  test('signing in offers the pull request, and staged work survives it', async ({ page }) => {
    await page.route('https://api.github.com/**', (route) => {
      const url = route.request().url()
      const json = (body) =>
        route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
          body: JSON.stringify(body),
        })
      if (url.endsWith('/user')) return json({ login: 'someone' })
      return json({ full_name: 'o/r', default_branch: 'main', permissions: { push: true } })
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))

    await page.getByTestId('github-repository').fill('o/r')
    await page.getByTestId('github-token').fill('a-token')
    await page.getByTestId('github-sign-in').click()

    await expect(page.getByTestId('github-signed-in')).toContainText('someone')
    await expect(page.getByTestId('authoring-cart-pr')).toBeEnabled()
    expect(await count(page)).toBe(1)
  })

  test('someone who can only propose changes is offered only that', async ({ page }) => {
    // Contents and Pull requests are enough to propose a change. Starting a
    // backend also needs Actions, and a button that cannot work is worse than
    // no button.
    await page.route('https://api.github.com/**', (route) => {
      const url = route.request().url()
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
          body: JSON.stringify(body),
        })
      if (url.endsWith('/user')) return json({ login: 'a-contributor' })
      if (url.includes('/actions/workflows/')) return json({ message: 'Not Found' }, 404)
      return json({ full_name: 'o/r', default_branch: 'main', permissions: { push: true } })
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))
    await page.getByTestId('cart-tab-send').click()
    await page.getByTestId('github-repository').fill('o/r')
    await page.getByTestId('github-token').fill('a-token')
    await page.getByTestId('github-sign-in').click()

    await expect(page.getByTestId('github-signed-in')).toContainText('a-contributor')
    await expect(page.getByTestId('authoring-cart-pr')).toBeEnabled()
    await expect(page.getByTestId('github-start-backend')).toHaveCount(0)
  })

  test('someone who can start a backend is offered that too', async ({ page }) => {
    const dispatched = []
    await page.route('https://api.github.com/**', (route) => {
      const url = route.request().url()
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
          body: JSON.stringify(body),
        })
      if (url.endsWith('/dispatches')) {
        dispatched.push(JSON.parse(route.request().postData()))
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
      }
      if (url.endsWith('/user')) return json({ login: 'the-maintainer' })
      if (url.includes('/runs?') || url.includes('/runs&'))
        return json({
          workflow_runs: [
            {
              id: 99,
              html_url: 'https://github.com/o/r/actions/runs/99',
              status: 'in_progress',
              conclusion: null,
              created_at: new Date().toISOString(),
            },
          ],
        })
      if (url.includes('/actions/workflows/')) return json({ id: 1, name: 'Authoring session' })
      return json({ full_name: 'o/r', default_branch: 'main', permissions: { push: true } })
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))
    await page.getByTestId('cart-tab-send').click()
    await page.getByTestId('github-repository').fill('o/r')
    await page.getByTestId('github-token').fill('a-token')
    await page.getByTestId('github-sign-in').click()

    await expect(page.getByTestId('github-start-backend')).toBeVisible()
    await page.getByTestId('github-start-backend').click()

    await expect(page.getByTestId('github-start-message')).toContainText('connects itself')
    // The same workflow a maintainer runs by hand, on the default branch.
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].ref).toBe('main')

    // Dispatching a second one queues it behind the first rather than doing
    // anything useful, so the control stays out of action while one is going.
    await expect(page.getByTestId('github-start-backend')).toBeDisabled()
    await expect(page.getByTestId('github-spinner')).toBeVisible()

    // The dispatch answers with no run id, so the link arrives once the run
    // can be found by when it started.
    await expect(page.getByTestId('github-run-link')).toHaveAttribute(
      'href',
      'https://github.com/o/r/actions/runs/99'
    )
    await expect(page.getByTestId('github-start-backend')).toContainText('Building')
  })

  test('the drawer is tabbed, and the changes tab counts them', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })

    // Adding, the changes and the ways to send them are three jobs, and block
    // and paragraph placement are coming, so they are panels rather than one
    // long column.
    await expect(page.getByTestId('cart-tab-changes')).toContainText('1')
    await expect(page.getByTestId('authoring-add')).toBeHidden()

    await page.getByTestId('cart-tab-add').click()
    await expect(page.getByTestId('authoring-add')).toBeVisible()
    await expect(page.getByTestId('authoring-cart-expand')).toBeHidden()

    await page.getByTestId('cart-tab-send').click()
    await expect(page.getByTestId('authoring-cart-commit')).toBeVisible()
  })

  test('a preview can be looked at at a real device width', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.getByTestId('cart-preview-abc').click()

    // The width is real, so the site's own media queries decide the layout. A
    // narrow window scales the result down (see below) but never narrows it: a
    // desktop render squeezed to 900px is a 900px layout, not a desktop one.
    await page.getByTestId('preview-width').selectOption({ label: 'Phone' })
    await expect(page.getByTestId('preview-width-note')).toContainText('375px')
    const frame = page.getByTestId('preview-frame')
    expect(await frame.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(375)

    // Free is the default, and returning to it is not a fixed size at all.
    await page.getByTestId('preview-width').selectOption({ label: 'Free' })
    await expect(page.getByTestId('preview-width-note')).toHaveCount(0)
  })

  test('a page wider than the window is scaled down to fit, not cut off', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.getByTestId('cart-preview-abc').click()
    await page.getByTestId('preview-width').selectOption({ label: 'Desktop' })

    // Laid out at 1440 and drawn smaller. Both halves matter: the first is what
    // makes it a desktop preview, the second is what makes it visible.
    const frame = page.getByTestId('preview-frame')
    const size = () =>
      frame.evaluate((el) => {
        const canvas = el.closest('.overflow-auto')
        return {
          layout: el.offsetWidth,
          drawn: Math.round(el.getBoundingClientRect().width),
          room: canvas.clientWidth,
          scrolls: canvas.scrollWidth > canvas.clientWidth + 2,
        }
      })
    const fitted = await size()
    expect(fitted.layout).toBe(1440)
    expect(fitted.drawn).toBeLessThan(fitted.layout)
    expect(fitted.drawn).toBeLessThanOrEqual(fitted.room)
    expect(fitted.scrolls).toBe(false)

    // And the amount it shrank by is a control, not just a consequence. Read
    // rather than asserted, because it follows from whatever room the modal has.
    const percent = Math.round((fitted.drawn / fitted.layout) * 100)
    await expect(page.getByTestId('preview-zoom')).toContainText(`Fit (${percent}%)`)

    await page.getByTestId('preview-zoom').selectOption('0.5')
    expect(await size()).toMatchObject({ layout: 1440, drawn: 720, scrolls: false })

    // Asking for full size is allowed, and then it does scroll.
    await page.getByTestId('preview-zoom').selectOption('1')
    expect(await size()).toMatchObject({ layout: 1440, drawn: 1440, scrolls: true })
  })

  test('the controls keep their own width whatever the page is set to', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.getByTestId('cart-preview-abc').click()

    // The toolbar used to live inside the frame, so choosing a phone gave four
    // controls 375px to fit into, and they wrapped. The thing being resized is
    // the page, not the controls for it.
    const toolbarWidth = () =>
      page
        .getByTestId('authoring-preview')
        .locator('.border-b')
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().width))

    const wide = await toolbarWidth()
    await page.getByTestId('preview-width').selectOption({ label: 'Phone' })
    await expect(page.getByTestId('preview-frame')).toHaveAttribute('style', /375px/)
    expect(await toolbarWidth()).toBe(wide)
  })

  test('the preview covers the page rather than sitting inside the drawer', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.getByTestId('cart-preview-abc').click()

    // Rendered from inside a scrolling, sticky, stacked column, so it is moved
    // to the body: otherwise the header shows through it.
    const parent = await page
      .getByTestId('authoring-preview')
      .evaluate((el) => el.parentElement.tagName)
    expect(parent).toBe('BODY')
    // And the page behind it does not scroll while it is open.
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden')

    await page.getByTestId('preview-close').click()
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('visible')
  })

  test('a backend it started is not the same as the one you are on', async ({ page }) => {
    // Two different things: one exists, and you are editing against it. Saying
    // "backend running" while an author works against a different backend is
    // the interface reporting something it never checked.
    await page.route(/raw\.githubusercontent\.com/, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          url: 'http://started.test',
          clientId: 'c',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      })
    )
    await page.route('http://elsewhere.test/jsonapi', (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/vnd.api+json',
          'access-control-allow-origin': '*',
        },
        body: JSON.stringify({ jsonapi: { version: '1.1' } }),
      })
    )
    await page.route('https://api.github.com/**', (route) => {
      const url = route.request().url()
      const json = (body) =>
        route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
          body: JSON.stringify(body),
        })
      if (url.endsWith('/user')) return json({ login: 'someone' })
      if (url.includes('/actions/workflows/')) return json({ id: 1 })
      return json({ full_name: 'o/r', default_branch: 'main', permissions: { push: true } })
    })

    // Connected to one backend by hand, and told about another.
    await page.goto(`/?backend=${encodeURIComponent('http://elsewhere.test')}`, {
      waitUntil: 'networkidle',
    })
    await page.getByTestId('authoring-edit-toggle').click()
    await page.getByTestId('cart-tab-send').click()
    await page.getByTestId('github-repository').fill('o/r')
    await page.getByTestId('github-token').fill('a-token')
    await page.getByTestId('github-sign-in').click()
    await expect(page.getByTestId('github-signed-in')).toBeVisible()

    await page.evaluate(async () => {
      const found = await window.$nuxt.$authoring.discover()
      window.$nuxt.$authoringGithub.state.started = found
    })

    await expect(page.getByTestId('github-started-elsewhere')).toBeVisible()
    // And moving is offered, not done for you.
    expect(await page.evaluate(() => window.$nuxt.$authoring.state.url)).toBe(
      'http://elsewhere.test'
    )
  })

  test('each change says what it will do to the backend', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByTestId('authoring-edit-toggle').click()

    // Taken from the request the commit will make, not described alongside it:
    // creating, changing and removing read very differently to someone
    // deciding what to send.
    await stage(page, {
      type: 'node--article',
      id: 'edited',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    const created = await page.evaluate(() =>
      window.$nuxt.$store.dispatch('authoringCart/stageNew', {
        type: 'node--article',
        attributes: { title: 'Brand new' },
      })
    )
    await page.evaluate(() =>
      window.$nuxt.$store.dispatch('authoringCart/stageDeletion', {
        type: 'node--article',
        id: 'removed',
      })
    )

    await expect(page.getByTestId('cart-method-edited')).toHaveText('Update')
    await expect(page.getByTestId(`cart-method-${created}`)).toHaveText('New')
    await expect(page.getByTestId('cart-method-removed')).toHaveText('Delete')
  })

  test('a visitor is offered no drawer at all', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.getByTestId('authoring-cart-toggle')).toHaveCount(0)
  })
})

test.describe('the drawer as a review surface', () => {
  test('staged and unstaged are shown apart', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, {
      type: 'node--article',
      id: 'staged-one',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.evaluate(() =>
      window.$nuxt.$store.dispatch('authoringCart/saveDraft', {
        type: 'node--article',
        id: 'draft-one',
        attributes: { title: 'Typed, not staged' },
      })
    )
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))

    // One list made an unstaged edit look like something about to be sent.
    await expect(page.getByTestId('authoring-cart-expand')).toHaveCount(1)
    await expect(page.getByTestId('cart-unstaged-row')).toHaveCount(1)
    // And the count is still only what will be sent.
    expect(await count(page)).toBe(1)
  })

  test('the checkbox moves a change between staged and unstaged', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    await stage(page, {
      type: 'node--article',
      id: 'abc',
      original: { title: 'Was' },
      edited: { title: 'Is' },
    })
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))

    // One control for one idea. A checkbox that only scoped the commit was a
    // third state on top of the two the cart already had.
    await page.getByTestId('cart-select-abc').click()
    expect(await count(page)).toBe(0)
    await expect(page.getByTestId('cart-unstaged-row')).toHaveCount(1)

    // And back again.
    await page.getByTestId('cart-stage-abc').click()
    expect(await count(page)).toBe(1)
    await expect(page.getByTestId('cart-unstaged-row')).toHaveCount(0)
  })

  test('a reference cannot be left out of a commit that needs it', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const tagId = await page.evaluate(() =>
      window.$nuxt.$store.dispatch('authoringCart/stageNew', {
        type: 'taxonomy_term--tags',
        attributes: { name: 'Rye' },
        onlyIfReferenced: true,
      })
    )
    await stage(page, {
      type: 'node--article',
      id: 'article',
      original: {},
      edited: { title: 'Tagged' },
      relationships: { field_tags: { data: [{ type: 'taxonomy_term--tags', id: tagId }] } },
    })
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))

    // Said, not silently corrected: re-ticking what someone just unticked is
    // its own kind of wrong.
    await expect(page.getByTestId('cart-depends')).toContainText('Rye')
    await page.getByTestId(`cart-select-${tagId}`).click()
    await expect(page.getByTestId('cart-refusal')).toContainText('references this')
    // Refused, so it is still staged and the box is still ticked.
    expect(await count(page)).toBe(2)
    await expect(page.getByTestId(`cart-select-${tagId}`)).toBeChecked()
  })
})
