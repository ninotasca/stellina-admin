import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createViteServer } from 'vite'
import health from '../api/v1/stellina/health.js'
import projections from '../api/v1/stellina/commissions/projections.js'
import { proxyStellinaRequest } from '../server/stellinaProxy.js'
import { createApiClient, getApiErrorMessage } from '../src/services/http.ts'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const selected = ['/api/v1/stellina/health', '/api/v1/stellina/commissions/projections']

test('only two exact Function entries precede Stellina/core forwarding and existing SPA fallback', () => {
  assert.deepEqual(config.rewrites.slice(0, 2), selected.map(path => ({ source: path, destination: path })))
  assert.deepEqual(Object.keys(config.functions).sort(), selected.map(path => `${path.slice(1)}.js`).sort())
  assert.ok(Object.values(config.functions).every(value => value.maxDuration > 15))
  assert.deepEqual(config.rewrites.slice(2), [
    { source: '/api/v1/stellina/:path*', destination: 'https://api.unoventi.ai/api/v1/stellina/:path*' },
    { source: '/api/v1/core/:path*', destination: 'https://api.unoventi.ai/api/v1/core/:path*' },
    { source: '/(.*)', destination: '/index.html' },
  ])
  assert.deepEqual(readdirSync(new URL('../api', import.meta.url), { recursive: true }).filter(p => p.endsWith('.js')).sort(), selected.map(p => p.slice(5) + '.js').sort())
})

test('deployed entries target fixed reviewed paths; browser host/path/parameters cannot choose upstream', async t => {
  t.mock.method(console, 'info', () => {})
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url.origin, 'https://api.unoventi.ai')
    assert.ok(selected.includes(url.pathname))
    assert.equal(init.headers.get('authorization'), 'Bearer preserved')
    return Response.json({ path: url.pathname })
  })
  for (const [entry, path] of [[health, selected[0]], [projections, selected[1]]]) {
    const response = await entry.fetch(new Request('https://evil.example/api/v1/bpl?upstream=https://evil.example', { headers: { authorization: 'Bearer preserved' } }))
    assert.equal((await response.json()).path, path)
  }
})

test('Vite forwards only Stellina/core; SPA callback, large uploads, redirects and cache validators survive', async () => {
  const requests = []
  const upstream = createHttpServer(async (req, res) => {
    let bytes = 0
    for await (const chunk of req) bytes += chunk.length
    requests.push({ url: req.url, method: req.method, bytes, headers: req.headers })
    if (req.url.includes('redirect')) { res.writeHead(307, { location: '/auth/callback?code=example' }); res.end(); return }
    if (req.headers['if-none-match']) { res.writeHead(304, { etag: 'test-etag', 'cache-control': 'private, max-age=0' }); res.end(); return }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ url: req.url, bytes }))
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const previous = process.env.STELLINA_API_PROXY_TARGET
  process.env.STELLINA_API_PROXY_TARGET = `http://127.0.0.1:${upstream.address().port}`
  let vite
  try {
    vite = await createViteServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname,
      logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    await vite.listen()
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
    const paths = [
      '/api/v1/stellina/health', '/api/v1/stellina/commissions/projections?grouping=quarter',
      '/api/v1/core/auth/me', '/api/v1/core/backups/stellina/sqlite',
      '/api/v1/stellina/nimble/deals', '/api/v1/stellina/hotel-invitations/public/guid/rfp',
      '/api/v1/stellina/site-selection/public/guid',
      '/api/v1/stellina/commissions/booking/cvent-tracker/merge-jobs/job',
    ]
    for (const path of paths) {
      const response = await fetch(origin + path, { headers: { authorization: 'Bearer example', cookie: 'session=example' } })
      assert.equal((await response.json()).url, path)
      assert.equal(requests.at(-1).headers.authorization, 'Bearer example')
      assert.equal(requests.at(-1).headers.cookie, 'session=example')
    }
    const before = requests.length
    for (const path of ['/auth/callback?code=example', '/commissions', '/api/v1/stellina-other/health', '/api/v1/bpl/health']) {
      const response = await fetch(origin + path)
      assert.match(response.headers.get('content-type'), /text\/html/)
    }
    assert.equal(requests.length, before)
    const upload = await fetch(`${origin}/api/v1/stellina/commissions/booking/cvent-tracker/uploads`, { method: 'POST', body: Buffer.alloc(4_800_000, 'x'), headers: { 'content-type': 'application/octet-stream' } })
    assert.equal((await upload.json()).bytes, 4_800_000)
    const redirect = await fetch(`${origin}/api/v1/stellina/rfps/attachments/redirect`, { redirect: 'manual' })
    assert.equal(redirect.status, 307)
    assert.equal(redirect.headers.get('location'), '/auth/callback?code=example')
    const cached = await fetch(`${origin}/api/v1/stellina/health`, { headers: { 'if-none-match': 'test-etag' } })
    assert.equal(cached.status, 304)
    assert.equal(cached.headers.get('etag'), 'test-etag')
    assert.equal(cached.headers.get('cache-control'), 'private, max-age=0')
  } finally {
    await vite?.close()
    upstream.closeAllConnections()
    await new Promise(resolve => upstream.close(resolve))
    if (previous === undefined) delete process.env.STELLINA_API_PROXY_TARGET
    else process.env.STELLINA_API_PROXY_TARGET = previous
  }
})

test('real browser client, proxy, and mock upstream share one reference on failure', async () => {
  const backendRecords = []
  const proxyRecords = []
  const upstream = createHttpServer((req, res) => {
    backendRecords.push({ request_id: req.headers['x-stellina-request-id'] })
    res.writeHead(500, { 'content-type': 'text/html' })
    res.end('<html>private-database-error</html>')
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const proxy = createHttpServer(async (req, res) => {
    const response = await proxyStellinaRequest(new Request(`http://localhost${req.url}`), selected[0], {
      upstreamOrigin: `http://127.0.0.1:${upstream.address().port}`,
      logger: { error: line => proxyRecords.push(JSON.parse(line)) },
    })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve))
  try {
    const client = createApiClient({ baseURL: `http://127.0.0.1:${proxy.address().port}`, proxy: false })
    await assert.rejects(client.get(selected[0]), error => {
      const id = backendRecords[0].request_id
      assert.equal(proxyRecords[0].request_id, id)
      assert.equal(error.response.headers['x-stellina-request-id'], id)
      assert.equal(error.requestId, id)
      assert.ok(getApiErrorMessage(error, 'fallback').endsWith(`Reference: ${id}`))
      assert.doesNotMatch(error.message, /private-database-error/)
      return true
    })
  } finally {
    for (const server of [proxy, upstream]) {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  }
})
