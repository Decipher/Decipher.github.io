import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { vendorSync } from '../scripts/vendor-sync.mjs'
import {
  isCommitId,
  packageFiles,
  pinnedNodeMajor,
  provenance,
  repositoryName,
  vendoredManifest,
} from '../scripts/vendor.mjs'

describe('repositoryName', () => {
  it('drops the host from every remote form', () => {
    // This repository is public, and a module's remote may be on a host only
    // its maintainers can reach.
    for (const remote of [
      'git@git.example.com:druxt/druxt-diff.git',
      'https://git.example.com/druxt/druxt-diff.git',
      'http://oauth2:secret@git.example.com/druxt/druxt-diff.git',
      'ssh://git@git.example.com/druxt/druxt-diff',
      'https://git.example.com/druxt/druxt-diff\n',
    ]) {
      assert.equal(repositoryName(remote), 'druxt/druxt-diff', remote)
    }
  })

  it('keeps a nested namespace', () => {
    assert.equal(repositoryName('https://git.example.com/group/sub/repo.git'), 'group/sub/repo')
  })
})

describe('vendoredManifest', () => {
  it('drops what only building and publishing need', () => {
    const vendored = vendoredManifest({
      name: '@druxt-contrib/x',
      type: 'module',
      main: 'dist/index.ssr.js',
      scripts: { build: 'siroc build' },
      devDependencies: { siroc: '0.16.0' },
      peerDependencies: { vue: '^2.7.0' },
      peerDependenciesMeta: { druxt: { optional: true } },
      packageManager: 'npm@8.19.4',
      publishConfig: { access: 'public' },
    })

    assert.deepEqual(vendored, {
      name: '@druxt-contrib/x',
      main: 'dist/index.ssr.js',
      peerDependencies: { vue: '^2.7.0' },
      // Kept: it is what marks a peer optional.
      peerDependenciesMeta: { druxt: { optional: true } },
    })
  })
})

describe('packageFiles', () => {
  it("is the module's own files list", () => {
    assert.deepEqual(packageFiles({ files: ['dist', 'templates'] }), ['dist', 'templates'])
  })

  it('is dist without one', () => {
    assert.deepEqual(packageFiles({}), ['dist'])
    assert.deepEqual(packageFiles({ files: [] }), ['dist'])
  })
})

