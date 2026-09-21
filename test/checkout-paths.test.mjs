/**
 * Each checkout gets its own database, log and PID file in /tmp.
 *
 * A fixed name is shared by every clone of this repository on the machine,
 * so provisioning one checkout wiped the database another one was serving.
 * PHP (drupal/.devtools/helpers.php), Node (scripts/lib.mjs) and Make
 * (drupal/Makefile) each work the path out for themselves, so this checks
 * they agree: three implementations that drift apart put the database back
 * where every checkout shares it.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { describe, it } from 'node:test'

import {
  DRUPAL_DIR,
  checkoutKey,
  defaultDbFile,
  serverLogFile,
  serverPidFile,
} from '../scripts/lib.mjs'

const has = (command) => spawnSync(command, ['--version']).status === 0

const php = (expression) =>
  spawnSync('php', ['-r', `require '.devtools/helpers.php'; echo ${expression};`], {
    cwd: DRUPAL_DIR,
    encoding: 'utf8',
  }).stdout.trim()

describe('checkout paths', () => {
  it('keys every file by the checkout', () => {
    const key = crypto
      .createHash('sha256')
      .update(fs.realpathSync(DRUPAL_DIR))
      .digest('hex')
      .slice(0, 12)

    assert.equal(checkoutKey(), key)
    assert.equal(defaultDbFile(), `/tmp/deciphered-${key}-site.sqlite`)
    assert.equal(serverLogFile(), `/tmp/deciphered-${key}-php-server.log`)
    assert.equal(serverPidFile(), `/tmp/deciphered-${key}-php-server.pid`)
  })

  it('gives another checkout other files', () => {
    assert.notEqual(checkoutKey('/elsewhere/drupal'), checkoutKey())
  })

  it('agrees with the PHP devtools', { skip: !has('php') && 'no php' }, () => {
    assert.equal(php('DecipheredDevTools\\default_db_file()'), defaultDbFile())
    assert.equal(php('DecipheredDevTools\\server_log_file()'), serverLogFile())
    assert.equal(php('DecipheredDevTools\\server_pid_file()'), serverPidFile())
  })

  it('agrees with the Makefile', { skip: !has('make') && 'no make' }, () => {
    // Unset, not blank: Make's ?= treats an empty variable as already set.
    const env = { ...process.env }
    delete env.DB_FILE
    const result = spawnSync(
      'make',
      ['-s', '-C', DRUPAL_DIR, '--eval', 'print-paths:\n\t@echo $(DB_FILE)', 'print-paths'],
      { encoding: 'utf8', env }
    )

    assert.equal(result.stdout.trim(), defaultDbFile())
  })
})
