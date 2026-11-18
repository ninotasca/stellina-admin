import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveProxyLogLevel, classifyEnvironment } from '../server/stellinaProxy.js'

// Initialize the test Function once under an explicit production configuration.
const originalLevel = process.env.LOG_LEVEL
const originalEnvironment = process.env.ENVIRONMENT_NAME
process.env.ENVIRONMENT_NAME = 'production'
process.env.LOG_LEVEL = 'INFO'
const { proxyStellinaRequest } = await import('../server/stellinaProxy.js?production-instance')
if (originalLevel === undefined) delete process.env.LOG_LEVEL
else process.env.LOG_LEVEL = originalLevel
if (originalEnvironment === undefined) delete process.env.ENVIRONMENT_NAME
else process.env.ENVIRONMENT_NAME = originalEnvironment

const route = '/api/v1/stellina/commissions/projections'
let previousEnvironment
beforeEach(() => {
  previousEnvironment = process.env.VERCEL_ENV
  process.env.VERCEL_ENV = 'production'
})
afterEach(() => {
  if (previousEnvironment === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = previousEnvironment
})
const idHeader = 'x-stellina-request-id'
const request = (init, query = '') => new Request(`https://stellina.example${route}${query}`, init)
function recorder() {
  const entries = []
  const lines = []
  const logger = Object.fromEntries(['info', 'warn', 'error'].map(channel => [channel, line => {
    lines.push(line)
    entries.push({ channel, ...JSON.parse(line) })
  }]))
  return { entries, lines, logger }
}
const options = overrides => ({ logger: recorder().logger, ...overrides })

for (const [outcome, status, event, level, errorType] of [
  ['success', 200, 'completed', 'info'],
  ['client error', 404, 'completed', 'warn'],
  ['server error', 500, 'completed', 'error'],
  ['connection failure', 502, 'failed', 'error', 'UpstreamConnectionError'],
  ['body failure', 502, 'failed', 'error', 'UpstreamConnectionError'],
  ['cancellation', 502, 'failed', 'error', 'RequestCancelled'],
  ['timeout', 504, 'timed_out', 'error', 'UpstreamTimeout'],
]) {
  test(`${outcome} emits single-line JSON with fixed readable messages and preserves proxy context`, async () => {
    const { entries, lines, logger } = recorder()
    const controller = new AbortController()
    if (outcome === 'cancellation') controller.abort()
    const response = await proxyStellinaRequest(request({
      signal: controller.signal, headers: { [idHeader]: 'message-fixture' },
    }), route, {
      logger, logLevel: 'DEBUG', timeoutMs: 10, now: () => 100,
      fetchImpl: async (_, init) => {
        assert.equal(init.headers.get(idHeader), 'message-fixture')
        if (outcome === 'timeout') {
          return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('private timeout')), { once: true }))
        }
        if (outcome === 'connection failure' || outcome === 'cancellation') throw new Error('private failure')
        if (outcome === 'body failure') {
          return new Response(new ReadableStream({ start(stream) { stream.error(new Error('private body')) } }))
        }
        return Response.json({ ok: true }, { status, headers: { 'cache-control': 'private' } })
      },
    })
    assert.equal(response.status, status)
    assert.equal(response.headers.get(idHeader), 'message-fixture')
    assert.equal(response.headers.get('cache-control'), errorType ? 'no-store' : 'private')
    assert.deepEqual(await response.json(), errorType ? {
      detail: outcome === 'timeout' ? 'The Stellina data service took too long to respond.' : 'Stellina could not reach the data service.',
      request_id: 'message-fixture',
    } : { ok: true })
    const expectedMessages = {
      'stellina.proxy.started': 'Stellina proxy request started.',
      'stellina.proxy.completed': 'Stellina proxy request completed.',
      'stellina.proxy.failed': 'Stellina proxy upstream request failed.',
      'stellina.proxy.timed_out': 'Stellina proxy upstream request timed out.',
    }
    assert.deepEqual(entries.map(entry => entry.event), ['stellina.proxy.started', `stellina.proxy.${event}`])
    assert.equal(lines.length, 2)
    for (const line of lines) {
      assert.equal(typeof line, 'string')
      assert.doesNotMatch(line, /[\r\n]/)
      const entry = JSON.parse(line)
      assert.equal(entry.message, expectedMessages[entry.event])
      assert.equal(entry.service, 'stellina-web')
      assert.equal(entry.component, 'api-proxy')
      assert.equal(entry.request_id, 'message-fixture')
      assert.equal(entry.correlation_id, 'message-fixture')
      assert.equal(entry.environment, 'production')
      assert.equal(entry.route, route)
      assert.equal(entry.method, 'GET')
      assert.ok(!Number.isNaN(Date.parse(entry.timestamp)))
    }
    assert.equal(entries[0].level, 'debug')
    assert.equal(entries[0].channel, 'info')
    assert.equal(entries[1].level, level)
    assert.equal(entries[1].channel, level)
    assert.equal(entries[1].status, status)
    assert.equal(entries[1].duration_ms, 0)
    assert.equal(entries[1].error_type, errorType)
  })
}