describe('provenance', () => {
  const commit = '02bd40e0123456789abcdef0123456789abcdef0'

  it('names the repository, the ref and the commit', () => {
    const readme = provenance({
      name: 'admin',
      packageName: '@druxt-contrib/admin',
      repository: 'druxt/druxt-admin',
      ref: 'feature/3-proxy-mode',
      commit,
    })

    assert.match(readme, /^# Vendored: @druxt-contrib\/admin/)
    assert.match(readme, /`druxt\/druxt-admin`, `feature\/3-proxy-mode` at commit `02bd40e01234`/)
    assert.match(readme, /npm run vendor:sync -- admin/)
    assert.match(readme, /file:vendor\/admin/)
  })

  it('does not repeat a commit given as the ref', () => {
    const readme = provenance({
      name: 'admin',
      packageName: '@druxt-contrib/admin',
      repository: 'druxt/druxt-admin',
      ref: '02bd40e',
      commit,
    })

    assert.match(readme, /Built from `druxt\/druxt-admin`, commit `02bd40e01234`\./)
  })

  it('tells a commit id from a branch', () => {
    assert.equal(isCommitId('02bd40e'), true)
    assert.equal(isCommitId('main'), false)
    assert.equal(isCommitId('feature/3-proxy-mode'), false)
  })
})

describe('pinnedNodeMajor', () => {
  it('reads the forms .nvmrc takes', () => {
    assert.equal(pinnedNodeMajor('16.20.1\n'), 16)
    assert.equal(pinnedNodeMajor('v22'), 22)
    assert.equal(pinnedNodeMajor('lts/*'), null)
    assert.equal(pinnedNodeMajor(''), null)
  })
})

/**
 * The whole sync, against a module repository made up for the test: a git
 * repository with a package whose build writes its dist. No network, no
 * dependencies, and the same code path as a real module.
 */
describe('vendorSync', () => {
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }

  function makeModule(overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-module-'))
    const manifest = {
      name: '@druxt-contrib/fake',
      version: '0.0.0',
      type: 'module',
      main: 'dist/index.ssr.js',
      files: ['dist', 'templates'],
      scripts: {
        build:
          "node -e \"require('fs').mkdirSync('dist',{recursive:true});require('fs').writeFileSync('dist/index.ssr.js','module.exports = 1\\n')\"",
      },
      devDependencies: {},
      ...overrides,
    }
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest, null, 2))
    fs.writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        name: manifest.name,
        version: '0.0.0',
        lockfileVersion: 2,
        requires: true,
        packages: { '': { name: manifest.name, version: '0.0.0' } },
      })
    )
    fs.mkdirSync(path.join(root, 'templates'))
    fs.writeFileSync(path.join(root, 'templates', 'plugin.js'), 'export default {}\n')
    git(root, 'init', '-q', '-b', 'main')
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A')
    git(root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init')
    git(root, 'remote', 'add', 'origin', 'git@git.example.com:druxt/druxt-fake.git')
    return root
  }

  it('builds the commit and records where it came from', () => {
    const checkout = makeModule()
    const vendorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-out-'))
    // Uncommitted work in the checkout must never reach a vendored copy.
    fs.writeFileSync(path.join(checkout, 'templates', 'plugin.js'), 'UNCOMMITTED\n')

    const result = vendorSync({ name: 'fake', checkout, vendorDir })
    const target = path.join(vendorDir, 'fake')

    assert.equal(result.ref, 'main')
    assert.equal(result.commit, git(checkout, 'rev-parse', 'HEAD'))
    assert.deepEqual(result.copied, ['dist', 'templates'])
    assert.equal(
      fs.readFileSync(path.join(target, 'dist', 'index.ssr.js'), 'utf8'),
      'module.exports = 1\n'
    )
    assert.equal(
      fs.readFileSync(path.join(target, 'templates', 'plugin.js'), 'utf8'),
      'export default {}\n'
    )

    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'))
    assert.equal(manifest.type, undefined)
    assert.equal(manifest.scripts, undefined)

    const readme = fs.readFileSync(path.join(target, 'README.md'), 'utf8')
    assert.match(readme, new RegExp(result.commit.slice(0, 12)))
    assert.match(readme, /`druxt\/druxt-fake`/)
    assert.doesNotMatch(readme, /example\.com/)

    // The throwaway worktree is gone, and the checkout is as it was.
    assert.equal(git(checkout, 'worktree', 'list').split('\n').length, 1)
    assert.equal(
      fs.readFileSync(path.join(checkout, 'templates', 'plugin.js'), 'utf8'),
      'UNCOMMITTED\n'
    )
  })

  it('replaces a previous copy rather than layering over it', () => {
    const checkout = makeModule()
    const vendorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-out-'))
    fs.mkdirSync(path.join(vendorDir, 'fake', 'dist'), { recursive: true })
    fs.writeFileSync(path.join(vendorDir, 'fake', 'dist', 'stale.js'), 'old\n')

    vendorSync({ name: 'fake', checkout, vendorDir })

    assert.equal(fs.existsSync(path.join(vendorDir, 'fake', 'dist', 'stale.js')), false)
  })

  it('honours a glob in the manifest files, as npm would', () => {
    const checkout = makeModule({ files: ['dist/**', 'templates'] })
    const vendorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-out-'))

    const result = vendorSync({ name: 'fake', checkout, vendorDir })

    assert.deepEqual(result.copied, ['dist', 'templates'])
    assert.equal(fs.existsSync(path.join(vendorDir, 'fake', 'dist', 'index.ssr.js')), true)
  })

  it('takes only dist and what npm always packs when the manifest lists no files', () => {
    const checkout = makeModule({ files: undefined })
    fs.mkdirSync(path.join(checkout, 'src'))
    fs.writeFileSync(path.join(checkout, 'src', 'index.js'), 'export default 1\n')
    fs.writeFileSync(path.join(checkout, 'LICENSE'), 'MIT\n')
    git(checkout, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A')
    git(checkout, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'src')
    const vendorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-out-'))

    const result = vendorSync({ name: 'fake', checkout, vendorDir })

    assert.deepEqual(result.copied, ['LICENSE', 'dist'])
    assert.equal(fs.existsSync(path.join(vendorDir, 'fake', 'src')), false)
    assert.equal(fs.existsSync(path.join(vendorDir, 'fake', 'templates')), false)
  })

  it('keeps the previous copy when the build leaves no entry point', () => {
    const checkout = makeModule({ scripts: { build: 'node -e "0"' } })
    const vendorDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-out-'))
    fs.mkdirSync(path.join(vendorDir, 'fake', 'dist'), { recursive: true })
    fs.writeFileSync(path.join(vendorDir, 'fake', 'dist', 'index.ssr.js'), 'previous\n')

    assert.throws(
      () => vendorSync({ name: 'fake', checkout, vendorDir }),
      /did not produce the manifest's main/
    )
    assert.equal(
      fs.readFileSync(path.join(vendorDir, 'fake', 'dist', 'index.ssr.js'), 'utf8'),
      'previous\n'
    )
  })

  it('refuses a name that is not a directory name', () => {
    assert.throws(
      () => vendorSync({ name: '../escape', checkout: '.', vendorDir: os.tmpdir() }),
      /lowercase letters, digits and hyphens/
    )
  })
})
