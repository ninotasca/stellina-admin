import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { spawnSync } from 'node:child_process'
import { classifyEnvironment, proxyStellinaRequest } from '../server/stellinaProxy.js'

const route = '/api/v1/stellina/health'
const idHeader = 'x-stellina-request-id'
const correlationHeader = 'x-correlation-id'
const canary = 'private-logging-failure-canary'
const stringify = JSON.stringify

function assertFallback(line, correlationId, environment = classifyEnvironment()) {
  assert.equal(line.split('\n').length, 2, 'one complete JSON line')
  assert.ok(line.endsWith('\n'))
  const entry = JSON.parse(line)
  assert.equal(new Date(entry.timestamp).toISOString(), entry.timestamp)
  assert.deepEqual(entry, {
    timestamp: entry.timestamp, environment, correlation_id: correlationId,
    level: 'error', service: 'stellina-web', component: 'api-proxy',
    event: 'stellina.proxy.logging_failed', message: 'Stellina proxy diagnostic logging failed.',
  })
}

for (const failure of ['serialization', 'primary sink']) {
  for (const fallbackAvailable of [true, false]) {
    for (const outcome of ['success', 'upstream error', 'connection failure', 'timeout']) {
      test(`${failure}, stderr ${fallbackAvailable ? 'available' : 'unavailable'}: preserves ${outcome}`, async t => {
        const writes = []
        let primaryCalls = 0
        t.mock.method(fs, 'writeSync', (fd, line) => {
          writes.push({ fd, line })
          if (!fallbackAvailable) throw new Error(canary)
          return Buffer.byteLength(line)
        })
        syncBuiltinESMExports()
        if (failure === 'serialization') {
          t.mock.method(JSON, 'stringify', (value, ...args) => {
            if (value?.component === 'api-proxy') throw new Error(canary)
            return stringify(value, ...args)
          })
        }
        const sink = () => { primaryCalls++; throw new Error(canary) }
        try {
          const response = await proxyStellinaRequest(new Request(`https://stellina.example${route}?token=${canary}`, {
            headers: { [idHeader]: 'logging-fixture', authorization: `Bearer ${canary}`, cookie: `session=${canary}` },
          }), route, {
            logger: { info: sink, warn: sink, error: sink }, logLevel: 'DEBUG', timeoutMs: 5,
            fetchImpl: async (_, init) => {
              if (outcome === 'connection failure') throw new Error(canary)
              if (outcome === 'timeout') {
                return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error(canary)), { once: true }))
              }
              return new Response(`upstream body ${canary}`, {
                status: outcome === 'success' ? 201 : 503,
                headers: { 'content-type': 'text/plain', 'cache-control': 'private', 'retry-after': '60' },
              })
            },
          })
          assert.equal(response.headers.get(idHeader), 'logging-fixture')
          assert.equal(response.headers.get(correlationHeader), 'logging-fixture')
          if (outcome === 'success') {
            assert.equal(response.status, 201)
            assert.equal(await response.text(), `upstream body ${canary}`)
            assert.equal(response.headers.get('content-type'), 'text/plain')
            assert.equal(response.headers.get('cache-control'), 'private')
            assert.equal(response.headers.get('retry-after'), '60')
          } else {
            const [status, code, message] = outcome === 'upstream error'
              ? [503, 'upstream_unavailable', 'The Stellina data service is unavailable.']
              : outcome === 'timeout'
                ? [504, 'upstream_timeout', 'The Stellina data service took too long to respond.']
                : [502, 'upstream_unavailable', 'Stellina could not reach the data service.']
            assert.equal(response.status, status)
            assert.deepEqual(await response.json(), { detail: { code, message, correlation_id: 'logging-fixture' } })
            assert.equal(response.headers.get('cache-control'), 'no-store')
          }
          assert.equal(primaryCalls, failure === 'serialization' ? 0 : 2)
          assert.equal(writes.length, 2)
          for (const { fd, line } of writes) {
            assert.equal(fd, 2)
            assertFallback(line, 'logging-fixture')
          }
          assert.ok(writes.every(({ line }) => !line.includes(canary)))
          assert.equal(JSON.parse(writes[0].line).level, 'error')
        } finally {
          t.mock.restoreAll()
          syncBuiltinESMExports()
        }
      })
    }
  }
}

