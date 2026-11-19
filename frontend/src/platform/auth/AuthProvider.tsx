import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { authConfig } from './config'
import {
  browserSessionContext, exchangeBrowserSession, fetchAuthPolicy, logoutBrowserSession,
  refreshBrowserSession, requestMagicLogin, restoreBrowserSession,
} from './api'
import { clearCredential, credentialSnapshot, installCredential } from './credential-store'
import { sessionToken, supabase } from './supabase'
import type { AuthSessionContext, AuthStatus, BrowserSessionResponse, PublicAuthConfig, User } from '../../domain/auth'
import { AuthContext } from './auth-context'
import { parseAuthPolicy } from './policy'
import { clientLog, diagnosticError, type DiagnosticError } from '../diagnostics/index'

const AUTH_CHANNEL = 'unoventi-auth-lifecycle-v1'
const TRANSIENT_RESTORE_RETRY_MS = 90
const defaultPolicy: PublicAuthConfig = {
  site_key: authConfig.siteId, site_uuid: null, enabled: true, providers: [], registration: 'closed',
  password_reset: false, magic_login: false, session_max_age_minutes: 720,
  session_inactivity_minutes: 180, session_resume_after_minutes: 120,
}
function errorStatus(error: unknown): number {
  try { return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 0 }
  catch { return 0 }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [context, setContext] = useState<AuthSessionContext | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<DiagnosticError | null>(null)
  const [policy, setPolicy] = useState<PublicAuthConfig>(defaultPolicy)
  const [policyLoading, setPolicyLoading] = useState(true)
  const attempt = useRef(0)
  const policyValid = useRef(false)
  const restoreFlight = useRef<Promise<BrowserSessionResponse> | null>(null)
  const refreshFlight = useRef<Promise<BrowserSessionResponse> | null>(null)
  const pendingProviderSession = useRef<Session | null>(null)
  const channel = useRef<BroadcastChannel | null>(null)

  const announce = useCallback((type: 'generation' | 'logout', generation: number) => channel.current?.postMessage({ type, generation }), [])
  const acceptBrowserSession = useCallback((result: BrowserSessionResponse, expectedAttempt: number, broadcast: boolean) => {
    if (expectedAttempt !== attempt.current) return false
    if (result.authority.site_key !== authConfig.siteId) throw new Error('Browser session scope mismatch')
    const installed = installCredential(result.access_token, result.csrf_token, result.expires_at)
    setContext(browserSessionContext(result)); setFailure(null); setMessage(null); setStatus('authenticated')
    if (broadcast) announce('generation', installed.generation)
    return true
  }, [announce])
  const failSession = useCallback((error: unknown, expectedAttempt: number, fallback: string, clearRejected: boolean) => {
    if (expectedAttempt !== attempt.current) return
    const nextFailure = diagnosticError(error, fallback), statusCode = errorStatus(error)
    if (statusCode === 401 && clearRejected) clearCredential()
    setContext(null); setFailure(nextFailure); setMessage(nextFailure.message)
    setStatus(statusCode === 401 ? 'anonymous' : statusCode === 403 ? 'forbidden' : 'unavailable')
    clientLog(statusCode >= 500 || statusCode === 0 ? 'error' : 'warn', 'unoventi.auth.session_restore_failed', {
      correlation_id: nextFailure.correlationId ?? undefined, status: nextFailure.status || undefined, error_class: nextFailure.errorClass,
    })
  }, [])
  const startBrowserRestore = useCallback(() => {
    if (!restoreFlight.current) restoreFlight.current = (async () => {
      try { return await restoreBrowserSession() }
      catch (error) {
        const statusCode = errorStatus(error)
        if (statusCode !== 0 && statusCode < 500) throw error
        await new Promise(resolve => window.setTimeout(resolve, TRANSIENT_RESTORE_RETRY_MS))
        return restoreBrowserSession()
      }
    })().finally(() => { restoreFlight.current = null })
    return restoreFlight.current
  }, [])
  const restore = useCallback(async (broadcast = false) => {
    if (!policyValid.current) return
    const expectedAttempt = ++attempt.current
    setStatus('loading'); setFailure(null); setMessage(null); clientLog('info', 'unoventi.auth.session_restore_started')
    try {
      const result = await startBrowserRestore()
      if (acceptBrowserSession(result, expectedAttempt, broadcast)) clientLog('info', 'unoventi.auth.session_restore_succeeded')
    } catch (error) { failSession(error, expectedAttempt, 'We could not restore your session.', true) }
  }, [acceptBrowserSession, failSession, startBrowserRestore])
  const exchangeProviderSession = useCallback(async (session: Session) => {
    if (!policyValid.current) { pendingProviderSession.current = session; return }
    const providerProof = sessionToken(session)
    if (!providerProof) return
    const expectedAttempt = ++attempt.current
    setStatus('authorizing'); setFailure(null); setMessage(null)
    try {
      const result = await exchangeBrowserSession(providerProof)
      if (!acceptBrowserSession(result, expectedAttempt, true)) return
      pendingProviderSession.current = null
      await supabase.auth.signOut({ scope: 'local' })
      clientLog('info', 'unoventi.auth.provider_exchange_succeeded')
    } catch (error) { failSession(error, expectedAttempt, 'We could not confirm access to this application.', true) }
  }, [acceptBrowserSession, failSession])
  const refreshSession = useCallback(async (expectedGeneration?: number, broadcast = true) => {
    const current = credentialSnapshot()
    if (!current.accessToken || !current.csrfToken) return restore(false)
    if (expectedGeneration !== undefined && expectedGeneration !== current.generation) return
    const expectedAttempt = ++attempt.current
    if (!refreshFlight.current) refreshFlight.current = refreshBrowserSession(current.csrfToken).finally(() => { refreshFlight.current = null })
    try { acceptBrowserSession(await refreshFlight.current, expectedAttempt, broadcast) }
    catch (error) { failSession(error, expectedAttempt, 'We could not refresh your session.', errorStatus(error) === 401) }
  }, [acceptBrowserSession, failSession, restore])
  const loadPolicy = useCallback(async (supplied?: { policy: unknown }) => {
    const expectedAttempt = ++attempt.current
    policyValid.current = false; setPolicyLoading(true); setStatus('loading'); setContext(null)
    const pendingRestore = startBrowserRestore().then(result => ({ ok: true as const, result }), error => ({ ok: false as const, error }))
    try {
      const next = parseAuthPolicy(supplied ? supplied.policy : await fetchAuthPolicy(authConfig.siteId), authConfig.siteId)
      if (expectedAttempt !== attempt.current) return
      policyValid.current = true; setPolicy(next); setPolicyLoading(false); setFailure(null); setMessage(null)
      clientLog('info', 'unoventi.auth.policy_loaded', { enabled: next.enabled, provider_count: next.providers.length, max_age_minutes: next.session_max_age_minutes, inactivity_minutes: next.session_inactivity_minutes })
      if (!next.enabled) { clearCredential(); setStatus('disabled'); return }
      const providerSession = pendingProviderSession.current
      if (providerSession) await exchangeProviderSession(providerSession)
      else {
        const restored = await pendingRestore
        if (expectedAttempt !== attempt.current) return
        if (restored.ok) {
          if (acceptBrowserSession(restored.result, expectedAttempt, false)) clientLog('info', 'unoventi.auth.session_restore_succeeded')
        } else failSession(restored.error, expectedAttempt, 'We could not restore your session.', true)
      }
    } catch (error) {
      if (expectedAttempt !== attempt.current) return
      const nextFailure = diagnosticError(error, 'We could not load this application’s authentication policy.')
      setPolicy(previous => ({ ...previous, enabled: true, providers: [], magic_login: false, password_reset: false, registration: 'closed' }))
      setFailure(nextFailure); setMessage(nextFailure.message); setStatus('unavailable'); setPolicyLoading(false)
    }
  }, [acceptBrowserSession, exchangeProviderSession, failSession, startBrowserRestore])

  useEffect(() => {
    const lifecycleAttempt = attempt
    const refreshPolicy = (event: Event) => {
      const detail = (event as CustomEvent<{ siteKey?: string; policy?: unknown }>).detail
      if (detail?.siteKey && detail.siteKey !== authConfig.siteId) return
      void loadPolicy(detail && Object.hasOwn(detail, 'policy') ? { policy: detail.policy } : undefined)
    }
    queueMicrotask(() => void loadPolicy())
    window.addEventListener('unoventi:auth-policy-updated', refreshPolicy)
    return () => { window.removeEventListener('unoventi:auth-policy-updated', refreshPolicy); ++lifecycleAttempt.current }
  }, [loadPolicy])
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') && session) {
        clientLog('debug', 'unoventi.auth.state_changed', { auth_event: event }); void exchangeProviderSession(session)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [exchangeProviderSession])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const connection = new BroadcastChannel(AUTH_CHANNEL); channel.current = connection
    connection.onmessage = event => {
      const value = event.data as { type?: unknown; generation?: unknown }
      if (value.type === 'logout') { ++attempt.current; clearCredential(); setContext(null); setFailure(null); setMessage(null); setStatus('anonymous') }
      else if (value.type === 'generation' && typeof value.generation === 'number' && policyValid.current) void restore(false)
    }
    return () => { channel.current = null; connection.close() }
  }, [restore])
  useEffect(() => {
    const rejected = (event: Event) => {
      const generation = (event as CustomEvent<{ generation?: unknown }>).detail?.generation
      if (typeof generation === 'number' && generation === credentialSnapshot().generation) void refreshSession(generation)
    }
    window.addEventListener('unoventi:auth-rejected', rejected)
    return () => window.removeEventListener('unoventi:auth-rejected', rejected)
  }, [refreshSession])
  useEffect(() => {
    if (status !== 'authenticated' || !context) return
    const tokenExpiry = credentialSnapshot().expiresAt
    if (!tokenExpiry) return
    const refreshAt = Math.min(tokenExpiry - 30_000, Date.parse(context.session_expires_at), Date.parse(context.idle_expires_at))
    const delay = Math.min(2_147_483_647, Math.max(1_000, refreshAt - Date.now()))
    const timer = window.setTimeout(() => void refreshSession(credentialSnapshot().generation), delay)
    return () => window.clearTimeout(timer)
  }, [context, refreshSession, status])

  const refresh = useCallback(async () => { await loadPolicy() }, [loadPolicy])
  const magicLogin = useCallback(async () => {
    if (!policyValid.current || !authConfig.magicLogin || !policy.magic_login) throw new Error('Magic Login is disabled.')
    const expectedAttempt = ++attempt.current; setStatus('authorizing')
    try { const proof = await requestMagicLogin(); if (expectedAttempt === attempt.current) acceptBrowserSession(await exchangeBrowserSession(proof.access_token), expectedAttempt, true) }
    catch (error) { failSession(error, expectedAttempt, 'We could not start the test session.', true); throw error }
  }, [acceptBrowserSession, failSession, policy.magic_login])
  const signOut = useCallback(async () => {
    const current = credentialSnapshot(); ++attempt.current
    try { await logoutBrowserSession(current.csrfToken) } catch { /* local logout remains deterministic */ }
    await supabase.auth.signOut({ scope: 'local' })
    const cleared = clearCredential(current.generation)
    if (cleared) announce('logout', credentialSnapshot().generation)
    setContext(null); setMessage(null); setFailure(null); setStatus('anonymous')
  }, [announce])

  const user = useMemo<User | null>(() => context ? {
    id: context.identity.id, email: context.identity.email, full_name: context.identity.full_name,
    avatar_url: context.identity.avatar_url, is_admin: context.roles.includes('admin'),
    created_at: context.session_started_at, updated_at: context.session_started_at,
  } : null, [context])
  const value = useMemo(() => ({
    status, context, message, failure, policy, policyLoading, refresh, signOut, magicLogin,
    user, loading: status === 'loading' || status === 'authorizing', logout: signOut,
    isAuthenticated: status === 'authenticated' || status === 'disabled',
    isAdmin: status === 'disabled' || context?.roles.includes('admin') === true,
    googleLoginEnabled: policy.enabled && policy.providers.includes('google'),
    magicLoginEnabled: policy.enabled && authConfig.magicLogin && policy.magic_login,
  }), [status, context, message, failure, policy, policyLoading, refresh, signOut, magicLogin, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
