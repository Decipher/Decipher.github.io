// The sequence that turns a cart into a pull request.
//
// Driven against a fake GitHub, because the thing worth testing is the order
// and shape of the calls: a tree built on the wrong base, or a branch created
// before its commit exists, fails in ways that are hard to read afterwards.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  checkAccess,
  findRun,
  openChangeRequest,
  runIsFinished,
  startBackend,
} from '../../nuxt/lib/github-client.mjs'

/** A GitHub that records what it was asked and answers plausibly. */
function fakeGitHub({ overrides = {} } = {}) {
  const calls = []
  const answer = (body, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => body,
  })

  const fetch = async (url, init = {}) => {
    const path = url.replace('https://api.github.com', '')
    calls.push({ path, method: init.method || 'GET', body: init.body && JSON.parse(init.body) })

    for (const [match, response] of Object.entries(overrides)) {
      if (path.includes(match)) return response
    }
    if (path === '/user') return answer({ login: 'someone' })
    if (path.match(/^\/repos\/[^/]+\/[^/]+$/))
      return answer({ full_name: 'o/r', default_branch: 'main', permissions: { push: true } })
    if (path.includes('/git/refs/heads/')) return answer({ object: { sha: 'base-sha' } })
    if (path.includes('/git/blobs')) return answer({ sha: `blob-${calls.length}` })
    if (path.includes('/git/trees')) return answer({ sha: 'tree-sha' })
    if (path.includes('/git/commits')) return answer({ sha: 'commit-sha' })
    if (path.includes('/git/refs')) return answer({ ref: 'refs/heads/x' })
    if (path.includes('/pulls')) return answer({ html_url: 'https://github.com/o/r/pull/1' })
    return answer({ message: 'Not Found' }, 404)
  }

  return { fetch, calls }
}

const EXPORTED = {
  version: 1,
  resources: [{ type: 'node--article', id: 'a', attributes: { title: 'New' } }],
  deletions: [],
  files: [
    {
      resource: { type: 'node--article', id: 'a' },
      field: 'field_image',
      id: 'f1',
      name: 'red.png',
      contentType: 'image/png',
      data: 'data:image/png;base64,iVBORw0KGgo',
    },
  ],
}

test('signing in reports who you are and whether you may write', () => {
  const gh = fakeGitHub()
  return checkAccess({ repository: 'o/r', token: 't', fetch: gh.fetch }).then((result) => {
    assert.equal(result.ok, true)
    assert.equal(result.login, 'someone')
    assert.equal(result.defaultBranch, 'main')
  })
})

test('an account that cannot write is told so, by name', async () => {
  // A valid token with no write access is a signed-in author who cannot do the
  // one thing signing in was for, so both halves are reported.
  const gh = fakeGitHub({
    overrides: {
      '/repos/o/r': { ok: true, status: 200, json: async () => ({ permissions: { push: false } }) },
    },
  })
  const result = await checkAccess({ repository: 'o/r', token: 't', fetch: gh.fetch })
  assert.equal(result.ok, false)
  assert.equal(result.login, 'someone')
  assert.match(result.reason, /cannot write/)
})

test('a rejected token says so rather than reporting a missing repository', async () => {
  const gh = fakeGitHub({
    overrides: {
      '/user': { ok: false, status: 401, json: async () => ({ message: 'Bad credentials' }) },
    },
  })
  const result = await checkAccess({ repository: 'o/r', token: 'bad', fetch: gh.fetch })
  assert.equal(result.ok, false)
  assert.match(result.reason, /did not accept/)
})

test('a repository a token cannot see reads as one that is not there', async () => {
  // Which is what GitHub itself says: 404, not 403, so a private repository
  // does not leak its existence.
  const gh = fakeGitHub({
    overrides: {
      '/repos/o/r': { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) },
    },
  })
  const result = await checkAccess({ repository: 'o/r', token: 't', fetch: gh.fetch })
  assert.match(result.reason, /No such repository/)
})

test('a change request becomes one commit on a new branch, then a pull request', async () => {
  const gh = fakeGitHub()
  const result = await openChangeRequest({
    repository: 'o/r',
    token: 't',
    exported: EXPORTED,
    base: 'main',
    fetch: gh.fetch,
    now: new Date('2026-09-05T02:30:00Z'),
  })

  assert.equal(result.ok, true)
  assert.equal(result.url, 'https://github.com/o/r/pull/1')

  const order = gh.calls.filter((c) => c.method === 'POST').map((c) => c.path.split('/').pop())
  // Blob, tree, commit, ref, pull. A branch created before its commit exists
  // points at nothing, and a tree built on the wrong base silently reverts.
  assert.deepEqual(order, ['blobs', 'trees', 'commits', 'refs', 'pulls'])
})

test('the commit carries the image as a file, and the document points at it', async () => {
  const gh = fakeGitHub()
  await openChangeRequest({
    repository: 'o/r',
    token: 't',
    exported: EXPORTED,
    base: 'main',
    fetch: gh.fetch,
    now: new Date('2026-09-05T02:30:00Z'),
  })

  const blob = gh.calls.find((c) => c.path.includes('/git/blobs'))
  // The bytes go up as bytes, not as base64 inside a JSON file.
  assert.equal(blob.body.content, 'iVBORw0KGgo')
  assert.equal(blob.body.encoding, 'base64')

  const tree = gh.calls.find((c) => c.path.includes('/git/trees'))
  assert.equal(tree.body.base_tree, 'base-sha')
  const paths = tree.body.tree.map((entry) => entry.path)
  assert.ok(paths.some((p) => p.endsWith('/files/f1-red.png')))
  assert.ok(paths.some((p) => p.endsWith('/change.json')))

  const document = JSON.parse(tree.body.tree.find((e) => e.path.endsWith('change.json')).content)
  assert.equal(document.files[0].path, tree.body.tree[0].path)
  assert.equal(document.files[0].data, undefined)
})

