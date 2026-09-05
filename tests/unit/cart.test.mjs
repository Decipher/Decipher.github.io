// What the cart decides: what counts as a change, how repeated edits fold
// together, and what a staged resource looks like on the wire.
//
// These are the rules a wrong answer corrupts someone's content with, so they
// are tested directly rather than through a component.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cartKey,
  changedFields,
  commitOrder,
  requestUrl,
  requestMethod,
  dependencyMap,
  requiredBy,
  withDependencies,
  deepEqual,
  exportCart,
  exportSummary,
  isEmptyResource,
  mergeEntry,
  patchBody,
  patchUrl,
  tidyResource,
} from '../../nuxt/lib/cart.mjs'

test('one cart entry per entity', () => {
  assert.equal(cartKey('node--article', 'abc'), 'node--article:abc')
})

test('only changed fields are staged', () => {
  const original = { title: 'Before', body: { value: 'same' } }
  const edited = { title: 'After', body: { value: 'same' } }
  assert.deepEqual(changedFields(original, edited), { title: 'After' })
})

test('an edit that changes nothing stages nothing', () => {
  const same = { title: 'Same', body: { value: 'x' } }
  assert.deepEqual(changedFields(same, { ...same }), {})
})

test('a field is compared by content, not by identity', () => {
  // The form hands back new objects every render. Comparing by reference would
  // stage every field on every keystroke.
  const original = { body: { value: 'text', format: 'basic_html' } }
  const edited = { body: { value: 'text', format: 'basic_html' } }
  assert.deepEqual(changedFields(original, edited), {})
})

test('a field set to empty is a change, not an absence', () => {
  assert.deepEqual(changedFields({ title: 'Something' }, { title: '' }), { title: '' })
})

test('deepEqual handles arrays, order included', () => {
  assert.equal(deepEqual([1, 2], [1, 2]), true)
  assert.equal(deepEqual([1, 2], [2, 1]), false)
  // Ordering is meaningful for a multi-value field, so a reorder is a change.
  assert.equal(deepEqual({ a: [1] }, { a: [1] }), true)
  assert.equal(deepEqual(null, undefined), false)
})

test('a second edit to one entity merges rather than replacing', () => {
  const first = { type: 'node--article', id: '1', attributes: { title: 'A' } }
  const second = { type: 'node--article', id: '1', attributes: { body: 'B' } }
  const merged = mergeEntry(first, second)
  assert.deepEqual(merged.attributes, { title: 'A', body: 'B' })
})

test('a later edit to the same field wins', () => {
  const first = { type: 'node--article', id: '1', attributes: { title: 'A' } }
  const second = { type: 'node--article', id: '1', attributes: { title: 'B' } }
  assert.equal(mergeEntry(first, second).attributes.title, 'B')
})

test('relationships merge alongside attributes', () => {
  const first = { type: 'node--article', id: '1', relationships: { tags: { data: [] } } }
  const second = { type: 'node--article', id: '1', attributes: { title: 'A' } }
  const merged = mergeEntry(first, second)
  assert.ok(merged.relationships.tags)
  assert.equal(merged.attributes.title, 'A')
})

test('an empty half is dropped from the resource', () => {
  const tidy = tidyResource({
    type: 'node--article',
    id: '1',
    attributes: { title: 'A' },
    relationships: {},
  })
  assert.deepEqual(Object.keys(tidy).sort(), ['attributes', 'id', 'type'])
})

test('a resource with nothing in it is recognised as empty', () => {
  assert.equal(isEmptyResource({ type: 'node--article', id: '1', attributes: {} }), true)
  assert.equal(
    isEmptyResource({ type: 'node--article', id: '1', attributes: { title: 'A' } }),
    false
  )
})

test('the PATCH body is a JSON:API document carrying the id', () => {
  const body = patchBody({ type: 'node--article', id: 'abc', attributes: { title: 'A' } })
  // Drupal rejects a PATCH whose body omits the id, even though it is in the URL.
  assert.deepEqual(body, {
    data: { type: 'node--article', id: 'abc', attributes: { title: 'A' } },
  })
})

test('the PATCH url follows the entity_type/bundle path', () => {
  assert.equal(
    patchUrl('https://backend.test', 'node--article', 'abc'),
    'https://backend.test/jsonapi/node/article/abc'
  )
  // A trailing slash on the backend must not double up.
  assert.equal(
    patchUrl('https://backend.test/', 'node--article', 'abc'),
    'https://backend.test/jsonapi/node/article/abc'
  )
})

