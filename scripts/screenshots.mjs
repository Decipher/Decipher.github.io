#!/usr/bin/env node
/**
 * Retake the screenshots the site's own content uses.
 *
 * The article about this site is illustrated with pictures of this site, so
 * every change to the layout dates them. Taking them by hand meant they drifted
 * until somebody noticed; this makes retaking them a command.
 *
 * They are Drupal files, inserted through CKEditor like any other content
 * image, so this replaces the bytes in Drupal's own files directory and asks
 * Drupal to re-read them. The file entities keep their ids, so the markup that
 * points at them keeps working.
 *
 * Usage:
 *   node scripts/screenshots.mjs                 # against http://127.0.0.1:3100
 *   SITE=https://example.test node scripts/screenshots.mjs
 *
 * Needs the site being photographed to be running, and a Drupal to save into.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { createRequire } from 'node:module'

import { chromium } from '@playwright/test'

/**
 * Image compression, borrowed from the frontend's own dependencies.
 *
 * `sharp` is installed under `nuxt/` because `@nuxt/image` needs it. It is a
 * native binary, and adding it to the root as well would put it in every
 * consumer's install for the sake of a script most of them will never run.
 *
 * Optional on purpose: a checkout with no frontend dependencies should still be
 * able to retake the pictures, just larger ones.
 */
const sharp = (() => {
  try {
    const require = createRequire(path.join(import.meta.dirname, '..', 'nuxt', 'package.json'))
    return require('sharp')
  } catch {
    return null
  }
})()

const SITE = process.env.SITE || 'http://127.0.0.1:3100'
const ROOT = path.join(import.meta.dirname, '..')
const FILES = path.join(ROOT, 'drupal', 'web', 'sites', 'default', 'files', 'inline-images')

/**
 * The viewport every shot is taken at.
 *
 * One size for all of them, so the article's pictures sit at a consistent
 * scale rather than each being whatever the moment needed. Two device pixels
 * per CSS pixel, because a screenshot of text at 1x is a screenshot of blurry
 * text on most screens people read on.
 */
const VIEWPORT = { width: 1180, height: 620 }
const SCALE = 2

const log = (...args) => console.log('[screenshots]', ...args)

if (!sharp) log('sharp not found under nuxt/, writing unoptimised PNGs')

/**
 * Shrink a PNG without changing what it shows.
 *
 * Lossless: these are screenshots of text and flat colour, which palette
 * quantisation makes visibly worse for very little gain.
 */
async function optimise(buffer) {
  if (!sharp) return buffer
  return sharp(buffer).png({ compressionLevel: 9, effort: 10, palette: false }).toBuffer()
}

async function shoot(page, name, action) {
  await action(page)
  await page.evaluate(() => document.fonts.ready)
  const raw = await page.screenshot()
  const out = await optimise(raw)
  const file = path.join(FILES, `${name}.png`)
  writeFileSync(file, out)
  const saved = Math.round((1 - out.length / raw.length) * 100)
  log(`${name}.png  ${(out.length / 1024).toFixed(0)}kB  (${saved}% smaller)`)
}

const shots = {
  /** The site as a visitor sees it: Drupal's regions, no backend needed. */
  site: async (page) => {
    await page.goto(SITE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
  },

  /** Edit mode: every entity gains a control. */
  'edit-mode': async (page) => {
    await page.getByTestId('authoring-edit-toggle').click()
    await page.waitForTimeout(900)
  },

  /** The cart, holding a change that has not been sent anywhere. */
  cart: async (page) => {
    await page.evaluate(() =>
      window.$nuxt.$store.dispatch('authoringCart/stageNew', {
        type: 'node--article',
        attributes: { title: 'Written in the browser' },
      })
    )
    await page.evaluate(() => window.$nuxt.$store.dispatch('authoringCart/setDrawerOpen', true))
    await page.waitForTimeout(1200)
  },

  /** Where the work goes, and what each destination needs. */
  send: async (page) => {
    await page.getByTestId('cart-tab-send').click()
    await page.waitForTimeout(800)
  },

  /** The preview, at a real device width. */
  preview: async (page) => {
    await page.getByTestId('cart-tab-changes').click()
    await page.waitForTimeout(400)
    await page
      .getByTestId('cart-preview-abc')
      .click()
      .catch(async () => {
        const first = page.locator('[data-testid^="cart-preview-"]').first()
        await first.click()
      })
    await page.waitForTimeout(2500)
    await page.getByTestId('preview-width').selectOption({ label: 'Phone' })
    await page.waitForTimeout(700)
  },
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
// A session record would connect a backend that may not be the one being
// photographed, and the pictures would then vary with whatever is running.
await page.route(/raw\.githubusercontent\.com/, (route) => route.abort())

mkdirSync(FILES, { recursive: true })
try {
  for (const [name, action] of Object.entries(shots)) await shoot(page, name, action)
} finally {
  await browser.close()
}

// Drupal records each file's size, so the bytes changing under it makes the
// entity wrong until it looks again.
log('asking Drupal to re-read them')
execFileSync(
  'vendor/bin/drush',
  [
    '-r',
    path.join(ROOT, 'drupal', 'web'),
    '-y',
    'php:eval',
    `
    foreach (\\Drupal::entityTypeManager()->getStorage('file')->loadMultiple() as $file) {
      if (!str_contains($file->getFileUri(), 'inline-images/')) continue;
      $file->setSize(filesize(\\Drupal::service('file_system')->realpath($file->getFileUri())));
      $file->save();
    }`,
  ],
  { cwd: path.join(ROOT, 'drupal'), stdio: 'inherit' }
)

log('done. Run `drush tome:export` and rebuild to publish them.')
for (const name of Object.keys(shots)) {
  const { size } = statSync(path.join(FILES, `${name}.png`))
  log(`  ${name}.png ${(size / 1024).toFixed(0)}kB`)
}
