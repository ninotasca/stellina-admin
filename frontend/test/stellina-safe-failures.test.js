import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import axios, { AxiosError } from 'axios'

// This generated v1 snapshot is also checked against server OpenAPI and runtime
// by unoventi-api/tests/test_stellina_safe_failures.py.
const contractUrl = new URL('./contracts/stellina-safe-failures.v1.json', import.meta.url)
const contract = JSON.parse(readFileSync(contractUrl, 'utf8'))
let reply
let calls = []
const store = new Map([['access_token', 'synthetic-session']])
globalThis.localStorage = { getItem: key => store.get(key) ?? null }
globalThis.window = { location: { href: '/commissions/booking' } }
axios.defaults.adapter = async config => {
  calls.push(config)
  const response = { ...reply, statusText: '', config }
  if (response.status >= 400) throw new AxiosError('Adapter failure', 'ERR_BAD_RESPONSE', config, null, response)
  return response
}
const { cventTrackerApi } = await import('../src/services/cventTrackerApi.ts')
const { createApiClient, getApiErrorMessage } = await import('../src/services/http.ts')
const safeMessage = 'The Stellina data service is unavailable. Please try again.'

test('consumer uses the same versioned schema as the API', () => {
  assert.equal(contract.contract_version, 'stellina-safe-failures.v1')
  const serverUrl = new URL('../../../unoventi-api/docs/contracts/stellina-safe-failures.v1.json', import.meta.url)
  if (existsSync(serverUrl)) assert.equal(readFileSync(contractUrl, 'utf8'), readFileSync(serverUrl, 'utf8'))
})

for (const operation of contract.operations) {
  for (const body of operation.examples) {
    test(`v1 ${operation.status} structured failure is renderable (correlation: ${!!body.detail.correlation_id})`, async () => {
      calls = []
      reply = { status: operation.status, data: JSON.stringify(body), headers: { 'x-correlation-id': body.detail.correlation_id } }
      const request = operation.status === 502
        ? () => cventTrackerApi.upload('booking', new File(['synthetic'], 'comparison.xlsx'))
        // The legacy Stellina auth route is unmounted; exercise its contract
        // through the shared normalizer without redirecting current Core auth.
        : () => createApiClient().post(operation.path, {})
      await assert.rejects(request(), error => {
        assert.ok(axios.isAxiosError(error))
        assert.equal(error.response.status, operation.status)
        assert.equal(error.response.data.detail, safeMessage)
        assert.equal(getApiErrorMessage(error, 'Upload failed'), safeMessage)
        assert.equal(typeof error.response.data.detail, 'string')
        assert.equal(error.response.headers['x-correlation-id'], body.detail.correlation_id)
        return true
      })
      assert.equal(calls.length, 1, 'no automatic retry of a potentially partial upload')
      assert.equal(store.get('access_token'), 'synthetic-session')
      assert.equal(globalThis.window.location.href, '/commissions/booking')
    })
  }
}

test('upload failure, explicit recovery and subsequent failure preserve status and multipart workflow', async () => {
  calls = []
  const operation = contract.operations.find(item => item.status === 502)
  const file = new File(['synthetic workbook'], 'comparison.xlsx')
  const tracker = { id: 'tracker', event_id: 'booking', uploads: [], pending_merge_job_id: null }
  for (const status of [502, 200, 502]) {
    reply = { status, data: JSON.stringify(status === 200 ? tracker : operation.examples[1]), headers: {} }
    const before = calls.length
    if (status === 200) assert.deepEqual(await cventTrackerApi.upload('booking', file), tracker)
    else await assert.rejects(cventTrackerApi.upload('booking', file), error => {
      assert.equal(error.response.status, 502)
      assert.equal(getApiErrorMessage(error, 'Upload failed'), safeMessage)
      return true
    })
    assert.equal(calls.length, before + 1)
    const call = calls.at(-1)
    assert.equal(call.baseURL, '/api/v1/stellina')
    assert.equal(call.url, '/commissions/booking/cvent-tracker/uploads')
    assert.equal(call.method, 'post')
    assert.equal(call.headers.Authorization, 'Bearer synthetic-session')
    assert.ok(call.data instanceof FormData)
    assert.equal(call.data.get('file').name, 'comparison.xlsx')
  }
})
