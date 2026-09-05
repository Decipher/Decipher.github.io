/**
 * Tests for deliver_login_link in scripts/session-providers.sh.
 *
 * The link this sends is a one-click administrator session. Where it goes, and
 * over what, is the whole security of a session: the function already refuses
 * to print it into a public job log, and it must not hand it to a plaintext
 * webhook either.
 *
 * The function is sourced into a shell with a fake curl on PATH, so what would
 * have gone over the wire is a file rather than a request.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LINK = 'https://example.test/user/reset/1/x/y/login'

let workspace

before(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'session-providers-'))
  // Records its arguments instead of making a request, so a test can see both
  // whether curl ran at all and what it was asked to do.
  fs.writeFileSync(
    path.join(workspace, 'curl'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${workspace}/curl-args"\nexit 0\n`
  )
  fs.chmodSync(path.join(workspace, 'curl'), 0o755)
})

after(() => fs.rmSync(workspace, { recursive: true, force: true }))

/** Call deliver_login_link with one webhook URL, and report what curl saw. */
function deliver(webhook, { provider = 'github' } = {}) {
  fs.rmSync(path.join(workspace, 'curl-args'), { force: true })
  let stdout
  let status = 0
  try {
    stdout = execFileSync(
      'bash',
      [
        '-c',
        `set -uo pipefail
         PROVIDER=${provider}
         SESSION_URL=https://tunnel.test
         EXPIRES_AT=later
         LOGIN_LINK=${LINK}
         DISCORD_WEBHOOK_URL=${webhook}
         source scripts/session-providers.sh
         deliver_login_link`,
      ],
      { cwd: REPO, env: { ...process.env, PATH: `${workspace}:${process.env.PATH}` } }
    ).toString()
  } catch (error) {
    status = error.status
    stdout = `${error.stdout || ''}${error.stderr || ''}`
  }
  const args = fs.existsSync(path.join(workspace, 'curl-args'))
    ? fs.readFileSync(path.join(workspace, 'curl-args'), 'utf8')
    : null
  return { stdout, status, args }
}

describe('deliver_login_link', () => {
  it('sends over https, and says so without printing the link', () => {
    const { args, stdout } = deliver('https://discord.test/api/webhooks/1/abc')

    assert.ok(args, 'curl was never called')
    assert.match(args, /--proto\n=https/)
    assert.match(args, /https:\/\/discord\.test/)
    // The point of a private channel is that the link is not in the log.
    assert.doesNotMatch(stdout, /user\/reset/)
  })

  it('sends nothing at all to a plaintext webhook', () => {
    // A typo in the secret would otherwise put a one-click administrator
    // session on the wire in clear.
    const { args, stdout, status } = deliver('http://discord.test/api/webhooks/1/abc')

    assert.equal(args, null, 'curl was called with a non-https webhook')
    assert.match(stdout, /not https/)
    // And it still refuses to fall back to printing it into a public log.
    assert.match(stdout, /REFUSING to print the login link/)
    assert.equal(status, 1)
  })

  it('still refuses the public log when no webhook is set at all', () => {
    const { stdout, status } = deliver('')

    assert.match(stdout, /REFUSING to print the login link/)
    assert.doesNotMatch(stdout, /user\/reset/)
    assert.equal(status, 1)
  })
})
