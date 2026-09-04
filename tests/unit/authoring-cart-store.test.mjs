// The cart store's behaviour: staging without a backend, surviving a reload,
// and what a partial commit failure leaves behind.
//
// Exercised through its own mutations and actions rather than through Vuex, so
// these run under `node --test` with no Vue. `fetch` and storage are both
// injected or faked, so nothing here touches a network or a real browser.

import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'

/** A localStorage good enough for the store, and breakable on demand. */
function fakeStorage({ refuse = false } = {}) {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (refuse) throw new Error('storage refused')
      data.set(k, v)
    },
    removeItem: (k) => data.delete(k),
    _data: data,
  }
}

let mod
beforeEach(async () => {
  globalThis.window = { localStorage: fakeStorage() }
  // Re-imported per test so module-level state cannot leak between them.
  mod = await import(`../../nuxt/store/authoringCart.js?t=${Date.now()}`)
})

/** Run an action against a real state object and its own mutations. */
function harness(initial = {}) {
  const state = { ...mod.state(), ...initial }
  const commit = (name, payload) => mod.mutations[name](state, payload)
  const getters = {
    get isEmpty() {
      return !Object.keys(state.entries).length
    },
    get count() {
      return Object.keys(state.entries).length
    },
  }
  return { state, commit, getters, dispatch: () => {} }
}

test('staging with no backend holds the change and sends nothing', async () => {
  const ctx = harness()
  const staged = await mod.actions.stage(ctx, {
    type: 'node--article',
    id: '1',
    original: { title: 'Before' },
    edited: { title: 'After' },
  })
  assert.equal(staged, true)
  assert.equal(ctx.getters.count, 1)
  assert.deepEqual(ctx.state.entries['node--article:1'].attributes, { title: 'After' })
})

test('staging an unchanged field stages nothing', async () => {
  const ctx = harness()
  const staged = await mod.actions.stage(ctx, {
    type: 'node--article',
    id: '1',
    original: { title: 'Same' },
    edited: { title: 'Same' },
  })
  assert.equal(staged, false)
  assert.equal(ctx.getters.count, 0)
})

test('a staged cart is written to storage and can be restored', async () => {
  const ctx = harness()
  await mod.actions.stage(ctx, {
    type: 'node--article',
    id: '1',
    original: {},
    edited: { title: 'A' },
  })
  assert.ok(window.localStorage.getItem('authoring.cart'))

  const fresh = harness()
  mod.actions.restore(fresh)
  assert.equal(fresh.getters.count, 1)
})

test('a browser that refuses storage still allows editing, and says so', async () => {
  window.localStorage = fakeStorage({ refuse: true })
  const ctx = harness()
  await mod.actions.stage(ctx, {
    type: 'node--article',
    id: '1',
    original: {},
    edited: { title: 'A' },
  })
  // The edit is held for this page, but the store stops claiming it will last.
  assert.equal(ctx.getters.count, 1)
  assert.equal(ctx.state.persistent, false)
})

test('discarding empties the cart and clears storage', async () => {
  const ctx = harness()
  await mod.actions.stage(ctx, { type: 'node--article', id: '1', original: {}, edited: { t: 1 } })
  await mod.actions.discardAll(ctx)
  assert.equal(ctx.getters.count, 0)
  assert.equal(window.localStorage.getItem('authoring.cart'), null)
})

test('committing without a backend or a token sends nothing', async () => {
  const ctx = harness()
  await mod.actions.stage(ctx, { type: 'node--article', id: '1', original: {}, edited: { t: 1 } })

  let called = false
  const fetchImpl = async () => {
    called = true
    return { ok: true }
  }

  assert.equal((await mod.actions.commit(ctx, { token: 'x', fetch: fetchImpl })).ok, false)
  assert.equal(
    (await mod.actions.commit(ctx, { backendUrl: 'https://b.test', fetch: fetchImpl })).ok,
    false
  )
  assert.equal(called, false)
  assert.equal(ctx.getters.count, 1, 'the cart is untouched by a refused commit')
})

test('a successful commit sends one PATCH per resource and empties the cart', async () => {
  const ctx = harness()
  await mod.actions.stage(ctx, { type: 'node--article', id: '1', original: {}, edited: { t: 1 } })
  await mod.actions.stage(ctx, { type: 'node--page', id: '2', original: {}, edited: { t: 2 } })

  const sent = []
  const fetchImpl = async (url, init) => {
    sent.push({ url, method: init.method, auth: init.headers.Authorization })
    return { ok: true, json: async () => ({}) }
  }

  const result = await mod.actions.commit(ctx, {
    backendUrl: 'https://b.test',
    token: 'tok',
    fetch: fetchImpl,
  })

  assert.deepEqual(result, { ok: true, sent: 2, failed: 0 })
  assert.equal(ctx.getters.count, 0)
  assert.equal(sent.length, 2)
  assert.equal(sent[0].method, 'PATCH')
  assert.equal(sent[0].auth, 'Bearer tok')
  assert.ok(sent.some((s) => s.url.endsWith('/jsonapi/node/article/1')))
})

test('a partial failure keeps only what was rejected, with its reason', async () => {
  const ctx = harness()
  await mod.actions.stage(ctx, { type: 'node--article', id: 'ok', original: {}, edited: { t: 1 } })
  await mod.actions.stage(ctx, { type: 'node--article', id: 'bad', original: {}, edited: { t: 2 } })

  const fetchImpl = async (url) =>
    url.endsWith('/bad')
      ? {
          ok: false,
          status: 422,
          json: async () => ({ errors: [{ detail: 'Title cannot be empty.' }] }),
        }
      : { ok: true, json: async () => ({}) }

  const result = await mod.actions.commit(ctx, {
    backendUrl: 'https://b.test',
    token: 'tok',
    fetch: fetchImpl,
  })

  assert.equal(result.ok, false)
  assert.deepEqual({ sent: result.sent, failed: result.failed }, { sent: 1, failed: 1 })
  // The author is left with exactly the work still to do.
  assert.equal(ctx.getters.count, 1)
  assert.ok(ctx.state.entries['node--article:bad'])
  assert.match(ctx.state.errors['node--article:bad'], /Title cannot be empty/)
})

test('a network failure keeps the resource and records why', async () => {
  const ctx = harness()
  await mod.actions.stage(ctx, { type: 'node--article', id: '1', original: {}, edited: { t: 1 } })

  const result = await mod.actions.commit(ctx, {
    backendUrl: 'https://b.test',
    token: 'tok',
    fetch: async () => {
      throw new Error('Failed to fetch')
    },
  })

  assert.equal(result.failed, 1)
  assert.equal(ctx.getters.count, 1)
  assert.match(ctx.state.errors['node--article:1'], /Failed to fetch/)
})