test('environment classification, precedence and startup rejection', async () => {
  for (const [alias, expected] of [
    ['local', 'development'], ['dev', 'development'], ['development', 'development'], ['test', 'development'],
    ['stage', 'staging'], ['staging', 'staging'], ['preview', 'staging'], ['prod', 'production'], ['production', 'production'],
  ]) assert.equal(classifyEnvironment({ ENVIRONMENT_NAME: alias, VERCEL_ENV: 'production' }), expected)
  assert.equal(classifyEnvironment({ RAILWAY_ENVIRONMENT_NAME: 'preview', NODE_ENV: 'production' }), 'staging')
  assert.equal(classifyEnvironment({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }), 'staging')
  for (const values of [{ ENVIRONMENT_NAME: '' }, { ENVIRONMENT_NAME: 'typo', VERCEL_ENV: 'production' },
    { VERCEL_ENV: 'typo' }, { VERCEL: '1' }, { RAILWAY_SERVICE_ID: 'fixture' }, { RAILWAY_DEPLOYMENT_ID: 'fixture' }]) {
    assert.throws(() => classifyEnvironment(values))
  }
  const saved = { ...process.env }
  try {
    process.env.ENVIRONMENT_NAME = 'private-invalid-fixture'
    process.env.LOG_LEVEL = 'ERROR'
    await assert.rejects(import('../server/stellinaProxy.js?invalid-environment'), /Environment must be/)
  } finally { process.env = saved }
})

test('pinned prior/current release pairs restore filtering and correlation after rejected replacement', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const source = execFileSync('git', ['-C', root, 'show',
    'd8962074d9359fa9caa6948783a23ba35dc35318:frontend/server/stellinaProxy.js'], { encoding: 'utf8' })
  const loadPrior = async (tag) => import('data:text/javascript;base64,' + Buffer.from(source + '\n// ' + tag).toString('base64'))
  const saved = { ...process.env }
  try {
    Object.assign(process.env, { ENVIRONMENT_NAME: 'production', LOG_LEVEL: 'WARN', STELLINA_LOG_LEVEL: 'WARN' })
    const prior = await loadPrior('prior')
    const current = await import('../server/stellinaProxy.js?recovery-current')
    const probe = async artifact => {
      const { entries, logger } = recorder()
      for (const status of [200, 404, 500]) {
        const response = await artifact.proxyStellinaRequest(request({ headers: { [idHeader]: 'recovery-fixture' } }), route, {
          logger, fetchImpl: async (_, init) => {
            assert.equal(init.headers.get(idHeader), 'recovery-fixture')
            return Response.json({}, { status })
          },
        })
        assert.equal(response.status, status)
        assert.equal(response.headers.get(idHeader), 'recovery-fixture')
      }
      assert.deepEqual(entries.map(e => e.level), ['warn', 'error'])
      assert.ok(entries.every(e => e.request_id === 'recovery-fixture'))
    }
    await probe(prior)
    await probe(current)
    process.env.LOG_LEVEL = 'private-invalid-fixture'
    process.env.STELLINA_LOG_LEVEL = 'DEBUG'
    await assert.rejects(import('../server/stellinaProxy.js?rejected-replacement'), /LOG_LEVEL must be/)
    await probe(current)
    Object.assign(process.env, { LOG_LEVEL: 'WARN', STELLINA_LOG_LEVEL: 'WARN' })
    await probe(await loadPrior('restored'))
  } finally { process.env = saved }
})

