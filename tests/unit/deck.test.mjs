// What the deck makes of a slide's body, and how a reader moves through it.
//
// A slide is a node: a title, a body, an order and a layout. Each layout reads
// the body differently, and the reading is a decision worth testing without a
// browser, so it is pure code here and the components only draw it.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  codeBlockWarnings,
  demoStep,
  flagText,
  keyAction,
  linkHostAllowed,
  highlightCode,
  refusalLines,
  orderSlides,
  readBody,
  sessionLabel,
} from '../../nuxt/lib/deck.mjs'

const slide = (order, layout, extra = {}) => ({
  id: `uuid-${order}`,
  type: 'node--slide',
  attributes: { title: `Slide ${order}`, field_order: order, field_layout: layout, ...extra },
})

test('slides come out in their order, whatever order they arrived in', () => {
  const sorted = orderSlides([slide(3, 'close'), slide(1, 'intro'), slide(2, 'statement')])
  assert.deepEqual(
    sorted.map((s) => s.attributes.field_order),
    [1, 2, 3]
  )
})

test('a demo slide knows which demo it is of how many', () => {
  const deck = [
    slide(1, 'intro'),
    slide(2, 'demo'),
    slide(3, 'code'),
    slide(4, 'demo'),
    slide(5, 'demo'),
    slide(6, 'vale'),
  ]
  assert.deepEqual(demoStep(deck, 1), { step: 1, of: 4 })
  assert.deepEqual(demoStep(deck, 4), { step: 3, of: 4 })
  assert.deepEqual(demoStep(deck, 5), { step: 4, of: 4 }, 'the live Vale check is a demo too')
  assert.equal(demoStep(deck, 0), null, 'not a demo slide')
})

test('an intro reads the speaker, the role, then the event line', () => {
  const read = readBody(
    'intro',
    '<p>Stuart Clark</p><p>Deciphered</p><p>Drupal Melbourne · 5 November 2026</p>'
  )
  assert.equal(read.lead, 'Stuart Clark')
  assert.deepEqual(read.rest, ['Deciphered', 'Drupal Melbourne · 5 November 2026'])
})

test('a statement is one sentence and an optional subline', () => {
  const read = readBody('statement', '<p>This site has no Drupal.</p><p>Open the network tab.</p>')
  assert.equal(read.lead, 'This site has no Drupal.')
  assert.deepEqual(read.rest, ['Open the network tab.'])
  assert.deepEqual(readBody('statement', '<p>Only one.</p>').rest, [])
})

test('bullets are the first list, at most five of them', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((t) => `<li>${t}</li>`).join('')
  const read = readBody('bullets', `<p>ignored</p><ul>${items}</ul><ul><li>second list</li></ul>`)
  assert.deepEqual(read.items, ['a', 'b', 'c', 'd', 'e'])
})

test('a code slide takes the first code block and its language', () => {
  const read = readBody(
    'code',
    '<pre><code class="language-json">{\n  "a": 1\n}</code></pre><pre><code>second</code></pre>'
  )
  assert.equal(read.code, '{\n  "a": 1\n}')
  assert.equal(read.language, 'json')
})

test('a code slide captions its block with the paragraph before it', () => {
  const read = readBody('code', '<p>PATCH /jsonapi/node/slide/{uuid}</p><pre><code>{}</code></pre>')
  assert.equal(read.lead, 'PATCH /jsonapi/node/slide/{uuid}')
  assert.equal(read.code, '{}')
})

test('a code block keeps its entities decoded and its inner markup stripped', () => {
  const read = readBody(
    'code',
    '<pre><code class="language-html">&lt;p&gt;hi&lt;/p&gt; &amp; <span>x</span></code></pre>'
  )
  assert.equal(read.code, '<p>hi</p> & x')
  assert.equal(read.language, 'html')
})

test('a demo reads the instruction and then the subline', () => {
  const read = readBody(
    'demo',
    '<p>Sign in on the session URL.</p><p>PKCE.</p><p>Public client.</p>'
  )
  assert.equal(read.lead, 'Sign in on the session URL.')
  assert.deepEqual(read.rest, ['PKCE.', 'Public client.'])
})

