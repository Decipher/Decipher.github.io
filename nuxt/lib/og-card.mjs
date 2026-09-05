/**
 * The Open Graph card, as a Satori element tree.
 *
 * The same design as the site: paper ground, a hairline rule, the mono eyebrow
 * in uppercase with wide tracking, an Archivo title, a muted description. A
 * share card that looks like the page it links to is doing its job; one that
 * looks like a stock template is not.
 *
 * Satori takes React-shaped objects rather than JSX, so this file needs no build
 * step. Colours are literals because Satori has no CSS variables: they are the
 * light palette from assets/css/main.css, and a card has no dark mode.
 */

const PAPER = 'rgb(250, 250, 248)'
const ELEVATED = 'rgb(244, 244, 240)'
const HAIRLINE = 'rgb(226, 226, 220)'
const INK = 'rgb(24, 24, 26)'
const BODY = 'rgb(60, 60, 64)'
const MUTED = 'rgb(106, 106, 112)'
const ACCENT = 'rgb(194, 26, 116)'

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

const SANS = 'Archivo'
const MONO = 'JetBrains Mono'

const el = (type, style, children) => ({ type, props: { style, children } })

/**
 * The longest a title can be before it is cut.
 *
 * Satori will wrap indefinitely and push the description off the card. Cutting
 * at a word keeps the layout, and a title this long is already a design problem
 * on the page itself.
 */
const TITLE_LIMIT = 90

function clamp(text, limit) {
  const value = String(text || '').trim()
  if (value.length <= limit) return value
  const cut = value.slice(0, limit - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.]$/, '')}...`
}

/**
 * One card.
 *
 * `eyebrow` says what kind of thing this is, `title` what it is called, and
 * `description` what it says. A card with no title is the site's own card.
 */
export function ogCard({ eyebrow, title, description, footer } = {}) {
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      backgroundColor: PAPER,
      fontFamily: SANS,
      // The accent only appears as a rule down the left edge, the way the site
      // uses it: one accent, sparingly, never as a background.
      borderLeft: `16px solid ${ACCENT}`,
    },
    [
      el(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
          padding: '0 80px',
        },
        [
          el(
            'div',
            {
              display: 'flex',
              fontFamily: MONO,
              fontSize: 24,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: MUTED,
              marginBottom: 28,
            },
            eyebrow || 'Deciphered'
          ),
          el(
            'div',
            {
              display: 'flex',
              fontSize: title ? 68 : 88,
              fontWeight: 600,
              lineHeight: 1.1,
              color: INK,
              letterSpacing: -1,
            },
            clamp(title || 'Deciphered', TITLE_LIMIT)
          ),
          ...(description
            ? [
                el(
                  'div',
                  {
                    display: 'flex',
                    fontSize: 30,
                    lineHeight: 1.45,
                    color: BODY,
                    marginTop: 32,
                  },
                  clamp(description, 150)
                ),
              ]
            : []),
        ]
      ),
      el(
        'div',
        {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `2px solid ${HAIRLINE}`,
          backgroundColor: ELEVATED,
          padding: '28px 80px',
          fontFamily: MONO,
          fontSize: 24,
          color: MUTED,
          letterSpacing: 2,
        },
        [
          el('div', { display: 'flex', textTransform: 'uppercase' }, 'deciphered'),
          el(
            'div',
            { display: 'flex' },
            footer || 'static build, backend on demand'
          ),
        ]
      ),
    ]
  )
}