test('read forwards auth, query and one validated ID; logs completion with safe route and duration', async () => {
  const { entries, logger } = recorder()
  const response = await proxyStellinaRequest(request({ headers: { [idHeader]: 'correlation-123', authorization: 'Bearer test-token' } }, '?statuses=definite&statuses=prospect'), route, {
    logger, fetchImpl: async (url, init) => {
      assert.equal(String(url), `https://api.unoventi.ai${route}?statuses=definite&statuses=prospect`)
      assert.equal(init.headers.get('authorization'), 'Bearer test-token')
      assert.equal(init.headers.get(idHeader), 'correlation-123')
      assert.equal(init.redirect, 'manual')
      assert.equal(init.body, undefined)
      return Response.json({ groups: [] })
    },
  })
  assert.deepEqual(await response.json(), { groups: [] })
  assert.equal(response.headers.get(idHeader), 'correlation-123')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].event, 'stellina.proxy.completed')
  assert.equal(entries[0].request_id, 'correlation-123')
  assert.equal(entries[0].service, 'stellina-web')
  assert.equal(entries[0].status, 200)
  assert.equal(entries[0].route, route)
  assert.ok(entries[0].duration_ms >= 0)
  assert.ok(!Number.isNaN(Date.parse(entries[0].timestamp)))
})

for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  test(`${method} retains body and never retries`, async () => {
    let calls = 0
    const response = await proxyStellinaRequest(request({ method, body: '{"name":"private"}', headers: { 'content-type': 'application/json' } }), route, options({
      fetchImpl: async (url, init) => {
        calls++
        assert.equal(init.method, method)
        assert.equal(await new Response(init.body).text(), '{"name":"private"}')
        return Response.json({ ok: true }, { status: 201 })
      },
    }))
    assert.equal(response.status, 201)
    assert.equal(calls, 1)
  })
}

for (const status of [400, 401, 403, 404, 405, 422, 429, 500]) {
  test(`upstream ${status} retains response and has matching log severity`, async () => {
    const { entries, logger } = recorder()
    const response = await proxyStellinaRequest(request(), route, {
      logger, fetchImpl: async () => new Response('original-body', { status, headers: { 'www-authenticate': 'Bearer', 'retry-after': '60' } }),
    })
    assert.equal(response.status, status)
    assert.equal(await response.text(), 'original-body')
    assert.equal(response.headers.get('www-authenticate'), 'Bearer')
    assert.equal(response.headers.get('retry-after'), '60')
    assert.equal(entries[0].level, status >= 500 ? 'error' : 'warn')
    assert.equal(entries[0].channel, status >= 500 ? 'error' : 'warn')
  })
}

for (const [setting, threshold] of [['DEBUG', 10], ['info', 20], [' wArN ', 30], ['ERROR', 40]]) {
  test(`threshold ${JSON.stringify(setting)} is cumulative and errors remain visible`, async () => {
    for (const [status, severity] of [[200, 20], [404, 30], [500, 40]]) {
      const { entries, logger } = recorder()
      await proxyStellinaRequest(request(), route, { logger, logLevel: setting, fetchImpl: async () => Response.json({}, { status }) })
      assert.equal(entries.filter(e => e.event.endsWith('started')).length, threshold === 10 ? 1 : 0)
      assert.equal(entries.filter(e => e.event.endsWith('completed')).length, severity >= threshold ? 1 : 0)
    }
    for (const timeout of [false, true]) {
      const { entries, logger } = recorder()
      await proxyStellinaRequest(request(), route, { logger, logLevel: setting, timeoutMs: 2,
        fetchImpl: async (_, init) => {
          if (!timeout) throw new Error('failure')
          return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }))
        },
      })
      assert.equal(entries.at(-1).level, 'error')
      assert.equal(entries.at(-1).status, timeout ? 504 : 502)
    }
  })
}

