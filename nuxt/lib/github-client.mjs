/**
 * The sequence that turns a cart into a pull request.
 *
 * Kept apart from `lib/github.mjs`, which is all decisions and no requests, so
 * the shapes can be tested without a network and this can be tested with a
 * fake one.
 *
 * The git data API rather than the contents API: a change request can carry
 * images, and blobs, a tree and one commit put the document and its files in a
 * single commit of a size the contents API would refuse. It is also one commit
 * rather than one per file, which is what a reviewer wants to see.
 */

import {
  apiUrl,
  base64FromDataUrl,
  branchName,
  canWrite,
  filePath,
  headers,
  pullRequestBody,
  requestDocument,
  requestPaths,
} from './github.mjs'

/** Ask GitHub something, and turn a refusal into a reason rather than a throw. */
async function call(request, url, token, init = {}) {
  const response = await request(url, {
    ...init,
    headers: { ...headers(token), ...(init.headers || {}) },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body && body.message) || `GitHub answered ${response.status}.`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return body
}

/**
 * Who this token is, and whether it may change this repository.
 *
 * Both, because either alone is misleading: a valid token with no write access
 * is a signed-in author who cannot do the one thing signing in was for.
 */
export async function checkAccess({ repository, token, workflow, fetch: request }) {
  try {
    const [user, repo] = await Promise.all([
      call(request, 'https://api.github.com/user', token),
      call(request, apiUrl(repository), token),
    ])
    if (!canWrite(repo)) {
      return { ok: false, login: user.login, reason: 'That account cannot write to this repository.' }
    }
    return {
      ok: true,
      login: user.login,
      repository: repo.full_name,
      defaultBranch: repo.default_branch,
      // Asked now rather than found out by a button that fails. Someone with
      // Contents and Pull requests can propose a change; starting a backend
      // additionally needs Actions, and most people editing a site will not
      // have it and should not be shown a control that cannot work.
      canStartBackend: workflow
        ? await canDispatch({ repository, token, workflow, fetch: request })
        : false,
    }
  } catch (error) {
    if (error.status === 401) return { ok: false, reason: 'GitHub did not accept that token.' }
    if (error.status === 404) {
      // 404 rather than 403 is what GitHub answers for a repository a token
      // cannot see at all, which is the same answer as one that does not exist.
      return { ok: false, reason: 'No such repository, or this token cannot see it.' }
    }
    return { ok: false, reason: error.message }
  }
}

/** Whether this token may see the workflow, which is what dispatching needs. */
async function canDispatch({ repository, token, workflow, fetch: request }) {
  try {
    const response = await request(
      `${apiUrl(repository)}/actions/workflows/${encodeURIComponent(workflow)}`,
      { headers: headers(token) }
    )
    return response.ok
  } catch {
    return false
  }
}

/**
 * Commit a change request and open a pull request for it.
 *
 * Returns the pull request URL, or a reason. Nothing is half done: the branch
 * is created last but one, so a failure before that leaves no trace, and a
 * failure after leaves a branch with a complete commit on it.
 */
export async function openChangeRequest({
  repository,
  token,
  exported,
  base,
  fetch: request,
  now,
}) {
  const branch = branchName(now)
  const { folder, document } = requestPaths(branch)

  try {
    const baseRef = await call(
      request,
      `${apiUrl(repository)}/git/refs/heads/${base}`,
      token
    )
    const baseSha = baseRef.object.sha

    // A ref names a commit, and `base_tree` wants a tree. GitHub has been
    // willing to resolve one to the other, but that is not what the API says it
    // takes, and this path had never actually run against GitHub to find out.
    // One more request buys the documented contract.
    const baseCommit = await call(
      request,
      `${apiUrl(repository)}/git/commits/${baseSha}`,
      token
    )

    // Every file becomes a blob first, so the tree can point at real content
    // rather than carrying base64 inline.
    const tree = []
    for (const file of exported.files || []) {
      const blob = await call(request, `${apiUrl(repository)}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content: base64FromDataUrl(file.data), encoding: 'base64' }),
      })
      tree.push({ path: filePath(folder, file), mode: '100644', type: 'blob', sha: blob.sha })
    }

    tree.push({
      path: document,
      mode: '100644',
      type: 'blob',
      content: `${JSON.stringify(requestDocument(exported, folder), null, 2)}\n`,
    })

    const created = await call(request, `${apiUrl(repository)}/git/trees`, token, {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
    })

    const commit = await call(request, `${apiUrl(repository)}/git/commits`, token, {
      method: 'POST',
      body: JSON.stringify({
        message: 'chore(content): edits from the site',
        tree: created.sha,
        parents: [baseSha],
      }),
    })

    await call(request, `${apiUrl(repository)}/git/refs`, token, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    })

    const pull = await call(request, `${apiUrl(repository)}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: 'chore(content): edits from the site',
        head: branch,
        base,
        body: pullRequestBody(exported),
      }),
    })

    return { ok: true, url: pull.html_url, branch }
  } catch (error) {
    return { ok: false, reason: error.message }
  }
}

