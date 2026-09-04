/**
 * Tests for drupal/.devtools/tunnel.
 *
 * The script waits thirty seconds for cloudflared to publish a hostname, and
 * for a while it did not wait at all: `set -euo pipefail` plus an
 * `extract_url` built from `grep | head` meant the first look at an empty log
 * killed the whole script, one second in and without a word about why. A quick
 * tunnel that answered inside a second hid it; a slow one failed the job.
 *
 * So these run the real script against a fake cloudflared that takes its time,
 * which is the only difference between the two outcomes.
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let workspace

/**
 * A throwaway copy of the script, with a fake cloudflared ahead of it on PATH.
 *
 * `delay` is how long the fake waits before writing a hostname to its log, and
 * `hostname` is what it writes, or nothing at all to stand in for a tunnel that
 * never comes up.
 */
function stage({ delay, hostname }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-test-'))
  fs.mkdirSync(path.join(root, 'drupal', '.devtools'), { recursive: true })
  fs.mkdirSync(path.join(root, 'bin'))
  fs.copyFileSync(
    path.join(REPO, 'drupal', '.devtools', 'tunnel'),
    path.join(root, 'drupal', '.devtools', 'tunnel')
  )
  fs.chmodSync(path.join(root, 'drupal', '.devtools', 'tunnel'), 0o755)

  // Writes the hostname the way cloudflared does, into the log the script
  // reads, then stays alive so the script's pid check keeps passing.
  const line = hostname ? `echo "INF |  https://${hostname}.trycloudflare.com  |"\n` : ''
  fs.writeFileSync(
    path.join(root, 'bin', 'cloudflared'),
    `#!/usr/bin/env bash\nsleep ${delay}\n${line}sleep 300\n`
  )
  fs.chmodSync(path.join(root, 'bin', 'cloudflared'), 0o755)
  return root
}

/** Start the staged script and collect what it says. */
function start(root) {
  const child = spawn('./.devtools/tunnel', {
    cwd: path.join(root, 'drupal'),
    env: {
      ...process.env,
      PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
      WEBSERVER_PORT: '8888',
    },
  })
  const output = { stdout: '', stderr: '', code: undefined }
  child.stdout.on('data', (chunk) => (output.stdout += chunk))
  child.stderr.on('data', (chunk) => (output.stderr += chunk))
  const ended = new Promise((resolve) =>
    child.on('close', (code) => {
      output.code = code
      resolve(output)
    })
  )
  return { child, output, ended }
}

/** Run to completion, or give up and kill it. */
async function run(root, { timeoutMs = 45000 } = {}) {
  const { child, ended } = start(root)
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  try {
    return await ended
  } finally {
    clearTimeout(timer)
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

before(() => {
  workspace = []
})

after(() => {
  for (const root of workspace) fs.rmSync(root, { recursive: true, force: true })
})

describe('the tunnel script', () => {
  it('keeps waiting when the hostname takes longer than a second', async () => {
    // The failure this exists for. cloudflared on the CI runner needed several
    // seconds; the script gave up after one and said nothing at all.
    const root = stage({ delay: 4, hostname: 'slow-but-fine' })
    workspace.push(root)

    const { child, output } = start(root)
    // Past the second it used to die at, and past the fake's own delay. It
    // cannot finish from here, because the health check curls a hostname that
    // does not resolve, so being alive is the assertion.
    await wait(8000)
    const alive = output.code === undefined
    child.kill('SIGKILL')

    assert.ok(alive, `exited early with ${output.code}: ${output.stdout}${output.stderr}`)
    assert.doesNotMatch(output.stderr, /No tunnel URL after 30s/)
  })

  it('reports the log when no hostname ever arrives', async () => {
    const root = stage({ delay: 0, hostname: null })
    workspace.push(root)

    const { code, stderr } = await run(root, { timeoutMs: 45000 })

    // A silent exit 1 tells whoever is reading the job nothing at all.
    assert.equal(code, 1)
    assert.match(stderr, /No tunnel URL after 30s/)
  })
})
