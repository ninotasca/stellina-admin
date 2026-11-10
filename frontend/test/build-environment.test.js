import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { resolveBuildEnvironment } from '../vite.config.ts'

const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))
const entry = fileURLToPath(new URL('../src/lib/diagnostic-core.ts', import.meta.url))

test('build selectors normalize aliases, skip blanks, and apply precedence before validation', () => {
  for (const [alias, expected] of [
    ['local', 'development'], ['dev', 'development'], ['development', 'development'], ['test', 'development'],
    ['stage', 'staging'], ['staging', 'staging'], ['preview', 'staging'], ['prod', 'production'], ['production', 'production'],
  ]) {
    for (const selector of ['ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT_NAME', 'VERCEL_ENV']) {
      assert.equal(resolveBuildEnvironment('invalid-lower-priority', { [selector]: ` ${alias.toUpperCase()} ` }), expected)
    }
    assert.equal(resolveBuildEnvironment(alias, {}), expected)
  }
  assert.equal(resolveBuildEnvironment('development', {
    ENVIRONMENT_NAME: 'production', RAILWAY_ENVIRONMENT_NAME: 'preview', VERCEL_ENV: 'development',
  }), 'production')
  assert.equal(resolveBuildEnvironment('production', {
    ENVIRONMENT_NAME: ' ', RAILWAY_ENVIRONMENT_NAME: 'preview', VERCEL_ENV: 'development',
  }), 'staging')
  assert.equal(resolveBuildEnvironment('development', {
    ENVIRONMENT_NAME: '', RAILWAY_ENVIRONMENT_NAME: '\t', VERCEL_ENV: 'production',
  }), 'production')
  assert.equal(resolveBuildEnvironment('prod', { ENVIRONMENT_NAME: ' ', VERCEL_ENV: '' }), 'production')
  assert.equal(resolveBuildEnvironment(undefined, {}), 'development')
  assert.equal(resolveBuildEnvironment(' ', { ENVIRONMENT_NAME: '' }), 'development')
  for (const marker of ['VERCEL', 'RAILWAY_SERVICE_ID', 'RAILWAY_DEPLOYMENT_ID']) {
    assert.throws(() => resolveBuildEnvironment(' ', { [marker]: 'fixture' }), /Hosted environment must be identified/)
  }
  for (const values of [
    { ENVIRONMENT_NAME: 'unknown', VERCEL_ENV: 'production' },
    { RAILWAY_ENVIRONMENT_NAME: 'unknown', VERCEL_ENV: 'production' },
    { VERCEL_ENV: 'unknown' }, { ENVIRONMENT_NAME: 'toString' }, { ENVIRONMENT_NAME: '__proto__' },
  ]) assert.throws(() => resolveBuildEnvironment('production', values), {
    message: 'Environment must be development, staging, or production',
  })
  assert.throws(() => resolveBuildEnvironment('unknown', {}), /Environment must be/)
})

test('actual builds use selected files and browser diagnostics despite conflicting development mode', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stellina-build-environment-'))
  const saved = { ...process.env }
  const cwd = process.cwd()
  const sinks = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, console[level]]))
  try {
    for (const key of ['ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT_NAME', 'VERCEL_ENV', 'VERCEL',
      'RAILWAY_SERVICE_ID', 'RAILWAY_DEPLOYMENT_ID', 'VITE_CLIENT_LOG_LEVEL', 'VITE_ENABLE_TEST_BOOKINGS',
      'STELLINA_API_PROXY_TARGET']) delete process.env[key]
    // A wrong file load must fail; production has its own valid logging setting.
    writeFileSync(join(root, '.env.development'), 'VITE_CLIENT_LOG_LEVEL=INVALID\nVITE_ENABLE_TEST_BOOKINGS=true\n')
    writeFileSync(join(root, '.env.production'), 'VITE_CLIENT_LOG_LEVEL=ERROR\nVITE_ENABLE_TEST_BOOKINGS=false\nSTELLINA_API_PROXY_TARGET=http://production.example\n')
    const probe = join(root, 'probe.js')
    writeFileSync(probe, `export { clientLog } from ${JSON.stringify(entry)}; export const env = import.meta.env;`)
    process.env.VERCEL_GIT_COMMIT_SHA = '1234567'
    process.chdir(root)
    for (const selector of ['ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT_NAME', 'VERCEL_ENV']) {
      process.env[selector] = 'production'
      let resolved
      const output = await build({
        root, configFile, configLoader: 'native', mode: 'development', logLevel: 'silent',
        plugins: [{ name: 'inspect-selection', configResolved(config) { resolved = config } }],
        build: { write: false, minify: false, lib: { entry: probe, formats: ['es'] } },
      })
      assert.equal(resolved.server.proxy['^/api/v1/(stellina|core)(/|$)'].target, 'http://production.example')
      const code = (Array.isArray(output) ? output : [output]).flatMap(bundle => bundle.output).find(item => item.type === 'chunk').code
      const { clientLog, env } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
      assert.equal(env.MODE, 'production')
      assert.equal(env.VITE_ENABLE_TEST_BOOKINGS, 'false')
      assert.equal(env.STELLINA_API_PROXY_TARGET, undefined)
      const events = []
      try {
        for (const level of Object.keys(sinks)) console[level] = line => events.push(JSON.parse(line))
        for (const level of Object.keys(sinks)) clientLog(level, 'unoventi.auth.policy_loaded')
      } finally { Object.assign(console, sinks) }
      assert.deepEqual(events.map(event => [event.level, event.environment]), [['error', 'production']])
      delete process.env[selector]
    }
    for (const selector of ['ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT_NAME', 'VERCEL_ENV']) {
      process.env[selector] = 'unknown'
      let started = false
      await assert.rejects(build({
        root, configFile, configLoader: 'native', mode: 'production', logLevel: 'silent',
        plugins: [{ name: 'observe-build', buildStart() { started = true } }],
        build: { write: false, lib: { entry: probe, formats: ['es'] } },
      }), { message: 'Environment must be development, staging, or production' })
      assert.equal(started, false)
      delete process.env[selector]
    }
  } finally {
    Object.assign(console, sinks)
    process.env = saved
    process.chdir(cwd)
    rmSync(root, { recursive: true, force: true })
  }
})
