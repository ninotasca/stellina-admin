import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import axios, { AxiosError, CanceledError } from 'axios'

let reply = { status: 200, data: '{}' }
let calls = []
const store = new Map()
globalThis.localStorage = { getItem: key => store.get(key) ?? null, removeItem: key => store.delete(key), setItem: (key, value) => store.set(key, value) }
const sessionStore = new Map()
globalThis.sessionStorage = { getItem: key => sessionStore.get(key) ?? null, removeItem: key => sessionStore.delete(key), setItem: (key, value) => sessionStore.set(key, value) }
globalThis.window = Object.assign(new EventTarget(), { location: { href: '/dashboard', pathname: '/dashboard' } })
axios.defaults.adapter = async config => {
  calls.push(config)
  if (reply.throw) throw reply.throw
  const response = { status: reply.status, data: reply.data, statusText: '', headers: reply.headers || {}, config }
  if (reply.status >= 400) throw new AxiosError('Raw adapter failure', 'ERR_BAD_REQUEST', config, null, response)
  return response
}
const { createApiClient, getApiErrorMessage, publicApiClient, coreProtectedApiClient } = await import('../src/platform/http/index.ts')
const { authBackend } = await import('../src/platform/auth/api.ts')
const { credentialStore } = await import('../src/platform/auth/runtime.ts')
const clearCredential = generation => credentialStore.clear(generation)
const credentialSnapshot = () => credentialStore.snapshot()
const installCredential = (accessToken, csrfToken, expiresAt) => credentialStore.install({ access_token: accessToken, csrf_token: csrfToken, expires_at: expiresAt })
const { administrationApi } = await import('../src/features/administration/api.ts')
const { commissionApi } = await import('../src/features/commissions/api.ts')
const { cventTrackerApi } = await import('../src/features/cvent/api.ts')
const { rfpApi, publicHotelApi } = await import('../src/features/rfp/api.ts')
const { siteSelectionApi, publicSiteSelectionApi } = await import('../src/features/site-selection/api.ts')
const { nimbleApi } = await import('../src/features/nimble/api.ts')
const header = 'x-stellina-request-id'

test.beforeEach(() => {
  reply = { status: 200, data: '{}' }
  calls = []
  store.clear()
  sessionStore.clear()
  clearCredential()
  globalThis.window.location.href = '/dashboard'
  globalThis.window.location.pathname = '/dashboard'
})

const authenticate = (token = 'private-token') => installCredential(token, 'c'.repeat(32), '2099-01-01T00:00:00.000Z')

async function failure(client = createApiClient()) {
  return client.get('/example').then(() => assert.fail('expected rejection'), error => error)
}

for (const [label, payload, expected] of [
  ['object', '{"ok":true}', { ok: true }], ['array', '[1,2]', [1, 2]],
  ['string', '"hello"', 'hello'], ['null', 'null', null], ['empty', '', ''], ['number', '123', 123],
]) {
  test(`JSON success retains ${label}`, async () => {
    reply.data = payload
    assert.deepEqual((await createApiClient().get('/example')).data, expected)
  })
}

for (const status of [200, 400, 401, 403, 404, 422, 500, 502, 504]) {
  test(`non-JSON ${status} is safe and carries the header reference`, async () => {
    reply = { status, data: '<html>postgres://password=private-secret</html>', headers: { [header]: 'reference-123' } }
    const error = await failure()
    assert.ok(axios.isAxiosError(error))
    assert.equal(error.response.status, status)
    assert.equal(error.requestId, 'reference-123')
    assert.match(error.message, /Reference: reference-123/)
    assert.equal(error.response.data.detail, error.message)
    assert.equal(getApiErrorMessage(error, 'fallback'), error.message)
    assert.doesNotMatch(error.message, /private-secret|postgres|<html>|Unexpected token/)
    if (status === 200) assert.match(error.message, /unreadable/)
  })
}

