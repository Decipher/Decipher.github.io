/**
 * Assembling CKEditor from Drupal's own DLL builds.
 *
 * The editor used to be `@ckeditor/ckeditor5-build-classic`, a bundle someone
 * else decided the contents of. Drupal's `full_html` is configured for eight
 * buttons that bundle has no plugin for, so `lib/editor.mjs` filtered them out
 * and the frontend quietly offered a smaller editor than the site was set up
 * for. Inline code was the one that mattered: this site's own writing is full
 * of it and there was no way to type any.
 *
 * A prebuilt bundle cannot be extended from outside. Importing a plugin
 * alongside it evaluates a second copy of CKEditor's core, which finds
 * `window.CKEDITOR_VERSION` already set and throws `ckeditor-duplicated-modules`.
 *
 * So the plugins are loaded the way Drupal itself loads them: as DLL builds,
 * one script per package, sharing the core in `ckeditor5-dll.js`. No bundler is
 * involved, which is the point. They are plain scripts, copied into `static/`
 * by `nuxt.config.js` and fetched at runtime.
 *
 * They are fetched only when an editor is actually created. Together they are
 * over a megabyte, and a reader who never signs in should never pay for them.
 */

/** Where `nuxt.config.js` puts the copies. */
const BASE = '/ckeditor5/'

/**
 * The core, which every other script attaches itself to, and so loads first.
 *
 * It carries more than its name suggests: `paragraph`, `typing`, `undo`,
 * `clipboard`, `widget` and `upload` all live in here rather than in packages
 * of their own.
 */
const CORE = 'ckeditor5-dll'

/**
 * The packages to fetch, in load order.
 *
 * Everything Drupal's toolbar can ask for, plus the few that are not buttons:
 * `essentials` (undo, clipboard, enter), `autoformat`, `paste-from-office` and
 * `indent`, which lists and tables expect to be present.
 */
export const CKEDITOR_PACKAGES = [
  'editor-classic',
  'essentials',
  'autoformat',
  'paste-from-office',
  'indent',
  'basic-styles',
  'remove-format',
  'block-quote',
  'heading',
  'link',
  'list',
  'table',
  'image',
  'code-block',
  'horizontal-line',
  'source-editing',
]

/**
 * Every plugin, loaded whatever the toolbar says.
 *
 * Not derived from the configured buttons, and the difference is not academic.
 * A CKEditor plugin decides what the editor *understands*; the toolbar only
 * decides what it *offers*. Markup the schema does not know about is stripped
 * on the way in, silently: opening this site's own article with the image
 * plugins left out emptied all five pictures out of the body, and staging that
 * would have deleted them.
 *
 * So the plugin set is fixed and the toolbar is filtered separately. The
 * scripts are all fetched anyway, so this costs nothing but instantiation.
 *
 * Written as `namespace.Export` pairs against `window.CKEditor5`, because that
 * is the only handle a DLL build gives you.
 */
const PLUGINS = [
  'essentials.Essentials',
  'paragraph.Paragraph',
  'autoformat.Autoformat',
  'pasteFromOffice.PasteFromOffice',
  'indent.Indent',
  'basicStyles.Bold',
  'basicStyles.Italic',
  'basicStyles.Code',
  'basicStyles.Strikethrough',
  'basicStyles.Subscript',
  'basicStyles.Superscript',
  'removeFormat.RemoveFormat',
  'link.Link',
  'list.List',
  'blockQuote.BlockQuote',
  'table.Table',
  'table.TableToolbar',
  'horizontalLine.HorizontalLine',
  'heading.Heading',
  'codeBlock.CodeBlock',
  'sourceEditing.SourceEditing',
  'image.Image',
  'image.ImageToolbar',
  'image.ImageCaption',
  'image.ImageStyle',
  'image.ImageResize',
  'image.ImageUpload',
]

/**
 * What each configured button needs loaded.
 *
 * Keyed by Drupal's toolbar vocabulary, which is not CKEditor's: Drupal says
 * `bulletedList` where CKEditor wants the `List` plugin, and `insertTable`
 * needs `TableToolbar` as well or the table has no controls.
 *
 * Keyed by CKEditor's names, after `lib/editor.mjs` has renamed the few Drupal
 * calls something else.
 */
export const BUTTON_PLUGINS = {
  bold: ['basicStyles.Bold'],
  italic: ['basicStyles.Italic'],
  strikethrough: ['basicStyles.Strikethrough'],
  subscript: ['basicStyles.Subscript'],
  superscript: ['basicStyles.Superscript'],
  code: ['basicStyles.Code'],
  removeFormat: ['removeFormat.RemoveFormat'],
  link: ['link.Link'],
  bulletedList: ['list.List'],
  numberedList: ['list.List'],
  blockQuote: ['blockQuote.BlockQuote'],
  insertTable: ['table.Table', 'table.TableToolbar'],
  horizontalLine: ['horizontalLine.HorizontalLine'],
  heading: ['heading.Heading'],
  codeBlock: ['codeBlock.CodeBlock'],
  sourceEditing: ['sourceEditing.SourceEditing'],
  uploadImage: [
    'image.Image',
    'image.ImageToolbar',
    'image.ImageCaption',
    'image.ImageStyle',
    'image.ImageResize',
    'image.ImageUpload',
  ],
  indent: ['indent.Indent'],
  outdent: ['indent.Indent'],
  undo: ['essentials.Essentials'],
  redo: ['essentials.Essentials'],
}

/** Buttons this build can render, which is what the toolbar is filtered to. */
export const SUPPORTED_BUTTONS = Object.keys(BUTTON_PLUGINS)

/**
 * Fetch a script once, and tell the caller when the browser has run it.
 *
 * Reused across editors: two fields on one form must not fetch a megabyte
 * twice, and loading the same DLL twice would register its plugins twice.
 */
const loaded = new Map()

function loadScript(src, document) {
  if (loaded.has(src)) return loaded.get(src)
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.appendChild(script)
  })
  loaded.set(src, promise)
  return promise
}

/**
 * Load the core and every plugin package, and hand back the namespace.
 *
 * The core is awaited on its own, because the plugin scripts attach to what it
 * defines and a parallel fetch would race it. The rest go together.
 */
export async function loadCkeditor({ document = globalThis.document, base = BASE } = {}) {
  if (!document) return null
  try {
    await loadScript(`${base}${CORE}.js`, document)
    await Promise.all(CKEDITOR_PACKAGES.map((name) => loadScript(`${base}${name}.js`, document)))
  } catch {
    // The textarea stays. An edit is still possible without the toolbar.
    return null
  }
  return globalThis.window ? globalThis.window.CKEditor5 : null
}

/**
 * Resolve `namespace.Export` names against the loaded namespace.
 *
 * Anything missing is dropped rather than thrown on, because a plugin that
 * failed to arrive should cost its own button and not the whole editor. The
 * caller drops the matching buttons for the same reason.
 */
export function resolvePlugins(namespace, names) {
  const found = []
  for (const name of names) {
    const [group, exported] = name.split('.')
    const plugin = ((namespace || {})[group] || {})[exported]
    if (plugin && !found.includes(plugin)) found.push(plugin)
  }
  return found
}

/** Everything the editor should understand, which is everything that loaded. */
export function editorPlugins(namespace) {
  return resolvePlugins(namespace, PLUGINS)
}
