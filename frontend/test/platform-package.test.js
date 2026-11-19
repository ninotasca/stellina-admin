import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createCredentialStore, decodeAuthPolicy } from '@ninotasca/web-platform/auth'
import { createPublicHttpClient } from '@ninotasca/web-platform/http'
import { createRemoteResource } from '@ninotasca/web-platform/state'

test('Stellina resolves and composes the immutable stable platform release', async () => {
  const expectedVersion = process.env.EXPECTED_WEB_PLATFORM_VERSION ?? '0.1.0'
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const installed = lock.packages['node_modules/@ninotasca/web-platform']
  assert.equal(installed.version, expectedVersion)
  assert.match(installed.resolved, new RegExp(`^https://npm\\.pkg\\.github\\.com/download/@ninotasca/web-platform/${expectedVersion.replaceAll('.', '\\.')}\\/`))
  const policy = { site_key: 'stellina', site_uuid: null, enabled: true, providers: ['google'], registration: 'closed', password_reset: false, magic_login: false, session_max_age_minutes: 720, session_inactivity_minutes: 180, session_resume_after_minutes: 120 }
  assert.equal(decodeAuthPolicy(policy, 'stellina').site_key, 'stellina')
  assert.equal(createCredentialStore().snapshot().generation, 0)
  const client = createPublicHttpClient({ baseUrl: '/api/v1', siteId: 'stellina', getVisitId: () => 'consumer-fixture',
    fetch: async () => new Response(JSON.stringify({ ok: true })) })
  assert.deepEqual(await client.request('/core/probe'), { ok: true })
  const resource = createRemoteResource({ load: async () => 'ready' }); await resource.refetch()
  assert.equal(resource.snapshot().status, 'ready'); resource.destroy()
})