test('a type with no bundle still resolves', () => {
  assert.equal(patchUrl('https://backend.test', 'user', '1'), 'https://backend.test/jsonapi/user/1')
})

test('the export is stable regardless of staging order', () => {
  const a = { 'node--article:2': { type: 'node--article', id: '2', attributes: { t: 2 } } }
  const b = { 'node--article:1': { type: 'node--article', id: '1', attributes: { t: 1 } } }
  const one = exportCart({ ...a, ...b }, { generatedAt: 'fixed' })
  const two = exportCart({ ...b, ...a }, { generatedAt: 'fixed' })
  // An export that reordered itself would show as a change in every diff.
  assert.deepEqual(one, two)
  assert.deepEqual(
    one.resources.map((r) => r.id),
    ['1', '2']
  )
})

test('the export is versioned', () => {
  assert.equal(exportCart({}, { generatedAt: 'fixed' }).version, 1)
})

test('the summary says what changed', () => {
  const entries = {
    'node--article:1': { type: 'node--article', id: '1', attributes: {} },
    'node--page:2': { type: 'node--page', id: '2', attributes: {} },
  }
  assert.equal(exportSummary(entries), 'chore(content): edit 2 entities (node)')
  assert.equal(
    exportSummary({ 'media--image:1': { type: 'media--image', id: '1' } }),
    'chore(content): edit 1 entity (media)'
  )
  assert.equal(exportSummary({}), 'chore(content): no changes')
})

// Staging twice, where the second edit puts a field back the way it was.
//
// A staged edit is a delta, so a reverted field simply stops appearing in it.
// Merging the new delta on top of the old one then keeps the abandoned value
// forever: the form shows the original, the cart holds the edit, and committing
// writes back a change the author cannot see and did not ask for.

test('a field put back the way it was stops being staged', () => {
  const first = mergeEntry(null, {
    type: 'node--article',
    id: 'a',
    attributes: { title: 'Edited', body: { value: 'Also edited' } },
  })

  // Second pass: the author reverted the title, so it is not in the delta,
  // but the body edit stands.
  const second = mergeEntry(
    first,
    { type: 'node--article', id: 'a', attributes: { body: { value: 'Also edited' } } },
    { attributes: ['title', 'body'] }
  )

  assert.deepEqual(Object.keys(second.attributes), ['body'])
  assert.equal(second.attributes.title, undefined)
})

test('a field the form never showed stays staged', () => {
  const first = mergeEntry(null, {
    type: 'node--article',
    id: 'a',
    attributes: { title: 'Edited' },
  })

  // A different form, without a title on it. Absent is not the same as
  // reverted, and dropping it would lose an edit the author made elsewhere.
  const second = mergeEntry(
    first,
    { type: 'node--article', id: 'a', attributes: { body: { value: 'New' } } },
    { attributes: ['body'] }
  )

  assert.equal(second.attributes.title, 'Edited')
  assert.deepEqual(second.attributes.body, { value: 'New' })
})

test('a relationship put back the way it was stops being staged', () => {
  const first = mergeEntry(null, {
    type: 'node--article',
    id: 'a',
    relationships: { field_tags: { data: [{ type: 'taxonomy_term--tags', id: '1' }] } },
  })

  const second = mergeEntry(
    first,
    { type: 'node--article', id: 'a', relationships: {} },
    { relationships: ['field_tags', 'uid'] }
  )

  assert.deepEqual(second.relationships, {})
})

test('without a considered list nothing is dropped', () => {
  // Older callers, and the new-content path, pass no list. Keeping everything
  // is the safe reading: it is what the cart did before.
  const first = mergeEntry(null, { type: 'node--article', id: 'a', attributes: { title: 'X' } })
  const second = mergeEntry(first, { type: 'node--article', id: 'a', attributes: {} })
  assert.equal(second.attributes.title, 'X')
})

// What Drupal computes is not the author's to send back.
//
// A text field arrives as `{ value, format, processed }`. `processed` is the
// filtered HTML Drupal made from `value`, so a staged copy of it is a rendering
// of the text as it was *before* the edit. Anything displaying the field
// prefers `processed`, so keeping it means an edit that stages correctly,
// commits correctly, and shows the old text on the page.

