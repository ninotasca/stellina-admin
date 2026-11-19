import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { decodePublicConfig } from '../build/public-config.js'

const readJson = relative => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'))
const manifest = readJson('../src/app/application-manifest.json')
const registry = readJson('../config/application-binding.registry.json')
const values = {
  VITE_SUPABASE_URL: 'https://qcpklgptamrrlmqrhfmt.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_WE_UH1Q--JMms18CYerOEw_3ydL2kSY',
  VITE_AUTH_ENABLE_MAGIC_LOGIN: 'false', VITE_ENABLE_TEST_BOOKINGS: 'false',
}

test('registry bytes match the separately pinned SHA-256 digest', () => {
  const source = readFileSync(fileURLToPath(new URL('../config/application-binding.registry.json', import.meta.url)))
  const expected = readFileSync(fileURLToPath(new URL('../config/application-binding.registry.sha256', import.meta.url)), 'utf8').trim()
  assert.equal(createHash('sha256').update(source).digest('hex'), expected)
  assert.notEqual(createHash('sha256').update(Buffer.concat([source, Buffer.from(' ')])).digest('hex'), expected)
})

test('canonical Stellina manifest produces immutable scoped configuration in every mode', () => {
  for (const [environment, level] of [['development', 'debug'], ['staging', 'warn'], ['production', 'error']]) {
    const result = decodePublicConfig(manifest, values, environment, registry)
    assert.equal(result.ok, true)
    assert.equal(result.value.manifest.applicationId, 'stellina-admin')
    assert.equal(result.value.manifest.api.productNamespace, 'stellina')
    assert.equal(result.value.manifest.auth.siteKey, 'stellina')
    assert.deepEqual(result.value.manifest.api.coreCapabilities, ['auth'])
    assert.equal(result.value.apiBaseUrl, '/api/v1')
    assert.equal(result.value.clientLogLevel, level)
    assert.ok(Object.isFrozen(result.value.manifest.api.coreCapabilities))
  }
})

test('identity, scope, capability and unknown-field mutations fail closed', () => {
  const cases = [
    ['foreign app', value => { value.applicationId = 'unoventi-admin' }, 'scope-mismatch'],
    ['foreign site', value => { value.auth.siteKey = 'unoventi-admin' }, 'scope-mismatch'],
    ['foreign product', value => { value.api.productNamespace = 'nimble' }, 'scope-mismatch'],
    ['missing product', value => { value.api.productNamespace = null }, 'manifest-invalid'],
    ['platform capability', value => { value.api.coreCapabilities = ['auth', 'platform-administration'] }, 'scope-mismatch'],
    ['unknown capability', value => { value.api.coreCapabilities = ['*'] }, 'manifest-invalid'],
    ['unknown field', value => { value.runtimePolicy = true }, 'manifest-invalid'],
    ['unowned route', value => { value.branding.postLoginPath = '/foreign' }, 'manifest-invalid'],
  ]
  for (const [name, mutate, code] of cases) {
    const candidate = structuredClone(manifest); mutate(candidate)
    assert.deepEqual(decodePublicConfig(candidate, values, 'production', registry), { ok: false, code }, name)
  }
})

test('unlisted, malformed, cross-origin and production UX switches fail closed', () => {
  for (const patch of [
    { VITE_SITE_ID: 'foreign' },
    { VITE_API_BASE_URL: '/api' },
    { VITE_API_BASE_URL: 'https://evil.invalid/api/v1' },
    { VITE_SUPABASE_URL: 'https://foreign.invalid' },
    { VITE_CLIENT_LOG_LEVEL: ' ERROR' },
    { VITE_AUTH_ENABLE_MAGIC_LOGIN: 'true' },
    { VITE_ENABLE_TEST_BOOKINGS: 'true' },
  ]) assert.deepEqual(decodePublicConfig(manifest, { ...values, ...patch }, 'production', registry), { ok: false, code: 'public-invalid' })
})

test('development UX switches do not change identity or authority', () => {
  const result = decodePublicConfig(manifest, {
    ...values, VITE_AUTH_ENABLE_MAGIC_LOGIN: 'true', VITE_ENABLE_TEST_BOOKINGS: 'true',
  }, 'development', registry)
  assert.equal(result.ok, true)
  assert.equal(result.value.switches.enableMagicLoginUi, true)
  assert.equal(result.value.switches.includeTestBookings, true)
  assert.equal(result.value.manifest.auth.siteKey, 'stellina')
  assert.deepEqual(result.value.manifest.api.coreCapabilities, ['auth'])
})