test('a vale slide keeps every paragraph as an example', () => {
  const read = readBody('vale', '<p>One.</p><p>Two.</p>')
  assert.deepEqual(read.examples, ['One.', 'Two.'])
})

test('inline markup inside a paragraph survives as text, not as tags', () => {
  const read = readBody(
    'statement',
    '<p>This <strong>site</strong> has no <code>Drupal</code>.</p>'
  )
  assert.equal(read.lead, 'This site has no Drupal.')
})

test('an empty or missing body reads as nothing, not as an error', () => {
  assert.deepEqual(readBody('bullets', '').items, [])
  assert.equal(readBody('intro', undefined).lead, '')
  assert.equal(readBody('code', '<p>no code</p>').code, '')
})

test('only the two hosts the talk points at may be encoded as a QR code', () => {
  assert.equal(linkHostAllowed('https://stuar.tc'), true)
  assert.equal(linkHostAllowed('https://stuar.tc/writing/'), true)
  assert.equal(
    linkHostAllowed(
      'https://stuar.tc/?utm_medium=qr&utm_source=drupal-melbourne&utm_campaign=prose-and-cons'
    ),
    true
  )
  assert.equal(linkHostAllowed('https://github.com/sponsors/Decipher'), true)
  assert.equal(linkHostAllowed('https://github.com/sponsors/Decipher?o=esb'), true)
  assert.equal(linkHostAllowed('https://github.com/Decipher'), false, 'not the sponsors page')
  assert.equal(linkHostAllowed('https://evil.example/stuar.tc'), false)
  assert.equal(linkHostAllowed('https://something.trycloudflare.com'), false, 'never a session URL')
  assert.equal(linkHostAllowed('not a url'), false)
})

test('a code block that will not fit gets a warning naming the slide', () => {
  const long = Array.from({ length: 13 }, (_, i) => `line ${i}`).join('\n')
  assert.match(codeBlockWarnings('Slide 6', long)[0], /Slide 6.*13 lines/)
  const wide = 'x'.repeat(65)
  assert.match(codeBlockWarnings('Slide 6', wide)[0], /Slide 6.*65 columns/)
  assert.deepEqual(codeBlockWarnings('Slide 6', 'short'), [])
})

test('keys move the deck, and clickers send page keys', () => {
  const press = (key, target = { tagName: 'BODY' }) => keyAction({ key, target })
  for (const key of ['ArrowRight', 'ArrowDown', ' ', 'PageDown'])
    assert.equal(press(key), 'next', key)
  for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp']) assert.equal(press(key), 'previous', key)
  assert.equal(press('Home'), 'first')
  assert.equal(press('End'), 'last')
  assert.equal(press('f'), 'fullscreen')
  assert.equal(press('t'), 'theme')
  assert.equal(press('x'), null)
})

test('keys are ignored while focus is in something that takes typing', () => {
  const press = (target) => keyAction({ key: 'ArrowRight', target })
  assert.equal(press({ tagName: 'INPUT' }), null)
  assert.equal(press({ tagName: 'TEXTAREA' }), null)
  assert.equal(press({ tagName: 'DIV', isContentEditable: true }), null)
  assert.equal(
    press({ tagName: 'DIV', closest: (sel) => (sel.includes('.ck') ? {} : null) }),
    null,
    'inside CKEditor'
  )
  assert.equal(press({ tagName: 'DIV', closest: () => null }), 'next')
})

test('a sentence is cut around the words Vale matched, in order, once each', () => {
  const alerts = [
    { match: 'synergy', message: 'Jargon.' },
    { match: 'Simply put', message: 'An AI tell.' },
  ]
  assert.deepEqual(flagText('Simply put, a robust synergy.', alerts), [
    { text: 'Simply put', flagged: true, title: 'An AI tell.' },
    { text: ', a robust ', flagged: false, title: '' },
    { text: 'synergy', flagged: true, title: 'Jargon.' },
    { text: '.', flagged: false, title: '' },
  ])
  // The same words flagged twice land on two occurrences, not one.
  const twice = flagText('very, very good', [{ match: 'very' }, { match: 'very' }])
  assert.equal(twice.filter((part) => part.flagged).length, 2)
})

