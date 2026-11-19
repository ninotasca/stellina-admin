import { createElement, StrictMode, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from '../src/platform/auth/AuthProvider'
import { useAuth, type AuthContextValue } from '../src/platform/auth/auth-context'
import { ProtectedRoute } from '../src/features/authentication'
import { credentialStore } from '../src/platform/auth/runtime'
import { PlatformError } from '@ninotasca/web-platform/errors'

const policy = { site_key: 'stellina', site_uuid: null, enabled: true, providers: ['google'], registration: 'closed', password_reset: false, magic_login: false, session_max_age_minutes: 720, session_inactivity_minutes: 180, session_resume_after_minutes: 120 }
type Failure = Error & { status: number }
const failure = (status: number, message: string) => new PlatformError(message, { status }) as Failure
const clearCredential = () => credentialStore.clear()
const credentialSnapshot = () => credentialStore.snapshot()
const installCredential = (accessToken: string, csrfToken: string, expiresAt: string) => credentialStore.install({ access_token: accessToken.padEnd(32, 'x'), csrf_token: csrfToken.padEnd(32, 'x'), expires_at: expiresAt } as Parameters<typeof credentialStore.install>[0])
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
async function settle() { for (let i = 0; i < 14; i++) await tick() }
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function session(label = 'core-token') {
  return { access_token: label.padEnd(32, 'x'), token_type: 'bearer', issued_at: '2026-11-18T20:00:00Z', expires_at: '2099-11-18T21:00:00Z', expires_in_seconds: 120, csrf_token: `csrf-${label}`.padEnd(32, 'x'),
    authority: { site_key: 'stellina', actor: { id: 'operator', email: 'operator@stellina.example', full_name: 'Operator', avatar_url: null, provider: 'google' }, roles: ['admin'], permissions: ['stellina:admin'], session_started_at: '2026-11-18T20:00:00Z', absolute_expires_at: '2099-11-18T22:00:00Z', idle_expires_at: '2099-11-18T21:30:00Z' } }
}
function fixture() {
  const f = { policy: policy as unknown, restoreResult: session(), exchangeResult: session('exchanged-token'), refreshResult: session('refreshed-token'), restoreError: null as unknown, refreshError: null as unknown,
    restoreCount: 0, exchangeCount: 0, refreshCount: 0, logoutCount: 0, providerCallback: null as null | ((event: string, session: unknown) => void), logs: [] as unknown[],
    async fetchPolicy() { return f.policy }, async restore() { f.restoreCount++; if (f.restoreError) throw f.restoreError; return f.restoreResult },
    async exchange() { f.exchangeCount++; return f.exchangeResult }, async refreshSession() { f.refreshCount++; if (f.refreshError) throw f.refreshError; return f.refreshResult },
    async logout() { f.logoutCount++ }, async magicLogin() { return { access_token: 'magic' } } }
  return f
}
class FakeBroadcastChannel { private listener: ((event: MessageEvent) => void) | null = null; postMessage() {}; close() {}; addEventListener(_name: string, listener: (event: MessageEvent) => void) { this.listener = listener } }
async function mount(f: ReturnType<typeof fixture>) {
  Object.assign(window, { __authHarness: f, BroadcastChannel: FakeBroadcastChannel })
  const host = document.getElementById('root')!, root = createRoot(host)
  let auth!: AuthContextValue, navigate!: ReturnType<typeof useNavigate>
  function Probe() {
    const value = useAuth(), nav = useNavigate()
    useLayoutEffect(() => { auth = value; navigate = nav }, [nav, value])
    return <Routes><Route path="/login" element={<div id="login">Login</div>} /><Route path="*" element={<ProtectedRoute requireAdmin><div id="protected">Protected</div></ProtectedRoute>} /></Routes>
  }
  flushSync(() => root.render(<StrictMode>{createElement(MemoryRouter, { initialEntries: ['/dashboard'] }, <AuthProvider><Probe /></AuthProvider>)}</StrictMode>))
  await settle()
  return { get auth() { return auth }, go(path: string) { flushSync(() => navigate(path)) }, close() { flushSync(() => root.unmount()) } }
}

async function run() {
  clearCredential(); localStorage.clear(); sessionStorage.clear()
  const primaryFixture = fixture(), primary = await mount(primaryFixture)
  check(primaryFixture.restoreCount === 1 && primary.auth.status === 'authenticated', 'new tab did not restore exactly once')
  for (let i = 0; i < 12; i++) { primary.go(`/route-${i}`); await settle() }
  check(primaryFixture.restoreCount === 1, 'route changes repeated restore')
  primary.close()

  clearCredential(); const callbackFixture = fixture(); callbackFixture.restoreError = failure(401, 'no cookie')
  const callback = await mount(callbackFixture)
  check(callback.auth.status === 'anonymous', 'missing cookie was not anonymous')
  callbackFixture.providerCallback?.('SIGNED_IN', { access_token: 'raw-provider-secret' }); await settle()
  check(callbackFixture.exchangeCount === 1 && callback.auth.status === 'authenticated', 'provider session not exchanged')
  check(credentialSnapshot().accessToken === 'exchanged-token'.padEnd(32, 'x'), 'Core token not installed in memory')
  callback.close()

  clearCredential(); const outageFixture = fixture(); outageFixture.restoreError = failure(503, 'offline')
  const outage = await mount(outageFixture); await new Promise(resolve => setTimeout(resolve, 120)); await settle()
  check(outageFixture.restoreCount === 2 && outage.auth.status === 'unavailable', 'dependency outage was not distinct unavailable state')
  check(!document.getElementById('login'), 'outage flashed login')
  outage.close()

  clearCredential(); const forbiddenFixture = fixture(); const forbidden = await mount(forbiddenFixture)
  forbiddenFixture.refreshError = failure(403, 'forbidden')
  window.dispatchEvent(new CustomEvent('unoventi:auth-rejected', { detail: { generation: credentialSnapshot().generation } })); await settle()
  check(forbidden.auth.status === 'forbidden' && credentialSnapshot().accessToken !== null, '403 destroyed or hid forbidden session')
  forbidden.close()

  clearCredential(); const generationFixture = fixture(); const generation = await mount(generationFixture)
  const stale = credentialSnapshot().generation
  installCredential('newer-token', 'newer-csrf', '2099-01-01T00:00:00Z')
  window.dispatchEvent(new CustomEvent('unoventi:auth-rejected', { detail: { generation: stale } })); await settle()
  check(generationFixture.refreshCount === 0 && credentialSnapshot().accessToken === 'newer-token'.padEnd(32, 'x'), 'stale 401 invalidated newer session')
  generationFixture.refreshError = failure(401, 'expired')
  window.dispatchEvent(new CustomEvent('unoventi:auth-rejected', { detail: { generation: credentialSnapshot().generation } })); await settle()
  check(generationFixture.refreshCount === 1 && generation.auth.status === 'anonymous' && credentialSnapshot().accessToken === null, 'current 401 did not terminate once')
  generation.close()

  clearCredential(); const disabledFixture = fixture(); disabledFixture.policy = { ...policy, enabled: false, providers: [] }
  const disabled = await mount(disabledFixture)
  check(disabled.auth.status === 'disabled', 'disabled policy did not produce a distinct state')
  check(!disabled.auth.isAuthenticated && !disabled.auth.isAdmin, 'disabled policy granted authenticated or admin authority')
  check(!document.getElementById('protected') && Boolean(document.querySelector('[data-auth-state="disabled"]')), 'disabled policy exposed protected content')
  disabled.close()

  clearCredential(); const logoutFixture = fixture(); const logout = await mount(logoutFixture)
  await logout.auth.signOut(); await settle()
  check(logoutFixture.logoutCount === 1 && logout.auth.status === 'anonymous' && credentialSnapshot().accessToken === null, 'logout did not clear both layers')
  logout.close()

  const persisted = `${JSON.stringify(localStorage)} ${JSON.stringify(sessionStorage)} ${location.href} ${JSON.stringify(callbackFixture.logs)}`
  for (const secret of ['raw-provider-secret', 'exchanged-token', 'newer-token', 'csrf-exchanged-token']) check(!persisted.includes(secret), `credential leaked: ${secret}`)
}

run().then(() => { document.getElementById('result')!.textContent = 'PASS: restore once; route continuity; exchange; state distinctions; generation safety; logout; no persistence' }, error => { document.getElementById('result')!.textContent = `FAIL: ${error.stack || error}` })