test('initialized Function threshold is immutable', async () => {
  const previous = process.env.LOG_LEVEL
  process.env.LOG_LEVEL = 'ERROR'
  try {
    const { entries, logger } = recorder()
    await proxyStellinaRequest(request(), route, { logger, fetchImpl: async () => Response.json({}) })
    assert.equal(entries.length, 1)
  } finally {
    if (previous === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = previous
  }
})

test('missing defaults follow the server environment and legacy aliases are ignored', () => {
  const previous = process.env.STELLINA_LOG_LEVEL
  process.env.STELLINA_LOG_LEVEL = 'ERROR'
  try {
    for (const [mode, expected] of [['development', 10], ['staging', 20], ['production', 20]]) {
      assert.equal(resolveProxyLogLevel(undefined, mode), expected)
    }
  } finally {
    if (previous === undefined) delete process.env.STELLINA_LOG_LEVEL
    else process.env.STELLINA_LOG_LEVEL = previous
  }
})

test('invalid explicit levels reject before upstream calls and at Function import', async () => {
  for (const raw of ['', 'invalid', 'WARNING', 'toString']) {
    let calls = 0
    await assert.rejects(proxyStellinaRequest(request(), route, { logLevel: raw, fetchImpl: async () => { calls++; return Response.json({}) } }), /LOG_LEVEL must be/)
    assert.equal(calls, 0)
  }
  const previous = process.env.LOG_LEVEL
  process.env.LOG_LEVEL = 'invalid-secret-canary'
  try {
    await assert.rejects(import('../server/stellinaProxy.js?invalid-config'), { message: 'LOG_LEVEL must be DEBUG, INFO, WARN, or ERROR' })
  } finally {
    if (previous === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = previous
  }
})

test('five-second completion uses the warning channel', async () => {
  const { entries, logger } = recorder()
  const ticks = [0, 5000]
  await proxyStellinaRequest(request(), route, { logger, now: () => ticks.shift(), logLevel: 'WARN', fetchImpl: async () => Response.json({}) })
  assert.equal(entries[0].channel, 'warn')
  assert.equal(entries[0].duration_ms, 5000)
})

test('validated references correlate every event with upstream, response and gateway body', async () => {
  const generated = new Set()
  for (const supplied of [undefined, '', 'bad id', 'a'.repeat(129), 'id,duplicate', '<script>', 'A'.repeat(128), 'safe._:-123']) {
    for (const outcome of ['success', 'failure', 'timeout']) {
      const { entries, logger } = recorder()
      let upstreamId
      const response = await proxyStellinaRequest(request({ headers: supplied === undefined ? {} : { [idHeader]: supplied } }), route, {
        logger, logLevel: 'DEBUG', timeoutMs: 2,
        fetchImpl: async (_, init) => {
          upstreamId = init.headers.get(idHeader)
          if (outcome === 'failure') throw new Error('private failure')
          if (outcome === 'timeout') {
            return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('private timeout')), { once: true }))
          }
          return Response.json({})
        },
      })
      if (supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied)) assert.equal(upstreamId, supplied)
      else {
        assert.match(upstreamId, /^[0-9a-f-]{36}$/)
        assert.ok(!generated.has(upstreamId))
        generated.add(upstreamId)
      }
      assert.equal(response.status, outcome === 'success' ? 200 : outcome === 'failure' ? 502 : 504)
      assert.equal(response.headers.get(idHeader), upstreamId)
      if (outcome !== 'success') assert.equal((await response.json()).request_id, upstreamId)
      assert.equal(entries.length, 2)
      for (const entry of entries) {
        assert.equal(entry.correlation_id, upstreamId)
        assert.equal(entry.request_id, upstreamId)
      }
    }
  }
})