test('the commit is built on the branch it will be merged into', async () => {
  const gh = fakeGitHub()
  await openChangeRequest({
    repository: 'o/r',
    token: 't',
    exported: EXPORTED,
    base: 'main',
    fetch: gh.fetch,
    now: new Date(),
  })
  const commit = gh.calls.find((c) => c.path.includes('/git/commits'))
  assert.deepEqual(commit.body.parents, ['base-sha'])
})

test('a failure is a reason, not an exception, and opens no pull request', async () => {
  const gh = fakeGitHub({
    overrides: {
      '/git/trees': { ok: false, status: 422, json: async () => ({ message: 'Tree too large' }) },
    },
  })
  const result = await openChangeRequest({
    repository: 'o/r',
    token: 't',
    exported: EXPORTED,
    base: 'main',
    fetch: gh.fetch,
    now: new Date(),
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /Tree too large/)
  // Nothing half done: the branch is created after the commit exists.
  assert.equal(
    gh.calls.some((c) => c.path.endsWith('/pulls') && c.method === 'POST'),
    false
  )
  assert.equal(
    gh.calls.some((c) => c.path === '/repos/o/r/git/refs' && c.method === 'POST'),
    false
  )
})

// Starting a backend from the site.
//
// The same workflow a maintainer runs by hand, and the same access control:
// `workflow_dispatch` is write-access only, and the token already had to prove
// write access to sign in. Nothing new is trusted.

test('starting a backend dispatches the workflow', async () => {
  const gh = fakeGitHub({
    overrides: { '/dispatches': { ok: true, status: 204, json: async () => null } },
  })
  const result = await startBackend({
    repository: 'o/r',
    token: 't',
    workflow: 'authoring.yml',
    ref: 'main',
    minutes: 30,
    fetch: gh.fetch,
  })

  assert.equal(result.ok, true)
  const call = gh.calls.find((c) => c.path.includes('/dispatches'))
  assert.equal(call.method, 'POST')
  assert.equal(call.body.ref, 'main')
  // Inputs are strings over the API, whatever they look like in the workflow.
  assert.equal(call.body.inputs.minutes, '30')
})

test('a token without Actions access is told exactly what it is missing', async () => {
  // "Forbidden" on its own sends someone to check the wrong permission.
  const gh = fakeGitHub({
    overrides: {
      '/dispatches': { ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) },
    },
  })
  const result = await startBackend({
    repository: 'o/r',
    token: 't',
    workflow: 'authoring.yml',
    fetch: gh.fetch,
  })
  assert.equal(result.ok, false)
  assert.match(result.reason, /Actions write/)
})

test('a missing workflow names the branch it looked on', async () => {
  // `workflow_dispatch` reads the workflow from the ref, so "not found" is
  // usually "not on that branch yet".
  const gh = fakeGitHub({
    overrides: {
      '/dispatches': { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) },
    },
  })
  const result = await startBackend({
    repository: 'o/r',
    token: 't',
    workflow: 'authoring.yml',
    ref: 'feature/x',
    fetch: gh.fetch,
  })
  assert.match(result.reason, /feature\/x/)
})

test('a dispatch is matched to its run by when it started', async () => {
  // `workflow_dispatch` answers 204 with no body, so the only way to find the
  // run is to ask what has started since. Matched on time rather than on being
  // newest, or someone else's run from a minute ago is mistaken for this one.
  const now = new Date()
  const old = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
  const gh = fakeGitHub({
    overrides: {
      '/runs': {
        ok: true,
        status: 200,
        json: async () => ({
          workflow_runs: [
            { id: 2, html_url: 'u2', status: 'queued', created_at: now.toISOString() },
            { id: 1, html_url: 'u1', status: 'completed', created_at: old },
          ],
        }),
      },
    },
  })

  const found = await findRun({
    repository: 'o/r',
    token: 't',
    workflow: 'authoring.yml',
    since: now.toISOString(),
    fetch: gh.fetch,
  })
  assert.equal(found.run.id, 2)
  assert.equal(found.run.status, 'queued')
})

test('a run that started long before this dispatch is not it', async () => {
  const gh = fakeGitHub({
    overrides: {
      '/runs': {
        ok: true,
        status: 200,
        json: async () => ({
          workflow_runs: [
            { id: 1, html_url: 'u1', status: 'completed', created_at: '2020-01-01T00:00:00Z' },
          ],
        }),
      },
    },
  })
  const found = await findRun({
    repository: 'o/r',
    token: 't',
    workflow: 'authoring.yml',
    since: new Date().toISOString(),
    fetch: gh.fetch,
  })
  assert.equal(found.run, null)
})

test('only a finished run stops the waiting', () => {
  assert.equal(runIsFinished({ status: 'queued' }), false)
  assert.equal(runIsFinished({ status: 'in_progress' }), false)
  assert.equal(runIsFinished({ status: 'completed' }), true)
  assert.equal(runIsFinished(null), false)
})