test('healthy and filtered diagnostics do not invoke the fallback', async t => {
  const writes = []
  const entries = []
  t.mock.method(fs, 'writeSync', (...args) => writes.push(args))
  syncBuiltinESMExports()
  try {
    for (const logLevel of ['DEBUG', 'ERROR']) {
      const response = await proxyStellinaRequest(new Request(`https://stellina.example${route}`), route, {
        logLevel, logger: { info: line => entries.push(JSON.parse(line)) },
        fetchImpl: async () => new Response('ok'),
      })
      assert.equal(await response.text(), 'ok')
    }
    assert.deepEqual(entries.map(entry => entry.event), ['stellina.proxy.started', 'stellina.proxy.completed'])
    for (const entry of entries) {
      assert.equal(entry.environment, classifyEnvironment())
      assert.equal(entry.correlation_id, entry.request_id)
    }
    assert.deepEqual(writes, [])
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  }
})

for (const [configured, expected] of [['test', 'development'], ['preview', 'staging'], ['production', 'production']]) {
  test(`default console failure emits the complete signal on real stderr in ${expected}`, () => {
    const moduleUrl = new URL('../server/stellinaProxy.js', import.meta.url).href
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const { proxyStellinaRequest } = await import(${stringify(moduleUrl)});
      console.info = () => { throw new Error('private-console-canary'); };
      const response = await proxyStellinaRequest(new Request('https://stellina.example/api/v1/stellina/health', {
        headers: { 'x-stellina-request-id': 'real-stderr-fixture' },
      }), '/api/v1/stellina/health', {
        logLevel: 'INFO', fetchImpl: async () => new Response('ok'),
      });
      process.stdout.write(response.status + ':' + await response.text());
    `], { encoding: 'utf8', timeout: 5000, env: { ...process.env, ENVIRONMENT_NAME: configured } })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, '200:ok')
    assertFallback(result.stderr, 'real-stderr-fixture', expected)
  })
}

test('fallback bypasses a completely broken serializer and uses only validated correlation IDs', async t => {
  const writes = []
  t.mock.method(fs, 'writeSync', (fd, line) => writes.push({ fd, line }))
  syncBuiltinESMExports()
  t.mock.method(JSON, 'stringify', () => { throw new Error(canary) })
  try {
    for (const suppliedId of ['safe._:-123', 'unsafe"id', 'x'.repeat(129), '']) {
      const response = await proxyStellinaRequest(new Request(`https://stellina.example${route}`, {
        headers: { [idHeader]: suppliedId },
      }), route, { logLevel: 'INFO', fetchImpl: async () => new Response('ok', { status: 201 }) })
      assert.equal(response.status, 201)
      assert.equal(await response.text(), 'ok')
      const returnedId = response.headers.get(idHeader)
      if (suppliedId === 'safe._:-123') assert.equal(returnedId, suppliedId)
      else assert.match(returnedId, /^[0-9a-f-]{36}$/)
      assertFallback(writes.at(-1).line, returnedId)
    }
    assert.equal(writes.length, 4)
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  }
})

test('fallback construction failure preserves success and gateway responses', async t => {
  const writes = []
  t.mock.method(fs, 'writeSync', (...args) => writes.push(args))
  syncBuiltinESMExports()
  t.mock.method(Date.prototype, 'toISOString', () => { throw new Error(canary) })
  try {
    for (const fails of [false, true]) {
      const response = await proxyStellinaRequest(new Request(`https://stellina.example${route}`, {
        headers: { [idHeader]: 'construction-fixture' },
      }), route, {
        logLevel: 'DEBUG', fetchImpl: async () => {
          if (fails) throw new Error(canary)
          return new Response('ok', { status: 201 })
        },
      })
      assert.equal(response.status, fails ? 502 : 201)
      if (fails) assert.deepEqual(await response.json(), { detail: {
        code: 'upstream_unavailable', message: 'Stellina could not reach the data service.', correlation_id: 'construction-fixture',
      } })
      else assert.equal(await response.text(), 'ok')
    }
    assert.deepEqual(writes, [])
  } finally {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  }
})
