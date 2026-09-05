/**
 * Tailwind tokens for the deciphered site.
 *
 * The palette and type are taken from the stuar.tc design system: a warm
 * near-monochrome ramp from paper to ink, one swappable accent, a sans for body
 * and a monospace for labels and numerals. stuar.tc implements that through
 * Nuxt UI's semantic utilities, which need Nuxt 4, so the same roles are
 * defined here as plain Tailwind tokens instead.
 *
 * Everything is expressed as a CSS variable so the dark mode swap is one set of
 * value changes in main.css rather than a `dark:` variant on every element.
 */
// Tailwind 2 here, pinned by @nuxtjs/tailwindcss v4, which is the Nuxt 2 line.
// JIT so arbitrary values work; the `<alpha-value>` placeholder and the
// `bg-x/50` slash syntax are both v3 and are written the v2 way below.
const withOpacity =
  (variable) =>
  ({ opacityValue }) =>
    opacityValue === undefined
      ? `rgb(var(${variable}))`
      : `rgba(var(${variable}), ${opacityValue})`

module.exports = {
  mode: 'jit',
  darkMode: 'class',
  content: [
    'components/**/*.{vue,js}',
    'layouts/**/*.vue',
    'pages/**/*.vue',
    'plugins/**/*.js',
    'nuxt.config.js',
  ],
  variants: {
    extend: {
      // Edit controls stay out of the way until pointed at, so the site reads
      // as a site. `group-focus-within` so a keyboard reaches them too.
      borderColor: ['group-focus-within'],
      opacity: ['disabled', 'group-hover', 'group-focus-within'],
    },
  },
  theme: {
    extend: {
      colors: {
        // Surfaces, paper through ink.
        paper: withOpacity('--c-paper'),
        surface: withOpacity('--c-surface'),
        elevated: withOpacity('--c-elevated'),
        hairline: withOpacity('--c-hairline'),
        // Text roles, not shades: the name says what it is for.
        ink: withOpacity('--c-ink'),
        body: withOpacity('--c-body'),
        muted: withOpacity('--c-muted'),
        dimmed: withOpacity('--c-dimmed'),
        // One accent. Swapping it re-skins the site.
        accent: withOpacity('--c-accent'),
        'accent-contrast': withOpacity('--c-accent-contrast'),
      },
      fontFamily: {
        sans: ['Archivo', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        eyebrow: '0.12em',
      },
      maxWidth: {
        prose: '68ch',
      },
    },
  },
}
