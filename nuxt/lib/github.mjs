/**
 * Opening a pull request from a page with no server behind it.
 *
 * Sign-in is a token the author supplies, not an OAuth flow, and that is a
 * finding rather than a shortcut. GitHub's device flow endpoints on github.com
 * send no CORS headers, so a browser cannot reach them: the request fails
 * before it is made. Every other OAuth flow needs a client secret, which means
 * a server, which is the thing this whole change exists to remove. `api.github.com`
 * itself does allow cross-origin requests, including authenticated ones, so
 * everything after sign-in works from a static page.
 *
 * The trade is stated plainly in the interface: a fine-grained token, scoped to
 * one repository, with the two permissions the work needs and no others.
 *
 * The change is committed through the git data API rather than the contents
 * API, because a change request can carry images. Blobs, a tree and one commit
 * put the document and its files in a single commit of a size the contents API
 * would refuse.
 */

const API = 'https://api.github.com'

/** `owner/name` from whatever a repository is written as. */
export function parseRepository(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '')
  const [owner, name, ...rest] = cleaned.split('/')
  if (!owner || !name || rest.length) return null
  return { owner, name, full: `${owner}/${name}` }
}

export function apiUrl(repository, path = '') {
  const repo = parseRepository(repository)
  if (!repo) return null
  return `${API}/repos/${repo.owner}/${repo.name}${path}`
}

export function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * Whether this account may change this repository.
 *
 * `permissions.push` rather than a role name: a role is a label GitHub may
 * rename, and push is the thing actually being asked about.
 */
export function canWrite(repositoryResponse) {
  return Boolean(((repositoryResponse || {}).permissions || {}).push)
}

/** A branch name that says what it is and cannot collide with a person's. */
export function branchName(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  return `content/edits-${stamp}`
}

/** Where a change request and its files live in the repository. */
export function requestPaths(branch) {
  const folder = `requests/${String(branch).split('/').pop()}`
  return { folder, document: `${folder}/change.json` }
}

/**
 * A file's path inside the request.
 *
 * The id is in the name because two fields can hold pictures with the same
 * filename, and the document refers to files by id.
 */
export function filePath(folder, file) {
  const name = String(file.name || 'upload')
    .split(/[/\\]/)
    .pop()
    // Runs of dots collapse: a path separator is not the only way to write
    // `..`, and a name is not the place to find out.
    .replace(/\.{2,}/g, '.')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[.-]+/, '')
  return `${folder}/files/${file.id}-${name || 'upload'}`
}

/** The base64 payload out of a data URL, which is what a blob wants. */
export function base64FromDataUrl(dataUrl) {
  const [, data] = String(dataUrl || '').split(',')
  return data || ''
}

/**
 * The change request document, with the bytes taken out of it.
 *
 * The cart's own export embeds files as data URLs so it can stand alone as a
 * download. In a commit that would be a megabyte of base64 inside a JSON file
 * nobody can read a diff of, next to no actual image. Here each file is a real
 * file in the tree and the document points at it, so a reviewer sees the
 * picture.
 */
export function requestDocument(exported, folder) {
  return {
    ...exported,
    files: (exported.files || []).map((file) => ({
      resource: file.resource,
      field: file.field,
      id: file.id,
      name: file.name,
      contentType: file.contentType,
      path: filePath(folder, file),
    })),
  }
}

/** What the pull request says about itself. */
export function pullRequestBody(exported) {
  const counts = []
  const edits = (exported.resources || []).length - (exported.deletions || []).length
  if (edits > 0) counts.push(`${edits} ${edits === 1 ? 'change' : 'changes'}`)
  if ((exported.deletions || []).length) counts.push(`${exported.deletions.length} deleted`)
  if ((exported.files || []).length) counts.push(`${exported.files.length} file(s)`)

  return [
    'Content edited through the site, with no backend involved.',
    '',
    counts.length ? `Carries ${counts.join(', ')}.` : 'Carries no changes.',
    '',
    'This branch holds the request, not the content. A job applies it to Drupal',
    'and commits the exported content here, so the diff below is what changes.',
  ].join('\n')
}

/**
 * Where a GitHub sign-in is kept.
 *
 * `sessionStorage`, like the Drupal token: closing the tab ends it. A
 * repository-scoped token in a browser is a real thing to be careful with, so it
 * does not outlive the session that asked for it.
 *
 * Here rather than in the plugin that writes it, because the plugin that reads
 * the session record loads first and cannot ask it.
 */
export const TOKEN_KEY = 'authoring.github'

export function readStoredToken(storage) {
  try {
    return JSON.parse(storage.getItem(TOKEN_KEY)) || null
  } catch {
    return null
  }
}

export function writeStoredToken(storage, value) {
  try {
    if (value) storage.setItem(TOKEN_KEY, JSON.stringify(value))
    else storage.removeItem(TOKEN_KEY)
  } catch {
    // Not fatal: the sign-in simply does not survive a reload.
  }
}
