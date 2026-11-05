/**
 * What the deck makes of its slides.
 *
 * A slide is a node with a title, a body, an order and a layout. The body is
 * HTML from Drupal, and each layout reads a different part of it: the first
 * paragraph, the first list, the first code block. These are the readings,
 * with no DOM and no Vue in them, so they can be tested on their own and the
 * components only draw what comes back.
 */

/** The layouts a slide can have, as `field_layout` names them. */
export const LAYOUTS = ['intro', 'statement', 'bullets', 'code', 'demo', 'vale', 'sponsor', 'close']

/** Where a QR code may point. Anything else fails the build. */
const ALLOWED_LINKS = [
  (url) => url.hostname === 'stuar.tc',
  (url) => url.hostname === 'github.com' && /^\/sponsors\/Decipher\/?$/.test(url.pathname),
]

/** Slides in deck order: lowest `field_order` first. */
export function orderSlides(slides = []) {
  return [...slides].sort(
    (a, b) => orderOf(a) - orderOf(b) || String(a.id).localeCompare(String(b.id))
  )
}

function orderOf(slide) {
  const value = Number(((slide || {}).attributes || {}).field_order)
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER
}

/** The layouts that are a live demo, in the room, against the backend. */
const DEMO_LAYOUTS = ['demo', 'vale']

/** Which demo this slide is, counted among the demo slides, or null. */
export function demoStep(slides, index) {
  const demos = slides
    .map((slide, at) => ({ at, layout: layoutOf(slide) }))
    .filter((entry) => DEMO_LAYOUTS.includes(entry.layout))
  const position = demos.findIndex((entry) => entry.at === index)
  return position === -1 ? null : { step: position + 1, of: demos.length }
}

export function layoutOf(slide) {
  return ((slide || {}).attributes || {}).field_layout || 'statement'
}

/**
 * Read a body by its layout.
 *
 * Always the same shape, so a component can read any key without checking
 * the layout first: `lead` and `rest` for the paragraph layouts, `items` for
 * bullets, `code` and `language` for code, `examples` for the Vale slide. A
 * code slide's `lead` is the paragraph before the block: its caption.
 */
export function readBody(layout, html) {
  const paragraphs = paragraphsOf(html)
  const read = {
    lead: paragraphs[0] || '',
    rest: paragraphs.slice(1),
    items: [],
    code: '',
    language: '',
    examples: [],
  }
  if (layout === 'bullets') read.items = firstList(html).slice(0, 5)
  if (layout === 'code') Object.assign(read, firstCodeBlock(html))
  if (layout === 'vale') read.examples = paragraphs
  if (layout === 'statement') read.rest = paragraphs.slice(1, 2)
  return read
}

/** The text of every paragraph, with inline markup reduced to its text. */
function paragraphsOf(html = '') {
  return [...String(html || '').matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)]
    .map((match) => text(match[1]))
    .filter(Boolean)
}

/** The items of the first list in the body. */
function firstList(html = '') {
  const list = String(html || '').match(/<(?:ul|ol)(?:\s[^>]*)?>([\s\S]*?)<\/(?:ul|ol)>/i)
  if (!list) return []
  return [...list[1].matchAll(/<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi)]
    .map((match) => text(match[1]))
    .filter(Boolean)
}

/** The first code block and the language its class names, if any. */
function firstCodeBlock(html = '') {
  const block = String(html || '').match(
    /<pre(?:\s[^>]*)?>\s*<code(?:\s([^>]*))?>([\s\S]*?)<\/code>\s*<\/pre>/i
  )
  if (!block) return { code: '', language: '' }
  const language = ((block[1] || '').match(/language-([\w-]+)/) || [])[1] || ''
  // Tags inside a code block are markup the editor added, not code. The
  // entities are the code, so they are decoded after the tags are gone.
  return { code: decode(block[2].replace(/<[^>]+>/g, '')).replace(/\s+$/, ''), language }
}

function text(fragment = '') {
  return decode(fragment.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decode(value = '') {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITIES[name])
}

/** Whether a `field_link` may become a QR code. */
export function linkHostAllowed(href) {
  let url
  try {
    url = new URL(String(href))
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return ALLOWED_LINKS.some((allowed) => allowed(url))
}

/**
 * A sentence cut around what Vale flagged in it.
 *
 * Segments in order, each `{ text, flagged, title }`. A flagged segment is the
 * text an alert matched, with the alert's message as its title. Alerts with no
 * match, or whose match is not in the text, flag nothing.
 */
export function flagText(text = '', alerts = []) {
  const value = String(text || '')
  const spans = []
  for (const alert of Array.isArray(alerts) ? alerts : []) {
    const match = String((alert || {}).match || '')
    if (!match) continue
    let from = 0
    let at = value.indexOf(match, from)
    while (at !== -1 && spans.some((span) => at < span.end && at + match.length > span.start)) {
      from = at + 1
      at = value.indexOf(match, from)
    }
    if (at === -1) continue
    spans.push({ start: at, end: at + match.length, title: String(alert.message || '') })
  }
  spans.sort((a, b) => a.start - b.start)
  const parts = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) parts.push({ text: value.slice(cursor, span.start), flagged: false, title: '' })
    parts.push({ text: value.slice(span.start, span.end), flagged: true, title: span.title })
    cursor = span.end
  }
  if (cursor < value.length || !parts.length) parts.push({ text: value.slice(cursor), flagged: false, title: '' })
  return parts
}

/**
 * What a demo slide says about the session: when it ends, if that is known.
 *
 * Empty with no session. "Session live" when there is one with no known end.
 */
