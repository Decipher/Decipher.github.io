/**
 * The decisions behind `npm run vendor:sync`, kept free of git and npm so
 * they can be tested directly.
 *
 * nuxt/vendor/ holds built copies of Druxt modules that are not on npm yet.
 * Each one used to be built and copied by hand, with a README saying which
 * commit it came from. The hand-written record went wrong at least once:
 * vendor/diff named a commit that predated the build it held. These helpers
 * make the record a by-product of the build instead.
 */

/**
 * Keys a vendored manifest does not carry.
 *
 * `scripts` and `devDependencies` belong to working on the module, not using
 * it. `type` goes because `dist/index.ssr.js` is CommonJS, and a
 * `"type": "module"` beside it would make Node load it as an ES module and
 * fail. The rest describe publishing, which a vendored copy never does.
 *
 * `peerDependenciesMeta` stays: it is what marks a peer optional, and without
 * it npm tries to install every optional peer.
 */
export const DROPPED_KEYS = [
  'type',
  'scripts',
  'devDependencies',
  'packageManager',
  'publishConfig',
]

/** What a built package ships, from its own `files` list. */
export function packageFiles(manifest = {}) {
  return Array.isArray(manifest.files) && manifest.files.length ? manifest.files : ['dist']
}

/** The manifest to vendor: the module's own, less what only building needs. */
export function vendoredManifest(manifest = {}) {
  const out = {}
  for (const [key, value] of Object.entries(manifest)) {
    if (!DROPPED_KEYS.includes(key)) out[key] = value
  }
  return out
}

/**
 * A repository's namespace and name, from a remote URL, with no host.
 *
 * This repository is public, and a module's remote may be on a private host.
 * The name identifies the repository to whoever can reach it; the host would
 * only publish an address `npm run lint:private` exists to keep out.
 */
export function repositoryName(remote = '') {
  const url = String(remote).trim()
  const scp = url.match(/^[^@/\s]+@[^:/\s]+:(.+)$/)
  const path = scp ? scp[1] : url.replace(/^[a-z+]+:\/\/[^/]+\//i, '')
  return path.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
}

/** Whether a ref is a commit id rather than a branch or tag name. */
export const isCommitId = (ref = '') => /^[0-9a-f]{7,40}$/i.test(String(ref))

/** The README written beside a vendored build, recording where it came from. */
export function provenance({ name, packageName, repository, ref, commit }) {
  const source = isCommitId(ref)
    ? `Built from \`${repository}\`, commit \`${commit.slice(0, 12)}\`.`
    : `Built from \`${repository}\`, \`${ref}\` at commit \`${commit.slice(0, 12)}\`.`
  return `# Vendored: ${packageName}

${source}

Vendored rather than installed because the package is not published yet.
Written by \`npm run vendor:sync -- ${name} <checkout> <ref>\`: run that again
rather than editing these files, so this record stays true.

Declared as \`file:vendor/${name}\` so the package name resolves in
\`node_modules\`, which a component or plugin template needs when it imports
the package by name.
`
}

/**
 * The Node major a module pins in `.nvmrc`, if it pins one.
 *
 * A module built on another Node can build differently, so the sync says so
 * rather than refusing: the person running it may know the difference does
 * not matter.
 */
export function pinnedNodeMajor(nvmrc = '') {
  const match = String(nvmrc)
    .trim()
    .match(/^v?(\d+)/)
  return match ? Number(match[1]) : null
}
