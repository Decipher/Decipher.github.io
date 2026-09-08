/**
 * Replacing the page's words with stand-ins, in place.
 *
 * The baselines used to grey out `main` and the build date, because both vary
 * with something other than the stylesheet and a screenshot of them fails on
 * content nobody styled. Grey boxes cost more than they saved: a diff of the
 * design became a diff of two rectangles, and the type inside the boxes, which
 * is most of the design, was never checked at all.
 *
 * The note left on that mask said mocking did not work, and it was right about
 * the method it tried. This is a full static build, so the words are already in
 * the HTML Playwright loads; rewriting `window.__NUXT__` changes the hydration
 * payload, Vue hydrates onto the DOM that is already there, and the text never
 * moves. Rewriting the text nodes themselves does move it, and it holds,
 * because with the backends stubbed out nothing re-renders afterwards.
 *
 * Every letter is replaced and every length is kept, so the lines wrap exactly
 * where they wrapped and the picture is of the same shapes as the real page.
 * What it stops being sensitive to is the wording.
 *
 * It does not make the shot independent of the content. Text of a different
 * length still wraps differently, so a backend holding a longer article still
 * moves the baseline. That is a smaller problem than it was, and the fix for
 * the rest of it is CI generating the baselines it verifies.
 */

/**
 * Wait until Vue has finished with the DOM.
 *
 * Rewriting the text nodes before hydration finishes does not last: Vue patches
 * the page onto the markup it was served and puts the real words back, so some
 * runs came out mocked and some came out half mocked. Waiting for the app to be
 * mounted and then for two frames of quiet is what makes the substitution the
 * last thing to touch the text.
 */
async function settled(page) {
  await page.waitForFunction(() => Boolean(window.$nuxt))
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.$nuxt.$nextTick(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
  )
}

/** Letters to draw from, so the result reads as prose rather than as `xxxx`. */
const ALPHABET = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
].join('')

/**
 * Rewrite every word on the page, keeping its length.
 *
 * Each word is replaced from its own length alone. Nothing carries between
 * words, and nothing depends on where the word sits in the document, which are
 * the two things that made a first attempt at this flap: a running counter
 * meant one extra node early on rewrote every word after it, and the shot
 * differed run to run.
 *
 * Deriving it from the length is also what makes it insensitive to the words
 * themselves, which is the point. Anything the same shape mocks the same way.
 */
export async function mockText(page) {
  await settled(page)
  await page.evaluate((alphabet) => {
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'])
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) {
      const node = walker.currentNode
      const parent = node.parentElement
      if (!parent || skip.has(parent.tagName)) continue
      if (node.nodeValue.trim()) nodes.push(node)
    }

    for (const node of nodes) {
      node.nodeValue = node.nodeValue.replace(/[A-Za-z0-9]+/g, (run) => {
        let out = ''
        for (let i = 0; i < run.length; i++) {
          const character = run[i]
          // Digits stay digits, so a date still looks like a date and keeps
          // the tabular width the design gives it.
          if (character >= '0' && character <= '9') {
            out += String((run.length + i) % 10)
            continue
          }
          const letter = alphabet[(run.length + i) % alphabet.length]
          out += character === character.toUpperCase() ? letter.toUpperCase() : letter
        }
        return out
      })
    }
  }, ALPHABET)
}
