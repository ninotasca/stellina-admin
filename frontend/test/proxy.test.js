import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { gzipSync } from 'node:zlib'
import { proxyStellinaRequest } from '../server/stellinaProxy.js'

const route = '/api/v1/stellina/commissions/projections'
const idHeader = 'x-stellina-request-id'
const request = (init, query = '') => new Request(`https://stellina.example${route}${query}`, init)
function recorder() {
  const entries = []
  const logger = Object.fromEntries(['info', 'warn', 'error'].map(channel => [channel, line => entries.push({ channel, ...JSON.parse(line) })]))
  return { entries, logger }
}
const options = overrides => ({ logger: recorder().logger, ...overrides })

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

for (const [setting, threshold] of [['DEBUG', 10], ['info', 20], [' wArN ', 30], ['ERROR', 40], ['invalid', 20], ['toString', 20], ['', 20]]) {
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

test('default setting uses STELLINA_LOG_LEVEL without configuring other sites', async () => {
  const previous = process.env.STELLINA_LOG_LEVEL
  process.env.STELLINA_LOG_LEVEL = 'ERROR'
  try {
    const { entries, logger } = recorder()
    await proxyStellinaRequest(request(), route, { logger, fetchImpl: async () => Response.json({}) })
    assert.equal(entries.length, 0)
  } finally {
    if (previous === undefined) delete process.env.STELLINA_LOG_LEVEL
    else process.env.STELLINA_LOG_LEVEL = previous
  }
})

test('five-second completion uses the warning channel', async () => {
  const { entries, logger } = recorder()
  const ticks = [0, 5000]
  await proxyStellinaRequest(request(), route, { logger, now: () => ticks.shift(), logLevel: 'WARN', fetchImpl: async () => Response.json({}) })
  assert.equal(entries[0].channel, 'warn')
  assert.equal(entries[0].duration_ms, 5000)
})

test('invalid, oversized and missing IDs are replaced; valid IDs survive', async () => {
  const generated = new Set()
  for (const supplied of ['', 'bad id', 'a'.repeat(129), 'id,duplicate', '<script>']) {
    let upstreamId
    const response = await proxyStellinaRequest(request({ headers: { [idHeader]: supplied } }), route, options({ fetchImpl: async (_, init) => {
      upstreamId = init.headers.get(idHeader)
      return Response.json({})
    } }))
    assert.match(upstreamId, /^[0-9a-f-]{36}$/)
    assert.equal(response.headers.get(idHeader), upstreamId)
    generated.add(upstreamId)
  }
  assert.equal(generated.size, 5)
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
      const response = await proxyStellinaRequest(request({ headers: { [idHeader]: `localhost-${mode}` } }, `?mode=${mode}`), route, { logger, upstreamOrigin: origin, timeoutMs: 100 })
      assert.equal(response.status, status, mode)
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
