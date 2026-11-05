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
import { pathToFileURL } from 'node:url'

import { exitWithError, NUXT_DIR } from './lib.mjs'
import {
  packageFiles,
  pinnedNodeMajor,
  provenance,
  repositoryName,
  vendoredManifest,
} from './vendor.mjs'

/** Dependencies whose install scripts build a binary the module's build needs. */
const NATIVE_DEPENDENCIES = ['esbuild']

/** The files npm would pack from a checkout, as npm resolves the manifest's `files`. */
/** Files npm packs whatever the manifest says. */
const ALWAYS_PACKED = /^(README|LICENSE|LICENCE|CHANGELOG|CHANGES|HISTORY|NOTICE)(\.|$)/i

/** Whether a packed file belongs to the default set, for a manifest with no `files`. */
function isDefaultFile(file, manifest) {
  if (ALWAYS_PACKED.test(file)) return true
  return packageFiles(manifest).some((entry) => file === entry || file.startsWith(`${entry}/`))
}

function packedFiles(cwd) {
  const output = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], cwd)
  const [packed] = JSON.parse(output)
  return (packed.files || []).map((file) => file.path)
}

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
    // git hooks, and a worktree shares its checkout's git config. A bare
    // `npm rebuild` would run the root's scripts as well, so only the
    // dependencies that need a native build are rebuilt: esbuild, which every
    // one of these builds uses, installs its binary that way and fails the
    // build without it.
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], worktree)
    const native = NATIVE_DEPENDENCIES.filter((dependency) =>
      fs.existsSync(path.join(worktree, 'node_modules', dependency))
    )
    if (native.length) run('npm', ['rebuild', ...native], worktree)
    run('npm', ['run', 'build'], worktree)

    const manifest = JSON.parse(fs.readFileSync(path.join(worktree, 'package.json'), 'utf8'))
    // The files npm itself would publish, so a glob in `files` is honoured.
    // A manifest with no list makes npm pack everything it does not ignore,
    // sources and tests included; then only the default (dist) and the files
    // npm always packs are taken.
    const listed = Array.isArray(manifest.files) && manifest.files.length > 0
    const files = packedFiles(worktree).filter(
      (file) => file !== 'package.json' && (listed || isDefaultFile(file, manifest))
    )

    // Into a staging directory first. The vendored copy is replaced only once
    // the build is known to be whole, so a failed build leaves it as it was.
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), `vendor-${name}-staging-`))
    try {
      for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(staging, file)), { recursive: true })
        fs.cpSync(path.join(worktree, file), path.join(staging, file))
      }
      if (!files.length)
        throw new Error(`The build produced none of: ${packageFiles(manifest).join(', ')}`)
      for (const entry of ['main', 'module']) {
        if (manifest[entry] && !fs.existsSync(path.join(staging, manifest[entry]))) {
          throw new Error(`The build did not produce the manifest's ${entry}: ${manifest[entry]}`)
        }
      }
      fs.writeFileSync(
        path.join(staging, 'package.json'),
        `${JSON.stringify(vendoredManifest(manifest), null, 2)}\n`
      )
      fs.writeFileSync(
        path.join(staging, 'README.md'),
        provenance({ name, packageName: manifest.name, repository, ref: wanted, commit })
      )

      const target = path.join(vendorDir, name)
      fs.rmSync(target, { recursive: true, force: true })
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.cpSync(staging, target, { recursive: true })
      const copied = [...new Set(files.map((file) => file.split('/')[0]))].sort()
      return { target, commit, repository, ref: wanted, copied, warnings }
    } finally {
      fs.rmSync(staging, { recursive: true, force: true })
    }
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: source })
    fs.rmSync(worktree, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
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