/**
 * Ask GitHub Actions to start a backend.
 *
 * The workflow is the same one a maintainer runs by hand, and the same access
 * control: `workflow_dispatch` is write-access only, and the token already had
 * to prove write access to get this far. Nothing new is trusted.
 *
 * Answers 204 with no body, which is worth knowing: there is no run id to
 * follow. The session announces itself the way it already does, by publishing
 * where it is, and the frontend waits for that rather than for GitHub.
 */
export async function startBackend({
  repository,
  token,
  workflow,
  ref,
  minutes,
  origin,
  fetch: request,
}) {
  try {
    const response = await request(
      `${apiUrl(repository)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({
          ref: ref || 'main',
          // The origin, because a session provisions for one frontend: CORS
          // allows it and the OAuth redirect is its `/callback`. A backend
          // that does not know where the request came from refuses the very
          // site that asked for it.
          inputs: { minutes: String(minutes || 55), ...(origin ? { origin } : {}) },
        }),
      }
    )
    if (response.status === 204) return { ok: true }

    const body = await response.json().catch(() => null)
    if (response.status === 403) {
      return {
        ok: false,
        reason: 'That token cannot start workflows. It needs Actions write as well.',
      }
    }
    if (response.status === 404) {
      return { ok: false, reason: `No ${workflow} workflow on ${ref || 'main'}.` }
    }
    return { ok: false, reason: (body && body.message) || `GitHub answered ${response.status}.` }
  } catch (error) {
    return { ok: false, reason: error.message }
  }
}

/**
 * Find the run a dispatch started.
 *
 * `workflow_dispatch` answers 204 with no body, so there is no run id to
 * follow: the only way to find it is to ask what has started since. Matched on
 * creation time rather than on being the newest, so a run somebody else started
 * a minute earlier is not mistaken for this one.
 */
export async function findRun({ repository, token, workflow, since, fetch: request }) {
  try {
    const url =
      `${apiUrl(repository)}/actions/workflows/${encodeURIComponent(workflow)}/runs` +
      '?event=workflow_dispatch&per_page=5'
    const body = await call(request, url, token)
    const runs = (body.workflow_runs || []).filter(
      (run) => !since || new Date(run.created_at).getTime() >= new Date(since).getTime() - 60000
    )
    if (!runs.length) return { ok: true, run: null }

    const run = runs[0]
    return {
      ok: true,
      run: { id: run.id, url: run.html_url, status: run.status, conclusion: run.conclusion },
    }
  } catch (error) {
    return { ok: false, reason: error.message }
  }
}

/** Whether a run is still going, and so still worth waiting for. */
export function runIsFinished(run) {
  return Boolean(run) && run.status !== 'queued' && run.status !== 'in_progress'
}
