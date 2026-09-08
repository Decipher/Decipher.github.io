// The parts of a rendered body field that need a listener.
//
// A body field is HTML from Drupal put in with `v-html`, so nothing inside it
// is a component and nothing in it can carry a Vue handler. Anything
// interactive has to be attached after the markup is in the document.

import assert from 'node:assert/strict'
import test from 'node:test'

import { COPIED_LABEL, COPY_LABEL, addCopyButtons, markZoomable } from '../../nuxt/lib/prose.mjs'

/** Enough of a DOM to say what these do, without pulling in a browser. */
function fakeDocument() {
  const make = (tag) => {
    const node = {
      tagName: tag,
      children: [],
      className: '',
      dataset: {},
      textContent: '',
      classList: { add: (c) => node._classes.push(c) },
      _classes: [],
      _listeners: {},
      appendChild: (c) => node.children.push(c),
      addEventListener: (name, fn) => (node._listeners[name] = fn),
      querySelector: (sel) =>
        node.children.find((c) => sel === '.code-copy' && c.className === 'code-copy') || null,
      querySelectorAll: () => [],
      closest: () => null,
    }
    return node
  }
  return { createElement: make, defaultView: { setTimeout: (fn) => fn() }, make }
}

test('every code block gets a copy button', () => {
  const doc = fakeDocument()
  const pre = doc.make('pre')
  const root = { ownerDocument: doc, querySelectorAll: (s) => (s === 'pre' ? [pre] : []) }

  assert.equal(addCopyButtons(root), 1)
  assert.equal(pre.children[0].className, 'code-copy')
  assert.equal(pre.children[0].textContent, COPY_LABEL)
})

test('a second pass does not add a second button', () => {
  // The field re-renders whenever the cart changes, and `v-html` replaces the
  // markup each time. A pass that is not idempotent stacks buttons up.
  const doc = fakeDocument()
  const pre = doc.make('pre')
  const root = { ownerDocument: doc, querySelectorAll: (s) => (s === 'pre' ? [pre] : []) }

  addCopyButtons(root)
  assert.equal(addCopyButtons(root), 0)
  assert.equal(pre.children.length, 1)
})

test('copying takes the whole block, not what is on screen', async () => {
  const doc = fakeDocument()
  const pre = doc.make('pre')
  const code = doc.make('code')
  code.textContent = 'npm run generate'
  pre.querySelector = (sel) => (sel === 'code' ? code : null)
  const root = { ownerDocument: doc, querySelectorAll: (s) => (s === 'pre' ? [pre] : []) }

  const copied = []
  addCopyButtons(root, { copy: async (text) => copied.push(text) })
  await pre.children[0]._listeners.click()

  // `innerText` would give what is rendered, and a scrolled block renders less
  // than it holds.
  assert.deepEqual(copied, ['npm run generate'])
  assert.equal(pre.children[0].textContent, COPY_LABEL)
})

test('a browser that refuses the clipboard says so', async () => {
  const doc = fakeDocument()
  const pre = doc.make('pre')
  pre.querySelector = () => null
  const root = { ownerDocument: doc, querySelectorAll: (s) => (s === 'pre' ? [pre] : []) }

  addCopyButtons(root, {
    copy: async () => {
      throw new Error('denied')
    },
  })
  await pre.children[0]._listeners.click()

  // Not a broken page, and not a button that pretends it worked.
  assert.equal(pre.children[0].textContent, 'Press Ctrl+C')
  assert.notEqual(pre.children[0].textContent, COPIED_LABEL)
})

test('content images are marked so they can be opened', () => {
  // A screenshot at column width is a screenshot nobody can read.
  const doc = fakeDocument()
  const image = doc.make('img')
  const linked = doc.make('img')
  linked.closest = () => ({})
  const root = { querySelectorAll: () => [image, linked] }

  // An image that is already a link has somewhere to go; taking the click
  // would take that away.
  assert.deepEqual(markZoomable(root), [image])
  assert.deepEqual(image._classes, ['zoomable'])
  assert.deepEqual(linked._classes, [])
})

test('nothing to enhance is not an error', () => {
  assert.equal(addCopyButtons(null), 0)
  assert.deepEqual(markZoomable(null), [])
})