test('reference header wins; valid body ID is fallback; malicious IDs never display', async () => {
  for (const [headers, bodyId, expected] of [
    [{ [header]: 'header-id' }, 'body-id', 'header-id'], [{}, 'body-id', 'body-id'],
    [{ [header]: 'unsafe id' }, 'body-id', 'body-id'], [{ [header]: '<script>' }, 'x'.repeat(129), null],
  ]) {
    reply = { status: 500, data: JSON.stringify({ detail: 'SQL private-secret', request_id: bodyId }), headers }
    const error = await failure()
    assert.equal(error.requestId, expected)
    assert.equal(error.message.includes('Reference:'), !!expected)
    assert.doesNotMatch(error.message, /SQL|private-secret|script/)
  }
})

test('only reviewed 4xx details are displayed; arbitrary backend messages and payloads are discarded', async () => {
  for (const status of [400, 403, 500]) {
    reply = { status, data: JSON.stringify({ detail: 'private-secret', message: 'private-secret', stack: 'private-secret' }) }
    const error = await failure()
    assert.doesNotMatch(JSON.stringify(error.response.data), /private-secret/)
  }
  reply = { status: 404, data: '{"detail":"Event not found"}' }
  assert.equal((await failure()).message, 'Event not found')
})

test('ambiguous attachment failures reconcile once before allowing another upload', async () => {
  authenticate()
  for (const [status, code, message] of [
    [502, 'attachment_save_ambiguous', 'Attachment save could not be confirmed. Refresh the attachment list before trying again.'],
    [504, 'attachment_save_timeout', 'Attachment save timed out. Refresh the attachment list before trying again.'],
  ]) {
    reply = {
      status,
      data: JSON.stringify({ detail: { code, message, correlation_id: 'attachment-reference' } }),
    }
    let error
    try {
      await rfpApi.uploadAttachment('rfp-1', new File(['pdf'], 'offer.pdf'))
    } catch (caught) {
      error = caught
    }
    assert.equal(error.attachmentErrorCode, code)
    assert.equal(error.requestId, 'attachment-reference')
    assert.match(error.message, /Refresh the attachment list before trying again/)
    assert.equal(calls.filter(call => call.url === '/rfps/rfp-1/attachments').length, 2)
    assert.doesNotMatch(error.message, /Raw adapter failure/)
    calls = []
  }
})

test('422 retains useful field/type validation without reflected input, context or custom messages', async () => {
  reply = { status: 422, data: JSON.stringify({ detail: [
    { loc: ['query', 'weight_definite'], type: 'less_than_equal', msg: 'private-secret', input: 'private-secret', ctx: { secret: 'private-secret' } },
    { loc: ['body', 'private-secret'], type: 'private-secret', msg: 'private-secret' },
  ] }), headers: { [header]: 'validation-id' } }
  const error = await failure()
  assert.equal(error.response.status, 422)
  assert.equal(error.validationErrors[0].type, 'less_than_equal')
  assert.deepEqual(error.validationErrors[0].loc, ['query', 'weight_definite'])
  assert.match(error.message, /weight_definite.*allowed maximum/)
  assert.match(error.message, /Reference: validation-id/)
  assert.doesNotMatch(JSON.stringify(error.response.data), /private-secret/)
})

test('no-response network errors have safe text and no invented reference or HTTP response', async () => {
  reply.throw = new AxiosError('private-secret', 'ERR_NETWORK')
  const error = await failure()
  assert.equal(error, reply.throw)
  assert.equal(error.response, undefined)
  assert.equal(error.requestId, null)
  assert.match(error.message, /could not reach/)
  assert.doesNotMatch(error.message, /Reference|private-secret/)
})

test('cancellation retains identity/code and AbortSignal remains effective', async () => {
  const canceled = new CanceledError('canceled')
  reply.throw = canceled
  assert.equal(await failure(), canceled)
  assert.ok(axios.isCancel(canceled))
  assert.equal(canceled.requestId, undefined)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(createApiClient().get('/example', { signal: controller.signal }), error => axios.isCancel(error))
})

test('Cvent missing tracker 404 remains null, other failures are raised', async () => {
  reply = { status: 404, data: '<html>not found</html>' }
  assert.equal(await cventTrackerApi.get('booking-123'), null)
  reply.status = 500
  await assert.rejects(cventTrackerApi.get('booking-123'), error => error.response.status === 500)
})