test('an alert with no match, or one not in the text, flags nothing', () => {
  assert.deepEqual(flagText('Plain words.', [{ message: 'no match' }, { match: 'absent' }]), [
    { text: 'Plain words.', flagged: false, title: '' },
  ])
  assert.deepEqual(flagText('', []), [{ text: '', flagged: false, title: '' }])
  assert.deepEqual(flagText('Clean.', null), [{ text: 'Clean.', flagged: false, title: '' }])
})

test('a demo slide says when the session ends, and nothing with no backend', () => {
  assert.equal(sessionLabel(null), '')
  assert.equal(sessionLabel({}), '')
  assert.equal(sessionLabel({ url: 'https://x.test' }), 'Session live')
  assert.equal(sessionLabel({ url: 'https://x.test', expiresAt: 'not a date' }), 'Session live')
  const now = new Date('2026-11-06T10:00:00Z')
  const later = new Date('2026-11-06T11:30:00Z').toISOString()
  assert.match(sessionLabel({ url: 'https://x.test', expiresAt: later }, now), /^live until \d/)
  const earlier = new Date('2026-11-06T09:00:00Z').toISOString()
  assert.equal(sessionLabel({ url: 'https://x.test', expiresAt: earlier }, now), 'Session over')
})

test("a refusal in the Vale module's wording is split one fact per line", () => {
  assert.deepEqual(
    refusalLines(
      `body.0.value: Body: Decipher.AiTells: 'Simply put' is an AI tell. Say it plainly. (line 1: "Simply put")`
    ),
    [
      'body.0.value  (Body)',
      'Decipher.AiTells',
      "'Simply put' is an AI tell. Say it plainly.",
      'line 1: "Simply put"',
    ]
  )
  assert.deepEqual(refusalLines('body.0.value: Body: Decipher.EmDash: No em dashes.'), [
    'body.0.value  (Body)',
    'Decipher.EmDash',
    'No em dashes.',
  ])
})

test('a refusal in any other wording is one line, unchanged', () => {
  assert.deepEqual(refusalLines('Forbidden'), ['Forbidden'])
  assert.deepEqual(refusalLines(''), [])
})

test('a code block is coloured by role, with its text escaped first', () => {
  const html = highlightCode(
    'PATCH /jsonapi/node/slide/{uuid}\n{ "data": { "id": 7, "value": "<p>Hi</p>" } }\n422 Unprocessable Content'
  )
  const lines = html.split('\n')
  assert.equal(lines[0], '<span class="deck-code__http">PATCH /jsonapi/node/slide/{uuid}</span>')
  assert.equal(
    lines[1],
    '{ <span class="deck-code__key">&quot;data&quot;</span>: { <span class="deck-code__key">&quot;id&quot;</span>: <span class="deck-code__number">7</span>, <span class="deck-code__key">&quot;value&quot;</span>: <span class="deck-code__string">&quot;&lt;p&gt;Hi&lt;/p&gt;&quot;</span> } }'
  )
  assert.equal(lines[2], '<span class="deck-code__http">422 Unprocessable Content</span>')
  assert.equal(highlightCode(''), '')
})

test('a string that runs past the end of its line does not stop the colouring', () => {
  const html = highlightCode('  "detail": "body.0.value: Body:\n    (line 1: \\"Simply put\\")",')
  const lines = html.split('\n')
  assert.equal(
    lines[0],
    '  <span class="deck-code__key">&quot;detail&quot;</span>: <span class="deck-code__string">&quot;body.0.value: Body:</span>'
  )
  assert.ok(lines[1].includes('Simply put'))
})

test('a string that runs on to the next line is coloured as a string there too', () => {
  const html = highlightCode(
    '  "detail": "body.0.value: Body:\n    (line 1: \\"Simply put\\")",\n  "source": 1'
  )
  const lines = html.split('\n')
  assert.ok(
    lines[1].startsWith('<span class="deck-code__string">'),
    'the continuation opens as a string'
  )
  assert.ok(!lines[1].includes('deck-code__number'), 'no number is coloured inside the string')
  assert.ok(
    lines[2].includes('<span class="deck-code__key">&quot;source&quot;</span>'),
    'tokenising resumes after the string closes'
  )
})
