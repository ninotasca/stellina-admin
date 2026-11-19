import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodeBrowserSession as decode } from '@ninotasca/web-platform/auth'
import { credentialStore } from '../src/platform/auth/runtime.ts'
const decodeBrowserSession = value => decode(value, 'stellina')
const clearCredential = generation => credentialStore.clear(generation)
const credentialSnapshot = () => credentialStore.snapshot()
const installCredential = (accessToken, csrfToken, expiresAt) => credentialStore.install({ access_token: accessToken, csrf_token: csrfToken, expires_at: expiresAt })

function session(overrides = {}) {
  const now = Date.now()
  return {
    access_token: 'a'.repeat(40), token_type: 'bearer', issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + 120000).toISOString(), expires_in_seconds: 120, csrf_token: 'c'.repeat(32),
    authority: {
      site_key: 'stellina', actor: { id: 'actor', email: 'admin@stellina.example', full_name: 'Admin', avatar_url: null, provider: 'google' },
      roles: ['admin'], permissions: ['stellina:admin'], session_started_at: new Date(now - 1000).toISOString(),
      absolute_expires_at: new Date(now + 3600000).toISOString(), idle_expires_at: new Date(now + 1800000).toISOString(),
    }, ...overrides,
  }
}

test('browser session decoder accepts only short Core tokens with Stellina authority', () => {
  const valid = session()
  assert.deepEqual(decodeBrowserSession(valid), valid)
  for (const candidate of [
    session({ access_token: 'short' }), session({ csrf_token: 'short' }), session({ token_type: 'provider' }),
    session({ expires_in_seconds: 301 }), session({ authority: { ...session().authority, site_key: 'unoventi-admin' } }),
  ]) assert.throws(() => decodeBrowserSession(candidate), /Invalid browser session response/)
})

test('generation guards prevent stale 401s from clearing a newer in-memory credential', () => {
  clearCredential()
  const first = installCredential('first-token', 'c'.repeat(32), '2099-01-01T00:00:00Z')
  const second = installCredential('newer-token', 'd'.repeat(32), '2099-01-01T00:00:00Z')
  assert.equal(clearCredential(first.generation), false)
  assert.equal(credentialSnapshot().accessToken, 'newer-token')
  assert.equal(clearCredential(second.generation), true)
  assert.equal(credentialSnapshot().accessToken, null)
})

test('provider SDK retains only redirect-scoped PKCE state and clears it after exchange', () => {
  const supabase = readFileSync(new URL('../src/platform/auth/supabase.ts', import.meta.url), 'utf8')
  const provider = readFileSync(new URL('../src/platform/auth/AuthProvider.tsx', import.meta.url), 'utf8')
  const transport = readFileSync(new URL('../src/platform/http/index.ts', import.meta.url), 'utf8')
  assert.match(supabase, /persistSession:\s*true/)
  assert.match(supabase, /storage:\s*oauthRedirectStorage/)
  assert.match(supabase, /sessionStorage\.setItem/)
  assert.match(supabase, /signOut\(\{ scope: 'local' \}\)/)
  assert.match(supabase, /autoRefreshToken:\s*false/)
  assert.doesNotMatch(provider + transport, /localStorage/)
  assert.doesNotMatch(provider, /getSession\(/)
})
