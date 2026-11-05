import assert from 'node:assert/strict'
import test from 'node:test'

import { publishStickyOffset, stickyOffset } from '../../nuxt/lib/sticky.mjs'

/** Enough of a document and a window to measure against. */
const fake = (bands) => {
  const documentElement = {
    style: {
      props: {},
      setProperty(k, v) {
        this.props[k] = v
      },
    },
  }
  return {
    document: { documentElement, querySelectorAll: () => bands },
    window: { getComputedStyle: (b) => ({ position: b.position }) },
  }
}
const band = (position, height) => ({ position, getBoundingClientRect: () => ({ height }) })

test('the pinned bands are added up', () => {
  const { document, window } = fake([band('sticky', 64), band('sticky', 45)])
  assert.equal(stickyOffset(document, window), 109)
})

test('a band that is not pinned does not count', () => {
  // The same markup is used at widths where the header scrolls away. Counting
  // it there would leave a header-sized gap under everything.
  const { document, window } = fake([band('sticky', 64), band('static', 45)])
  assert.equal(stickyOffset(document, window), 64)
})

test('a page with no trail is just the header', () => {
  const { document, window } = fake([band('sticky', 64)])
  assert.equal(stickyOffset(document, window), 64)
})

test('nothing pinned is nothing owed', () => {
  const { document, window } = fake([])
  assert.equal(stickyOffset(document, window), 0)
})

test('server side, where there is no document, it is zero rather than a crash', () => {
  assert.equal(stickyOffset(null, null), 0)
  assert.equal(stickyOffset(undefined, undefined), 0)
})

test('the measurement is published for stylesheets to read', () => {
  const { document, window } = fake([band('sticky', 64), band('sticky', 45)])
  assert.equal(publishStickyOffset(document, window), 109)
  assert.equal(document.documentElement.style.props['--sticky-top'], '109px')
})