export function sessionLabel(state, now = new Date()) {
  if (!state || !state.url) return ''
  if (!state.expiresAt) return 'Session live'
  const ends = new Date(state.expiresAt)
  if (Number.isNaN(ends.getTime())) return 'Session live'
  const hhmm = ends.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return ends > now ? `live until ${hhmm}` : 'Session over'
}

/** Build-time warnings for a code block the slide cannot fit. */
export function codeBlockWarnings(name, code = '', { lines = 10, columns = 64 } = {}) {
  const rows = String(code || '').split('\n')
  const warnings = []
  if (rows.length > lines) warnings.push(`${name}: the code block is ${rows.length} lines, and about ${lines} fit.`)
  const widest = Math.max(0, ...rows.map((row) => row.length))
  if (widest > columns) warnings.push(`${name}: the code block is ${widest} columns wide, and about ${columns} fit.`)
  return warnings
}

const KEYS = {
  ArrowRight: 'next',
  ArrowDown: 'next',
  ' ': 'next',
  PageDown: 'next',
  ArrowLeft: 'previous',
  ArrowUp: 'previous',
  PageUp: 'previous',
  Home: 'first',
  End: 'last',
  f: 'fullscreen',
  t: 'theme',
}

/**
 * What a key press asks of the deck, or null.
 *
 * Nothing while focus is somewhere that takes typing: an input, a textarea, a
 * contenteditable element or CKEditor, so the arrow keys move the caret during
 * the live edit instead of changing the slide under it.
 */
export function keyAction(event) {
  const target = (event || {}).target || {}
  const tag = String(target.tagName || '').toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null
  if (target.isContentEditable) return null
  if (typeof target.closest === 'function' && target.closest('.ck, .ck-editor, [contenteditable="true"]')) return null
  return KEYS[event.key] || null
}

/**
 * Where the deck lives on the site.
 *
 * One talk, one path, named for the event and the title so a later talk gets
 * a path of its own beside it. The deck itself opens on its first slide, and
 * every slide after that is numbered under it.
 */
export const DECK_PATH = '/drupalmel/prose-and-cons'

/**
 * A refused save's detail, one fact per line, for the console on the stage.
 *
 * The Vale module words a refusal as `field: label: rule: message (line n:
 * "match")`, all on one line, which is right for a JSON:API error and wrong
 * for a room. Split, the field, the rule and the message each get a line of
 * their own, and the match gets the last. A detail in any other shape is one
 * line, unchanged.
 */
export function refusalLines(detail) {
  const text = String(detail || '').trim()
  if (!text) return []
  const match = text.match(/^([^:]+): ([^:]+): ([A-Za-z0-9_.-]+): (.*?)(?: \(line (\d+): "(.*)"\))?$/)
  if (!match) return [text]
  const [, field, label, rule, message, line, found] = match
  const lines = [`${field}  (${label})`, rule, message]
  if (line) lines.push(`line ${line}: "${found}"`)
  return lines
}

/** HTML-escape one piece of text. */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * A code slide's block, coloured, as HTML.
 *
 * A small tokeniser for the JSON-with-HTTP that the talk's code slide is: a
 * request or status line (`PATCH /path`, `422 Unprocessable Content`) is a
 * caption, a quoted string before a colon is a key, any other quoted string
 * is a string, and a bare number is a number. Everything is escaped first,
 * so the only markup in the result is the spans this adds. Anything the
 * tokeniser does not recognise comes through as plain text.
 */
export function highlightCode(code = '') {
  const out = []
  // A string left open at the end of a line runs on into the next, so the
  // continuation is coloured as the string it is, not as the tokens it looks like.
  let inString = false
  for (const line of String(code).split('\n')) {
    let html = ''
    let rest = line
    if (inString) {
      const close = rest.match(/^(?:[^"\\]|\\.)*"/)
      if (!close) {
        out.push(`<span class="deck-code__string">${escapeHtml(rest)}</span>`)
        continue
      }
      html += `<span class="deck-code__string">${escapeHtml(close[0])}</span>`
      rest = rest.slice(close[0].length)
      inString = false
    } else if (/^(GET|POST|PATCH|PUT|DELETE)\s+\S/.test(line) || /^\d{3}\s+[A-Z]/.test(line)) {
      out.push(`<span class="deck-code__http">${escapeHtml(line)}</span>`)
      continue
    }
    while (rest.length) {
      const key = rest.match(/^("(?:[^"\\]|\\.)*")(\s*:)/)
      if (key) {
        html += `<span class="deck-code__key">${escapeHtml(key[1])}</span>${escapeHtml(key[2])}`
        rest = rest.slice(key[0].length)
        continue
      }
      const string = rest.match(/^"(?:[^"\\]|\\.)*"/)
      if (string) {
        html += `<span class="deck-code__string">${escapeHtml(string[0])}</span>`
        rest = rest.slice(string[0].length)
        continue
      }
      const number = rest.match(/^-?\d+(?:\.\d+)?(?![\w.])/)
      if (number) {
        html += `<span class="deck-code__number">${escapeHtml(number[0])}</span>`
        rest = rest.slice(number[0].length)
        continue
      }
      // A quote with no closing quote on this line: the string runs on to the
      // next line, as a long detail does when the slide wraps it by hand.
      const open = rest.match(/^".*$/)
      if (open) {
        html += `<span class="deck-code__string">${escapeHtml(open[0])}</span>`
        inString = true
        break
      }
      const plain = rest.match(/^[^"\d-]+|^[-\d]/) || [rest[0]]
      html += escapeHtml(plain[0])
      rest = rest.slice(plain[0].length)
    }
    out.push(html)
  }
  return out.join('\n')
}
