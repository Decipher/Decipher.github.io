/**
 * Build a Druxt module from its own repository and vendor the result.
 *
 *   npm run vendor:sync -- <name> <checkout> [ref]
 *
 * <name> is the directory under nuxt/vendor/, <checkout> a local clone of the
 * module's repository, and <ref> the branch, tag or commit to build, the
 * checkout's current branch by default.
 *
 * The build runs in a throwaway worktree of that commit, so the checkout is
 * never touched and uncommitted work in it can never reach a vendored copy.
 * What lands in nuxt/vendor/<name>/ is the module's `files`, its manifest less
 * what only building needs, and a README naming the commit it was built from.
 *
 * Run it under the Node the module pins, for example
 * `mise exec node@16.20.1 -- npm run vendor:sync -- admin ../druxt-admin`.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { exitWithError, NUXT_DIR } from './lib.mjs'
import {
  packageFiles,
  pinnedNodeMajor,
  provenance,
  repositoryName,
  vendoredManifest,
} from './vendor.mjs'

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}\n${output}`)
  }
  return (result.stdout || '').trim()
}

export function vendorSync({ name, checkout, ref, vendorDir }) {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`A vendored name is lowercase letters, digits and hyphens: got "${name}"`)
  }
  const source = path.resolve(checkout)
  const wanted = ref || run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], source)
  const commit = run('git', ['rev-parse', `${wanted}^{commit}`], source)
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
    cwd: source,
    encoding: 'utf8',
  })
  const repository = remote.status === 0 ? repositoryName(remote.stdout) : path.basename(source)

  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), `vendor-${name}-`))
  const warnings = []
  try {
    run('git', ['worktree', 'add', '--detach', worktree, commit], source)

    const nvmrc = path.join(worktree, '.nvmrc')
    const pinned = fs.existsSync(nvmrc) ? pinnedNodeMajor(fs.readFileSync(nvmrc, 'utf8')) : null
    const running = Number(process.versions.node.split('.')[0])
    if (pinned && pinned !== running) {
      warnings.push(`the module pins Node ${pinned}, and this build ran on Node ${running}`)
    }

    // The module's own install scripts stay off: its postinstall configures
    // git hooks, and a worktree shares its checkout's git config. Its
    // dependencies' install scripts do run, through `npm rebuild`: esbuild,
    // which every one of these builds uses, installs its binary that way and
    // fails the build without it.
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], worktree)
    run('npm', ['rebuild'], worktree)
    run('npm', ['run', 'build'], worktree)

    const manifest = JSON.parse(fs.readFileSync(path.join(worktree, 'package.json'), 'utf8'))
    const target = path.join(vendorDir, name)
    fs.rmSync(target, { recursive: true, force: true })
    fs.mkdirSync(target, { recursive: true })

    const copied = []
    for (const entry of packageFiles(manifest)) {
      const from = path.join(worktree, entry)
      if (!fs.existsSync(from)) continue
      fs.cpSync(from, path.join(target, entry), { recursive: true })
      copied.push(entry)
    }
    if (!copied.length)
      throw new Error(`The build produced none of: ${packageFiles(manifest).join(', ')}`)

    fs.writeFileSync(
      path.join(target, 'package.json'),
      `${JSON.stringify(vendoredManifest(manifest), null, 2)}\n`
    )
    fs.writeFileSync(
      path.join(target, 'README.md'),
      provenance({ name, packageName: manifest.name, repository, ref: wanted, commit })
    )

    return { target, commit, repository, ref: wanted, copied, warnings }
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: source })
    fs.rmSync(worktree, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, checkout, ref] = process.argv.slice(2)
  if (!name || !checkout) {
    exitWithError('Usage: npm run vendor:sync -- <name> <checkout> [ref]')
  }
  try {
    const result = vendorSync({
      name,
      checkout,
      ref,
      vendorDir: process.env.VENDOR_DIR || path.join(NUXT_DIR, 'vendor'),
    })
    console.log(
      `Vendored ${result.repository} ${result.ref} (${result.commit.slice(0, 12)}) into ${path.relative(process.cwd(), result.target)}: ${result.copied.join(', ')}`
    )
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
    console.log(`Then: npm --prefix nuxt install, so the lock file records it.`)
  } catch (error) {
    exitWithError(error.message)
  }
}
