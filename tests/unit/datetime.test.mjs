// Between what JSON:API sends and what a date input will take.
//
// Drupal sends ISO 8601 with an offset. `<input type="datetime-local">` will
// not display that: it wants `YYYY-MM-DDTHH:mm` and silently shows an empty
// field for anything else, so the author meets a date field that has apparently
// lost its date.

import assert from 'node:assert/strict'
import test from 'node:test'

import { fromDateInput, toDateInput } from '../../nuxt/lib/datetime.mjs'

test('an ISO timestamp becomes something the input can show', () => {
  const shown = toDateInput('2026-09-04T14:30:00+00:00')
  assert.match(shown, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  // No seconds and no offset: the input rejects both.
  assert.ok(!shown.includes('+'))
})

test('what the input holds goes back as something Drupal accepts', () => {
  const iso = fromDateInput('2026-09-04T14:30')
  assert.equal(new Date(iso).getTime(), new Date('2026-09-04T14:30').getTime())
})

test('a round trip keeps the moment', () => {
  const original = '2026-09-04T14:30:00+00:00'
  assert.equal(
    new Date(fromDateInput(toDateInput(original))).getTime(),
    new Date(original).getTime()
  )
})

test('nothing in, nothing out', () => {
  // An empty date field is a legitimate state, not an error to report.
  assert.equal(toDateInput(''), '')
  assert.equal(toDateInput(null), '')
  assert.equal(fromDateInput(''), null)
})

test('something that is not a date does not become one', () => {
  assert.equal(toDateInput('not a date'), '')
  assert.equal(fromDateInput('not a date'), null)
})
