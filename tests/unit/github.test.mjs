// Opening a pull request from a page with no server behind it.
//
// Sign-in is a token the author supplies rather than an OAuth flow, and that is
// a finding rather than a shortcut: GitHub's device flow endpoints send no CORS
// headers, so a browser cannot reach them, and every other flow needs a client
// secret and therefore a server. Verified from a real page origin on
// 2026-09-05: `github.com/login/device/code` fails before the request is made,
// `api.github.com` answers 200 with an Authorization header on it.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  apiUrl,
  base64FromDataUrl,
  branchName,
  canWrite,
  filePath,
  headers,
  parseRepository,
  pullRequestBody,
  requestDocument,
  requestPaths,
} from '../../nuxt/lib/github.mjs'

test('a repository is recognised however it is written', () => {
  const expected = { owner: 'Decipher', name: 'site', full: 'Decipher/site' }
  assert.deepEqual(parseRepository('Decipher/site'), expected)
  assert.deepEqual(parseRepository('https://github.com/Decipher/site'), expected)
  assert.deepEqual(parseRepository('https://github.com/Decipher/site.git'), expected)
  assert.deepEqual(parseRepository('  Decipher/site/  '), expected)
})

test('anything that is not one repository is refused', () => {
  // Guessing here would send someone's content to the wrong place.
  assert.equal(parseRepository('Decipher'), null)
  assert.equal(parseRepository('Decipher/site/extra'), null)
  assert.equal(parseRepository(''), null)
  assert.equal(parseRepository(null), null)
})

test('requests go to the API, not to the website', () => {
  // github.com is where the CORS wall is. api.github.com is not.
  assert.equal(
    apiUrl('Decipher/site', '/pulls'),
    'https://api.github.com/repos/Decipher/site/pulls'
  )
  assert.equal(apiUrl('nonsense'), null)
})

test('the token travels as a bearer, with the API version pinned', () => {
  const sent = headers('tok')
  assert.equal(sent.Authorization, 'Bearer tok')
  assert.equal(sent.Accept, 'application/vnd.github+json')
  assert.ok(sent['X-GitHub-Api-Version'])
  // Anonymous is a legitimate state: a public repository can be read.
  assert.equal(headers().Authorization, undefined)
})

test('write access is push, not a role name', () => {
  // A role is a label GitHub can rename. Push is the thing being asked about.
  assert.equal(canWrite({ permissions: { push: true, pull: true } }), true)
  assert.equal(canWrite({ permissions: { push: false, pull: true } }), false)
  assert.equal(canWrite({}), false)
  assert.equal(canWrite(null), false)
})

test('a branch says what it is and when', () => {
  const branch = branchName(new Date('2026-09-05T02:30:00Z'))
  assert.equal(branch, 'content/edits-20260905-023000')
  assert.deepEqual(requestPaths(branch), {
    folder: 'requests/edits-20260905-023000',
    document: 'requests/edits-20260905-023000/change.json',
  })
})

test('a filename cannot escape its folder', () => {
  const path = filePath('requests/x', { id: 'f1', name: '../../etc/passwd' })
  assert.ok(!path.includes('..'))
  assert.ok(path.startsWith('requests/x/files/f1-'))
})

test('two files with the same name stay apart', () => {
  // Two fields can hold pictures called photo.png, and the document refers to
  // files by id.
  const a = filePath('r', { id: 'f1', name: 'photo.png' })
  const b = filePath('r', { id: 'f2', name: 'photo.png' })
  assert.notEqual(a, b)
})

test('a data URL gives up just its payload', () => {
  assert.equal(base64FromDataUrl('data:image/png;base64,iVBORw0KGgo'), 'iVBORw0KGgo')
  assert.equal(base64FromDataUrl(''), '')
  assert.equal(base64FromDataUrl(null), '')
})

test('the committed document points at files rather than embedding them', () => {
  // The cart's own export embeds bytes so it can stand alone as a download. In
  // a commit that is a megabyte of base64 in a file nobody can read a diff of,
  // and no actual image anywhere.
  const doc = requestDocument(
    {
      version: 1,
      resources: [{ type: 'node--article', id: 'a' }],
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
    },
    'requests/x'
  )

  assert.equal(doc.files[0].path, 'requests/x/files/f1-red.png')
  assert.equal(doc.files[0].data, undefined)
  assert.equal(doc.files[0].field, 'field_image')
  assert.deepEqual(doc.resources, [{ type: 'node--article', id: 'a' }])
})

test('the pull request says what it carries', () => {
  const body = pullRequestBody({
    resources: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    deletions: [{ id: 'c' }],
    files: [{ id: 'f1' }],
  })
  assert.match(body, /2 changes/)
  assert.match(body, /1 deleted/)
  assert.match(body, /1 file/)
  // And says the branch is not the content, which is the surprising part.
  assert.match(body, /A job applies it/)
})