test('successful empty deletes, HEAD and blob downloads retain their values', async () => {
  reply = { status: 204, data: '' }
  assert.equal(await commissionApi.deleteEvent('123'), undefined)
  assert.equal((await createApiClient().head('/example')).data, '')
  const blob = new Blob(['raw sqlite bytes'])
  reply = { status: 200, data: blob }
  assert.equal(await administrationApi.downloadSqliteBackup(), blob)
  assert.equal(calls.at(-1).responseType, 'blob')
})

test('all private clients use same-origin paths and preserve bearer tokens', async () => {
  authenticate()
  await coreProtectedApiClient.get('/health/stellina')
  assert.equal(calls.at(-1).baseURL, '/api/v1/core')
  assert.equal(calls.at(-1).url, '/health/stellina')
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer private-token')
  assert.equal(calls.at(-1).headers['X-Unoventi-Site-Id'], 'stellina')
  assert.match(calls.at(-1).headers['X-Unoventi-Visit-Id'], /^[0-9a-f-]{36}$/)
  assert.match(calls.at(-1).headers['X-Correlation-Id'], /^[0-9a-f-]{36}$/)

  const methods = [() => commissionApi.projections({ statuses: ['definite', 'prospect'] }),
    () => cventTrackerApi.listAll(), () => rfpApi.listRFPs(), () => siteSelectionApi.listForms(), () => nimbleApi.listDeals()]
  for (const method of methods) {
    await method()
    assert.equal(calls.at(-1).baseURL, '/api/v1/stellina')
    assert.equal(calls.at(-1).headers.Authorization, 'Bearer private-token')
    assert.equal(calls.at(-1).headers['X-Unoventi-Site-Id'], 'stellina')
    assert.match(calls.at(-1).headers['X-Correlation-Id'], /^[0-9a-f-]{36}$/)
  }
  assert.match(calls[1].url, /statuses=definite&statuses=prospect/)
})

test('domain reads propagate cancellation and domain mutations retain reviewed endpoints', async () => {
  authenticate()
  const controller = new AbortController()
  const reads = [
    [() => commissionApi.listEvents(controller.signal), '/commissions/events'],
    [() => cventTrackerApi.listAll(controller.signal), '/commissions/cvent-trackers'],
    [() => rfpApi.listRFPs(controller.signal), '/rfps'],
    [() => siteSelectionApi.listForms(undefined, controller.signal), '/site-selection/forms'],
    [() => nimbleApi.listDeals({}, controller.signal), '/nimble/deals'],
    [() => administrationApi.getLoginAttempts(100, undefined, controller.signal), '/auth/login-attempts'],
  ]
  for (const [read, url] of reads) {
    await read()
    assert.equal(calls.at(-1).url, url)
    assert.equal(calls.at(-1).signal, controller.signal)
  }

  const mutations = [
    [() => commissionApi.deleteEvent('event'), '/commissions/events/event', 'delete'],
    [() => cventTrackerApi.reset('event'), '/commissions/event/cvent-tracker', 'delete'],
    [() => rfpApi.deleteRFP('rfp'), '/rfps/rfp', 'delete'],
    [() => siteSelectionApi.deleteForm('form'), '/site-selection/forms/form', 'delete'],
    [() => administrationApi.createAllowedGoogleAccount({ email: 'admin@example.com' }), '/auth/allowed-google-accounts', 'post'],
  ]
  for (const [mutate, url, method] of mutations) {
    await mutate()
    assert.equal(calls.at(-1).url, url)
    assert.equal(calls.at(-1).method, method)
  }
  assert.ok(Object.keys(nimbleApi).every(name => name.startsWith('list')), 'Nimble integration is intentionally read-only')
})

