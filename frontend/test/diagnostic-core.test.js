import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const entry = fileURLToPath(new URL('../src/lib/diagnostic-core.ts', import.meta.url))
async function diagnostics(mode, raw) {
  const output = await build({
    root, configFile: false, mode, logLevel: 'silent',
    define: { 'import.meta.env.VITE_CLIENT_LOG_LEVEL': raw === undefined ? 'undefined' : JSON.stringify(raw) },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
  })
  const code = (Array.isArray(output) ? output : [output]).flatMap(bundle => bundle.output).find(item => item.type === 'chunk').code
  assert.doesNotMatch(code, /stellinaProxy|process\.env|node:/)
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

test('browser modes, portable levels, filtering, envelope and privacy', async () => {
  const sinks = { debug: console.debug, info: console.info, warn: console.warn, error: console.error }
  try {
    for (const [mode, expected] of [
      ['development', ['debug', 'info', 'warn', 'error']],
      ['staging', ['warn', 'error']], ['production', ['error']],
    ]) {
      const { clientLog, resolveClientLogLevel } = await diagnostics(mode)
      for (const raw of ['DEBUG', 'info', ' wArN ', 'ERROR']) {
        assert.equal(resolveClientLogLevel(raw, mode), raw.trim().toLowerCase())
      }
      for (const raw of ['', 'WARNING', 'toString', 'private-invalid-canary']) {
        assert.throws(() => resolveClientLogLevel(raw, mode), /VITE_CLIENT_LOG_LEVEL must be/)
      }
      const lines = []
      for (const level of Object.keys(sinks)) console[level] = line => { lines.push([level, JSON.parse(line)]) }
      for (const level of Object.keys(sinks)) {
        clientLog(level, 'unoventi.auth.policy_loaded', {
          provider_count: 2, magic_login_admin: true, magic_login_frontend: false, magic_login_effective: false,
          message: 'secret-canary', access_token: 'token-canary', provider: { body: 'body-canary' },
          error_class: 'name-canary', toJSON() { throw new Error('must not serialize caller') },
        })
      }
      assert.deepEqual(lines.map(([method]) => method), expected)
      for (const [method, event] of lines) {
        assert.equal(event.level, method)
        assert.equal(event.service, 'stellina-admin-web')
        assert.equal(event.environment, mode)
        assert.equal(event.component, 'auth')
        assert.equal(event.site_key, 'stellina')
        assert.equal(event.message, 'Authentication policy loaded')
        assert.equal(event.event, 'unoventi.auth.policy_loaded')
        assert.ok(Number.isFinite(Date.parse(event.timestamp)))
        assert.equal(event.provider_count, 2)
        assert.equal(event.magic_login_effective, false)
        assert.doesNotMatch(JSON.stringify(event), /canary/)
      }
    }
    const { clientLog } = await diagnostics('production', 'DEBUG')
    const lines = []
    console.error = line => { lines.push(JSON.parse(line)) }
    clientLog('error', 'unoventi.auth.logout_failed', { status: 401, success: false, error_class: 'AuthError' })
    assert.equal(lines[0].error_class, 'AuthError')
    assert.equal(lines[0].status, 401)
    assert.equal(lines[0].success, false)
    clientLog('error', 'private-event-canary')
    assert.equal(lines.length, 1)
  } finally { Object.assign(console, sinks) }
})

test('adapter isolates event construction, serialization and sink failures', async () => {
  const { clientLog } = await diagnostics('production')
  const original = { sink: console.error, stringify: JSON.stringify, iso: Date.prototype.toISOString }
  const lines = []
  try {
    console.error = line => { lines.push(line) }
    const fields = Object.defineProperty({}, 'provider_count', { get() { throw new Error('getter-canary') } })
    assert.doesNotThrow(() => clientLog('error', 'unoventi.auth.logout_failed', fields))
    JSON.stringify = () => { throw new Error('serialization-canary') }
    assert.doesNotThrow(() => clientLog('error', 'unoventi.auth.logout_failed'))
    JSON.stringify = original.stringify
    Date.prototype.toISOString = () => { throw new Error('clock-canary') }
    assert.doesNotThrow(() => clientLog('error', 'unoventi.auth.logout_failed'))
    Date.prototype.toISOString = original.iso
    console.error = () => { throw new Error('sink-canary') }
    assert.doesNotThrow(() => clientLog('error', 'unoventi.auth.logout_failed'))
    assert.deepEqual(lines, [])
  } finally {
    console.error = original.sink
    JSON.stringify = original.stringify
    Date.prototype.toISOString = original.iso
  }
})