test('a staged text field drops the rendering Drupal made of it', () => {
  const staged = changedFields(
    { body: { value: 'old', format: 'basic_html', processed: '<p>old</p>' } },
    { body: { value: 'new', format: 'basic_html', processed: '<p>old</p>' } }
  )

  assert.deepEqual(staged.body, { value: 'new', format: 'basic_html' })
  assert.ok(!('processed' in staged.body))
})

test('multi-value fields drop it too', () => {
  const staged = changedFields(
    { field_x: [{ value: 'a', processed: '<p>a</p>' }] },
    { field_x: [{ value: 'b', processed: '<p>a</p>' }] }
  )
  assert.deepEqual(staged.field_x, [{ value: 'b' }])
})

test('a plain value is left alone', () => {
  const staged = changedFields({ title: 'old' }, { title: 'new' })
  assert.equal(staged.title, 'new')
})

// The order staged resources are sent in.
//
// A tag created while writing an article is two staged resources: the term, and
// the article that now references it. Sent the other way round, the article
// references a term the backend has never heard of, and the edit is rejected
// for a reason that has nothing to do with what the author did.

test('a referenced resource is sent before the one referencing it', () => {
  const term = {
    type: 'taxonomy_term--tags',
    id: 'new-term',
    isNew: true,
    attributes: { name: 'Sourdough' },
  }
  const article = {
    type: 'node--article',
    id: 'article',
    relationships: { field_tags: { data: [{ type: 'taxonomy_term--tags', id: 'new-term' }] } },
  }

  // Given in the wrong order on purpose: the cart is keyed by what was staged
  // first, and the article is usually staged before its new tag.
  assert.deepEqual(
    commitOrder([article, term]).map((r) => r.id),
    ['new-term', 'article']
  )
})

test('a chain of new references comes out in order', () => {
  const a = { type: 't--t', id: 'a' }
  const b = { type: 't--t', id: 'b', relationships: { r: { data: { type: 't--t', id: 'a' } } } }
  const c = { type: 'n--n', id: 'c', relationships: { r: { data: { type: 't--t', id: 'b' } } } }
  assert.deepEqual(
    commitOrder([c, b, a]).map((r) => r.id),
    ['a', 'b', 'c']
  )
})

test('references to things not in the cart are ignored', () => {
  // Most references are to content that already exists, and waiting for it
  // would mean never sending anything.
  const article = {
    type: 'node--article',
    id: 'article',
    relationships: { uid: { data: { type: 'user--user', id: 'someone-real' } } },
  }
  assert.deepEqual(
    commitOrder([article]).map((r) => r.id),
    ['article']
  )
})

test('two resources referencing each other still commit', () => {
  // A stalled commit is recoverable. A hung browser is not.
  const a = { type: 't--t', id: 'a', relationships: { r: { data: { type: 't--t', id: 'b' } } } }
  const b = { type: 't--t', id: 'b', relationships: { r: { data: { type: 't--t', id: 'a' } } } }
  assert.equal(commitOrder([a, b]).length, 2)
})

test("Drupal's own rendering is not a change the author made", () => {
  // A value that has been staged once has no `processed`. Compared against a
  // freshly fetched one that still has it, every field looks edited, and an
  // entity staged and then closed comes back marked unstaged.
  const staged = { body: { value: 'new', format: 'basic_html' } }
  const fromBackend = { body: { value: 'new', format: 'basic_html', processed: '<p>new</p>' } }
  assert.deepEqual(changedFields(staged, fromBackend), {})
})

// Choosing what to send, when some of it cannot be sent alone.
//
// A drawer that lets an author tick an article and untick the tag it references
// is offering them a commit that will fail on something they cannot see.

test('only staged references count as dependencies', () => {
  const article = {
    type: 'node--article',
    id: 'article',
    relationships: {
      field_tags: { data: [{ type: 'taxonomy_term--tags', id: 'new-tag' }] },
      uid: { data: { type: 'user--user', id: 'someone-real' } },
    },
  }
  const tag = { type: 'taxonomy_term--tags', id: 'new-tag' }

  // The author is staged nowhere, so waiting for them would mean never sending.
  assert.deepEqual(dependencyMap([article, tag]).get('article'), ['new-tag'])
})

test('choosing something chooses what it cannot be sent without', () => {
  const article = {
    type: 'node--article',
    id: 'article',
    relationships: { field_tags: { data: [{ type: 't--t', id: 'tag' }] } },
  }
  const tag = { type: 't--t', id: 'tag' }
  assert.deepEqual(withDependencies(['article'], [article, tag]).sort(), ['article', 'tag'])
})