test('public forms never gain bearer auth or 401 login redirects', async () => {
  authenticate()
  for (const method of [() => publicSiteSelectionApi.getForm('public-guid'), () => publicHotelApi.getRFPByGuid('public-guid')]) {
    await method()
    assert.match(calls.at(-1).url, /^\/api\/v1\/stellina\//)
    assert.equal(calls.at(-1).headers.Authorization, undefined)
    assert.equal(calls.at(-1).headers['X-Unoventi-Site-Id'], 'stellina')
    assert.match(calls.at(-1).headers['X-Correlation-Id'], /^[0-9a-f-]{36}$/)
  }
  reply = { status: 401, data: '{}' }
  await assert.rejects(publicApiClient.get('/api/v1/stellina/public'))
  assert.equal(globalThis.window.location.href, '/dashboard')
  assert.equal(credentialSnapshot().accessToken, 'private-token')
})

test('provider proof is used only for Core browser-session exchange and is never installed directly', async () => {
  const now = Date.now(), response = {
    access_token: 'a'.repeat(40), token_type: 'bearer', issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + 120000).toISOString(), expires_in_seconds: 120, csrf_token: 'c'.repeat(32),
    authority: { site_key: 'stellina', actor: { id: 'actor', email: 'admin@stellina.example', full_name: 'Admin', avatar_url: null, provider: 'google' }, roles: ['admin'], permissions: [], session_started_at: new Date(now - 1000).toISOString(), absolute_expires_at: new Date(now + 3600000).toISOString(), idle_expires_at: new Date(now + 1800000).toISOString() },
  }
  const originalFetch = globalThis.fetch, requests = []
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    assert.deepEqual(await authBackend.exchange('raw-provider-proof'), response)
    assert.equal(requests[0].url, '/api/v1/core/auth/browser-session/stellina/exchange')
    assert.equal(new Headers(requests[0].init.headers).get('Authorization'), 'Bearer raw-provider-proof')
    assert.equal(requests[0].init.credentials, 'same-origin')
    assert.equal(credentialSnapshot().accessToken, null)
    await authBackend.logout('c'.repeat(32))
    assert.equal(requests.at(-1).url, '/api/v1/core/auth/browser-session/stellina')
    assert.equal(new Headers(requests.at(-1).init.headers).get('X-CSRF-Token'), 'c'.repeat(32))
  } finally { globalThis.fetch = originalFetch }
})

test('protected 401 emits its credential generation without clearing a newer session or redirecting', async () => {
  const installed = authenticate('older-token')
  let rejectedGeneration = null
  const listener = event => { rejectedGeneration = event.detail.generation }
  globalThis.window.addEventListener('unoventi:auth-rejected', listener, { once: true })
  reply = { status: 401, data: '{}' }
  await assert.rejects(commissionApi.listEvents())
  assert.equal(rejectedGeneration, installed.generation)
  assert.equal(credentialSnapshot().accessToken, 'older-token')
  assert.equal(globalThis.window.location.href, '/dashboard')
})

test('multipart uploads preserve FormData, paths and no retry', async () => {
  reply = { status: 200, data: '{}' }
  const file = new File(['test content'], 'example.txt')
  await cventTrackerApi.upload('booking', file)
  await rfpApi.uploadAttachment('rfp', file)
  await publicHotelApi.uploadAttachment('public-guid', file)
  assert.equal(calls.length, 4)
  const uploads = calls.filter(call => call.method === 'post')
  assert.equal(uploads.length, 3)
  assert.equal(calls.filter(call => call.url === '/rfps/rfp/attachments' && call.method === 'post').length, 1)
  assert.equal(calls.filter(call => call.url === '/rfps/rfp/attachments' && call.method === 'get').length, 1)
  for (const call of uploads) {
    assert.ok(call.data instanceof FormData)
    assert.equal(call.data.get('file').name, 'example.txt')
    assert.match(call.headers['Content-Type'], /multipart\/form-data/)
  }
})


test('upload validation keeps friendly workbook errors while hiding parser and content-type details', async () => {
  for (const detail of ['File must be a .xlsx', 'Empty file', 'Could not read .xlsx: private-secret', "Unsupported content type 'private-secret'."]) {
    reply = { status: 400, data: JSON.stringify({ detail }), headers: { [header]: 'upload-id' } }
    const error = await failure()
    assert.match(error.message, /File must be a \.xlsx|Empty file|Could not read \.xlsx|Unsupported content type/)
    assert.match(error.message, /Reference: upload-id/)
    assert.doesNotMatch(error.message, /private-secret/)
  }
  reply = { status: 413, data: '{"detail":"private-secret"}' }
  assert.match((await failure()).message, /file is too large/)
})