test('every event uses the startup-classified environment independently of the log threshold', async () => {
  const saved = { ...process.env }
  try {
    for (const [alias, expected] of [['test', 'development'], ['preview', 'staging'], ['prod', 'production']]) {
      process.env.ENVIRONMENT_NAME = alias
      process.env.LOG_LEVEL = 'DEBUG'
      const artifact = await import(`../server/stellinaProxy.js?envelope-${alias}`)
      // Warm Functions keep the environment and threshold selected together at startup.
      process.env.ENVIRONMENT_NAME = 'private-invalid-runtime-value'
      process.env.LOG_LEVEL = 'ERROR'
      const { entries, logger } = recorder()
      for (const outcome of ['success', 'failure', 'timeout']) {
        await artifact.proxyStellinaRequest(request(), route, {
          logger, timeoutMs: 2,
          fetchImpl: async (_, init) => {
            if (outcome === 'failure') throw new Error('private failure')
            if (outcome === 'timeout') {
              return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('private timeout')), { once: true }))
            }
            return Response.json({})
          },
        })
      }
      assert.deepEqual(entries.map(entry => entry.event), [
        'stellina.proxy.started', 'stellina.proxy.completed',
        'stellina.proxy.started', 'stellina.proxy.failed',
        'stellina.proxy.started', 'stellina.proxy.timed_out',
      ])
      for (const entry of entries) {
        assert.equal(entry.environment, expected)
        assert.equal(typeof entry.message, 'string')
        assert.ok(entry.message.length > 0)
        assert.equal(entry.correlation_id, entry.request_id)
      }
    }
  } finally { process.env = saved }
})

test('DEBUG and gateway errors never disclose exceptions, bodies, tokens, cookies, queries or arbitrary headers', async () => {
  const { entries, logger } = recorder()
  const secret = 'private-secret-marker'
  const response = await proxyStellinaRequest(request({ method: 'POST', body: secret, headers: {
    authorization: `Bearer ${secret}`, cookie: `session=${secret}`, 'x-api-key': secret,
  } }, `?token=${secret}&destination=https://evil.example`), route, { logger, logLevel: 'DEBUG', fetchImpl: async (url, init) => {
    assert.equal(url.origin, 'https://api.unoventi.ai')
    assert.equal(init.headers.get('x-api-key'), null)
    throw new Error(`password=${secret}; postgres://user:${secret}@db; stack ${secret}`)
  } })
  const payload = await response.json()
  assert.equal(response.status, 502)
  assert.equal(payload.request_id, response.headers.get(idHeader))
  assert.equal(entries.at(-1).request_id, payload.request_id)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.ok(!JSON.stringify({ entries, payload }).includes(secret))
  assert.ok(!JSON.stringify(entries).includes('destination'))
})

test('cookies, redirects, caching, CORS and nominated hop headers are handled deliberately', async () => {
  const response = await proxyStellinaRequest(request({ headers: {
    cookie: 'session=example', origin: 'https://stellina.example', authorization: 'Bearer example',
    'if-none-match': 'etag', 'if-modified-since': 'yesterday',
    connection: 'x-remove, pragma', pragma: 'secret', 'x-remove': 'secret', host: 'evil.example',
  } }), route, options({ fetchImpl: async (_, init) => {
    assert.equal(init.headers.get('cookie'), 'session=example')
    assert.equal(init.headers.get('origin'), 'https://stellina.example')
    assert.equal(init.headers.get('if-none-match'), 'etag')
    assert.equal(init.headers.get('if-modified-since'), 'yesterday')
    for (const name of ['connection', 'x-remove', 'pragma', 'host']) assert.equal(init.headers.get(name), null)
    const headers = new Headers({ location: '/login', 'cache-control': 'private, max-age=0', vary: 'Authorization, Origin', etag: 'etag', connection: 'x-remove', 'x-remove': 'secret', 'content-length': '999', 'content-encoding': 'gzip', 'access-control-allow-origin': 'https://stellina.example' })
    headers.append('set-cookie', 'one=a; Path=/; HttpOnly; SameSite=Lax')
    headers.append('set-cookie', 'two=b; Path=/; Secure')
    return new Response(null, { status: 307, headers })
  } }))
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), '/login')
  assert.equal(response.headers.get('cache-control'), 'private, max-age=0')
  assert.equal(response.headers.get('vary'), 'Authorization, Origin')
  assert.equal(response.headers.get('etag'), 'etag')
  assert.equal(response.headers.getSetCookie().length, 2)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://stellina.example')
  for (const name of ['content-length', 'content-encoding', 'connection', 'x-remove']) assert.equal(response.headers.get(name), null)
})

