import test from 'node:test'
import assert from 'node:assert/strict'
import axios, { AxiosError, CanceledError } from 'axios'

let reply = { status: 200, data: '{}' }
let calls = []
const store = new Map()
globalThis.localStorage = { getItem: key => store.get(key) ?? null, removeItem: key => store.delete(key), setItem: (key, value) => store.set(key, value) }
globalThis.window = { location: { href: '/dashboard' } }
axios.defaults.adapter = async config => {
  calls.push(config)
  if (reply.throw) throw reply.throw
  const response = { status: reply.status, data: reply.data, statusText: '', headers: reply.headers || {}, config }
  if (reply.status >= 400) throw new AxiosError('Raw adapter failure', 'ERR_BAD_REQUEST', config, null, response)
  return response
}
const { createApiClient, getApiErrorMessage, publicApiClient } = await import('../src/services/http.ts')
const { apiClient } = await import('../src/services/api.ts')
const { commissionApi } = await import('../src/services/commissionApi.ts')
const { cventTrackerApi } = await import('../src/services/cventTrackerApi.ts')
const { rfpApi, publicHotelApi } = await import('../src/services/rfpApi.ts')
const { siteSelectionApi, publicSiteSelectionApi } = await import('../src/services/siteSelectionApi.ts')
const { nimbleApi } = await import('../src/services/nimbleApi.ts')
const header = 'x-stellina-request-id'

test.beforeEach(() => {
  reply = { status: 200, data: '{}' }
  calls = []
  store.clear()
  globalThis.window.location.href = '/dashboard'
})

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
  assert.equal(await apiClient.downloadSqliteBackup(), blob)
  assert.equal(calls.at(-1).responseType, 'blob')
})

test('all private clients use same-origin paths and preserve bearer tokens', async () => {
  store.set('access_token', 'private-token')
  const methods = [() => apiClient.healthCheck(), () => commissionApi.projections({ statuses: ['definite', 'prospect'] }),
    () => cventTrackerApi.listAll(), () => rfpApi.listRFPs(), () => siteSelectionApi.listForms(), () => nimbleApi.listDeals()]
  for (const method of methods) {
    await method()
    assert.equal(calls.at(-1).baseURL, '/api/v1/stellina')
    assert.equal(calls.at(-1).headers.Authorization, 'Bearer private-token')
  }
  assert.match(calls[1].url, /statuses=definite&statuses=prospect/)
})

test('public forms never gain bearer auth or 401 login redirects', async () => {
  store.set('access_token', 'private-token')
  for (const method of [() => publicSiteSelectionApi.getForm('public-guid'), () => publicHotelApi.getRFPByGuid('public-guid')]) {
    await method()
    assert.match(calls.at(-1).url, /^\/api\/v1\/stellina\//)
    assert.equal(calls.at(-1).headers.Authorization, undefined)
  }
  reply = { status: 401, data: '{}' }
  await assert.rejects(publicApiClient.get('/api/v1/stellina/public'))
  assert.equal(globalThis.window.location.href, '/dashboard')
  assert.equal(store.get('access_token'), 'private-token')
})

test('shared OAuth payload, logout/auth paths and established 401 redirect are preserved', async () => {
  store.set('access_token', 'private-token')
  store.set('user', '{}')
  await apiClient.googleAuth('code-example', 'https://stellina.example/auth/callback')
  assert.equal(calls[0].baseURL, '/api/v1/core')
  assert.equal(calls[0].url, '/auth/google')
  assert.deepEqual(JSON.parse(calls[0].data), { code: 'code-example', redirect_uri: 'https://stellina.example/auth/callback', site_id: 'test-site' })
  await apiClient.logout()
  assert.equal(calls.at(-1).url, '/auth/logout')
  reply = { status: 401, data: '<html>private-secret</html>' }
  await assert.rejects(apiClient.getCurrentUser())
  assert.equal(calls.at(-1).baseURL, '/api/v1/core')
  assert.equal(calls.at(-1).url, '/auth/me')
  assert.equal(globalThis.window.location.href, '/login')
  assert.equal(store.has('access_token'), false)
  assert.equal(store.has('user'), false)
})

test('other existing private clients do not gain a 401 redirect', async () => {
  store.set('access_token', 'private-token')
  reply = { status: 401, data: '{}' }
  await assert.rejects(commissionApi.listEvents())
  assert.equal(globalThis.window.location.href, '/dashboard')
  assert.equal(store.get('access_token'), 'private-token')
})

test('multipart uploads preserve FormData, paths and no retry', async () => {
  reply = { status: 200, data: '{}' }
  const file = new File(['test content'], 'example.txt')
  await cventTrackerApi.upload('booking', file)
  await rfpApi.uploadAttachment('rfp', file)
  await publicHotelApi.uploadAttachment('public-guid', file)
  assert.equal(calls.length, 3)
  for (const call of calls) {
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