test('history v1 client uses scoped Stellina authority and retains the provider contract', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./contracts/login-history-v1.json', import.meta.url)))
  authenticate('exchanged-stellina-session')
  reply.data = JSON.stringify(fixture.scoped_response)
  const rows = await administrationApi.getLoginAttempts(2)
  assert.deepEqual(rows, fixture.scoped_response)
  // The provider test checks this same versioned schema against its generated model.
  const schema = fixture.response_schema.$defs.LoginAttemptResponse
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [...schema.required].sort())
    for (const [key, property] of Object.entries(schema.properties)) {
      const variants = property.anyOf || [property]
      assert.ok(variants.some(variant => variant.type === (row[key] === null ? 'null' : typeof row[key])))
    }
  }
  assert.equal(calls.length, 1)
  assert.equal(calls[0].baseURL, '/api/v1/stellina')
  assert.equal(calls[0].url, '/auth/login-attempts')
  assert.equal(calls[0].headers.Authorization, 'Bearer exchanged-stellina-session')
  assert.deepEqual(calls[0].params, { limit: 2 })
  assert.ok(rows.every(row => row.site_id === '00000000-0000-0000-0000-000000000001'))
  assert.equal(rows.some(row => row.site_id === '00000000-0000-0000-0000-000000000002'), false)
  calls = []
  const last = rows.at(-1)
  const cursor = `${last.timestamp}|${last.id}`
  await administrationApi.getLoginAttempts(2, cursor)
  assert.deepEqual(calls[0].params, { limit: 2, cursor })
  for (const status of [403, 422, 503]) {
    calls = []
    reply = { status, data: JSON.stringify({code: 'history_unavailable', message: 'Login history unavailable', correlation_id: 'history-ref'}) }
    await assert.rejects(administrationApi.getLoginAttempts(), error => error.response.status === status && error.requestId === 'history-ref')
    assert.equal(calls.length, 1) // no global fallback or retries
    assert.equal(calls[0].baseURL, '/api/v1/stellina')
  }
})


test('canonical history correlation header is bounded and preferred over body references', async () => {
  for (const [reference, expected] of [['header-history-ref', 'header-history-ref'], ['x'.repeat(129), 'body-history-ref']]) {
    reply = { status: 503, headers: { 'x-correlation-id': reference }, data: JSON.stringify({correlation_id: 'body-history-ref'}) }
    await assert.rejects(administrationApi.getLoginAttempts(), error => error.requestId === expected)
  }
})

const cacheContractPath = process.env.UNOVENTI_PRIVATE_RESPONSE_CACHE_CONTRACT
const cacheContract = cacheContractPath ? JSON.parse(readFileSync(cacheContractPath)) : null
test('private-response-cache-v1: real history and browser-session consumers accept no-store', { skip: !cacheContract }, async () => {
  assert.equal(cacheContract.contract, 'private-response-cache-v1')
  authenticate()
  const history = cacheContract.cases.history
  reply = { status: history.status, data: JSON.stringify(history.body), headers: { 'cache-control': history.cache_control } }
  assert.deepEqual(await administrationApi.getLoginAttempts(), history.body)
  assert.equal(calls.at(-1).url, '/auth/login-attempts')
  for (const status of [401, 403, 422, 503]) {
    const sample = cacheContract.cases[status]
    reply = { status, data: JSON.stringify(sample.body), headers: { 'cache-control': sample.cache_control } }
    const before = calls.length
    await assert.rejects(administrationApi.getLoginAttempts(), error => error.response.status === status)
    assert.equal(calls.length, before + 1, 'no retries or fallback')
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json(cacheContract.cases.exchange_stellina.body, { status: cacheContract.cases.exchange_stellina.status, headers: { 'cache-control': cacheContract.cases.exchange_stellina.cache_control } })
  try { assert.deepEqual(await authBackend.exchange('synthetic-proof'), cacheContract.cases.exchange_stellina.body) }
  finally { globalThis.fetch = originalFetch }
})