for (const status of [204, 205, 304]) {
  test(`bodyless ${status} is preserved`, async () => {
    const response = await proxyStellinaRequest(request(), route, options({ fetchImpl: async () => new Response(null, { status }) }))
    assert.equal(response.status, status)
    assert.equal(await response.text(), '')
  })
}

test('HEAD has no request or response body; OPTIONS retains upstream semantics', async () => {
  for (const method of ['HEAD', 'OPTIONS']) {
    const response = await proxyStellinaRequest(request({ method }), route, options({ fetchImpl: async (_, init) => {
      assert.equal(init.method, method)
      assert.equal(init.body, method === 'HEAD' ? undefined : null)
      return new Response(null, { status: 405, headers: { allow: 'GET' } })
    } }))
    assert.equal(response.status, 405)
    assert.equal(response.headers.get('allow'), 'GET')
    assert.equal(await response.text(), '')
  }
})

test('broken log sinks do not change success or failures at DEBUG', async () => {
  const broken = () => { throw new Error('sink-private-value') }
  for (const fail of [false, true]) {
    const response = await proxyStellinaRequest(request(), route, { logger: { info: broken, warn: broken, error: broken }, logLevel: 'DEBUG', fetchImpl: async () => {
      if (fail) throw new Error('connection')
      return Response.json({ ok: true })
    } })
    assert.equal(response.status, fail ? 502 : 200)
  }
})

test('localhost: correlation, compressed JSON, connection failure, invalid JSON, timeout after headers and body failure', async () => {
  const received = []
  const server = createServer((req, res) => {
    received.push({ url: req.url, request_id: req.headers[idHeader] })
    res.setHeader('content-type', 'application/json')
    if (req.url.includes('disconnect')) return req.socket.destroy()
    if (req.url.includes('stall')) { res.writeHead(200); res.write('{'); return }
    if (req.url.includes('broken-body')) { res.writeHead(200); res.write('{'); setTimeout(() => req.socket.destroy(), 5); return }
    if (req.url.includes('invalid')) return res.end('<html>private-value</html>')
    if (req.url.includes('failure')) res.statusCode = 500
    const body = gzipSync(JSON.stringify({ request_id: req.headers[idHeader] }))
    res.setHeader('content-encoding', 'gzip')
    res.setHeader('content-length', body.length)
    res.end(body)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    for (const [mode, status] of [['success', 200], ['failure', 500], ['disconnect', 502], ['stall', 504], ['broken-body', 502], ['invalid', 200]]) {
      const { entries, logger } = recorder()
      // Ordinary requests need headroom for fetch startup and concurrent builds.
      // Keep a bounded stalled-body deadline, independently of success latency.
      let receivedHeaders = false
      const response = await proxyStellinaRequest(request({ headers: { [idHeader]: `localhost-${mode}` } }, `?mode=${mode}`), route, {
        logger, upstreamOrigin: origin, timeoutMs: mode === 'stall' ? 1000 : 5000,
        fetchImpl: async (...args) => {
          const upstream = await fetch(...args)
          receivedHeaders = true
          return upstream
        },
      })
      assert.equal(response.status, status, mode)
      if (mode === 'stall') {
        assert.equal(receivedHeaders, true, 'timeout must cover a stalled body after headers')
        assert.equal(entries.at(-1).event, 'stellina.proxy.timed_out')
        assert.equal(entries.at(-1).error_type, 'UpstreamTimeout')
      }
      assert.equal(response.headers.get(idHeader), `localhost-${mode}`)
      assert.equal(entries.at(-1).request_id, received.at(-1).request_id)
      assert.equal(entries.at(-1).status, status)
      if (mode !== 'invalid') assert.equal((await response.json()).request_id, `localhost-${mode}`)
      else assert.equal(await response.text(), '<html>private-value</html>')
      assert.equal(response.headers.get('content-encoding'), null)
      assert.equal(response.headers.get('content-length'), null)
    }
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
