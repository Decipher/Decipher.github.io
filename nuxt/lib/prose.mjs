/**
 * The bits of a rendered body field that need a listener.
 *
 * A body field is HTML from Drupal, rendered with `v-html`, so nothing inside
 * it is a component and nothing in it can carry a Vue handler. Anything
 * interactive has to be attached after the markup is in the document.
 *
 * Kept out of the component so the decisions are testable against a DOM without
 * mounting Druxt, a backend and a form.
 */

/** What the copy control says, and what it says once it has copied. */
export const COPY_LABEL = 'Copy'
export const COPIED_LABEL = 'Copied'

/**
 * Put a copy button on every code block.
 *
 * The article is mostly commands, and a command somebody selects by hand is a
 * command with a stray newline in it.
 *
 * Idempotent: the field re-renders whenever the cart changes, and a second pass
 * must not leave two buttons on one block.
 */
export function addCopyButtons(root, { copy, document: doc } = {}) {
  if (!root) return 0
  const owner = doc || root.ownerDocument
  let added = 0
  for (const pre of root.querySelectorAll('pre')) {
    if (pre.querySelector('.code-copy')) continue
    const button = owner.createElement('button')
    button.type = 'button'
    button.className = 'code-copy'
    button.textContent = COPY_LABEL
    button.addEventListener('click', async () => {
      const code = pre.querySelector('code') || pre
      // `innerText` would give what is on screen, which for a scrolled block is
      // not the whole command.
      const text = code.textContent || ''
      try {
        await (copy ? copy(text) : navigator.clipboard.writeText(text))
        button.textContent = COPIED_LABEL
        owner.defaultView.setTimeout(() => {
          button.textContent = COPY_LABEL
        }, 1500)
      } catch {
        // A browser that refuses the clipboard is not a broken page. Saying so
        // beats a button that appears to have worked.
        button.textContent = 'Press Ctrl+C'
      }
    })
    pre.appendChild(button)
    added++
  }
  return added
}

/**
 * Let a content image be opened at its own size.
 *
 * A screenshot rendered at column width is a screenshot nobody can read. This
 * marks them and reports which ones, so the component can open one.
 */
export function markZoomable(root) {
  if (!root) return []
  const images = [...root.querySelectorAll('img')].filter((img) => !img.closest('a'))
  for (const img of images) img.classList.add('zoomable')
  return images
}
