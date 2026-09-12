import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const forbidden = resolve(process.env.PAGES_TEST_FORBIDDEN_INPUT)
const marker = process.env.PAGES_TEST_READ_MARKER
const appendFileSync = fs.appendFileSync

function guard(path) {
  if (path instanceof URL) path = fileURLToPath(path)
  if (Buffer.isBuffer(path)) path = path.toString()
  if (typeof path !== 'string' || resolve(path) !== forbidden) return
  process.stderr.write('PAGES_TEST_READ_ATTEMPT\n')
  appendFileSync(marker, 'read attempted\n')
  throw new Error('PAGES_TEST_READ_ATTEMPT: rejected before reading fixture bytes')
}

// Cover direct reads and snapshot copying; never call the real operation for the sentinel.
for (const name of ['readFile', 'readFileSync', 'open', 'openSync', 'createReadStream',
  'copyFile', 'copyFileSync', 'cp', 'cpSync']) {
  const original = fs[name]
  fs[name] = function (path, ...args) {
    guard(path)
    return original.call(this, path, ...args)
  }
}
for (const name of ['readFile', 'open', 'copyFile', 'cp']) {
  const original = fs.promises[name]
  fs.promises[name] = async function (path, ...args) {
    guard(path)
    return original.call(this, path, ...args)
  }
}
syncBuiltinESMExports()