test('a chain is followed all the way down', () => {
  const a = { type: 't--t', id: 'a' }
  const b = { type: 't--t', id: 'b', relationships: { r: { data: { type: 't--t', id: 'a' } } } }
  const c = { type: 'n--n', id: 'c', relationships: { r: { data: { type: 't--t', id: 'b' } } } }
  assert.deepEqual(withDependencies(['c'], [a, b, c]).sort(), ['a', 'b', 'c'])
})

test('what would break is named, so the refusal can say why', () => {
  const article = {
    type: 'node--article',
    id: 'article',
    relationships: { field_tags: { data: [{ type: 't--t', id: 'tag' }] } },
  }
  const tag = { type: 't--t', id: 'tag' }
  assert.deepEqual(requiredBy('tag', ['article', 'tag'], [article, tag]), ['article'])
  // Nothing depends on the article, so it can be left out on its own.
  assert.deepEqual(requiredBy('article', ['article', 'tag'], [article, tag]), [])
})

test('a resource referencing itself is not its own dependency', () => {
  const self = { type: 't--t', id: 'x', relationships: { r: { data: { type: 't--t', id: 'x' } } } }
  assert.deepEqual(dependencyMap([self]).get('x'), [])
})

// Deleting, staged like everything else.
//
// A deletion committed on the spot is the one edit a pull request cannot get
// back, so it waits in the cart with the rest and can be called off.

test('a staged deletion is sent as a DELETE, with no body', () => {
  const gone = { type: 'node--article', id: 'abc', deleted: true }
  assert.equal(requestMethod(gone), 'DELETE')
  // Drupal answers 422 to a body it did not ask for.
  assert.equal(patchBody(gone), null)
  assert.equal(requestUrl('https://b.test', gone), 'https://b.test/jsonapi/node/article/abc')
})

test('a deletion is a change even though it carries no fields', () => {
  // Otherwise the cart would decide nothing had happened and drop it.
  assert.equal(isEmptyResource({ type: 'node--article', id: 'abc', deleted: true }), false)
  assert.equal(isEmptyResource({ type: 'node--article', id: 'abc' }), true)
})

test('deleting something new goes to the collection, never to a missing id', () => {
  // New content has an id the backend has never seen. This case is handled
  // before it gets here, by dropping it outright, but the URL must not be the
  // collection either: a DELETE there is not a delete of anything.
  const gone = { type: 'node--article', id: 'abc', isNew: true, deleted: true }
  assert.equal(requestUrl('https://b.test', gone), 'https://b.test/jsonapi/node/article/abc')
})

test('the cart bookkeeping never reaches the wire', () => {
  const resource = {
    type: 'node--article',
    id: 'abc',
    isNew: true,
    deleted: false,
    onlyIfReferenced: true,
    files: { field_image: { dataUrl: 'data:...' } },
    attributes: { title: 'A' },
  }
  assert.deepEqual(Object.keys(tidyResource(resource)), ['type', 'id', 'attributes'])
})

test('an exported change request carries its own files', () => {
  // A document naming a file id with the file nowhere in it cannot be applied
  // by anything: the bytes only exist in the browser that chose them.
  const exported = exportCart(
    {
      'node--article:a': {
        type: 'node--article',
        id: 'a',
        relationships: { field_image: { data: { type: 'file--file', id: 'f1' } } },
        files: {
          field_image: {
            id: 'f1',
            name: 'red.png',
            type: 'image/png',
            dataUrl: 'data:image/png;base64,AAA',
          },
        },
      },
    },
    { generatedAt: 'now' }
  )

  assert.equal(exported.files.length, 1)
  assert.deepEqual(exported.files[0].resource, { type: 'node--article', id: 'a' })
  assert.equal(exported.files[0].field, 'field_image')
  assert.equal(exported.files[0].id, 'f1')
  assert.equal(exported.files[0].data, 'data:image/png;base64,AAA')
  // And the bytes are not smuggled into the resource itself, which has to stay
  // a JSON:API document.
  assert.equal(exported.resources[0].files, undefined)
})

test('an exported change request says what is being deleted', () => {
  const exported = exportCart(
    { 'node--article:a': { type: 'node--article', id: 'a', deleted: true } },
    { generatedAt: 'now' }
  )
  assert.deepEqual(exported.deletions, [{ type: 'node--article', id: 'a' }])
})
