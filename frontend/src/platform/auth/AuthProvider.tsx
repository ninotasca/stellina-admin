import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createAuthLifecycle, createBrowserAuthChannel } from '@ninotasca/web-platform/auth'
import { authConfig } from './config'
import { authBackend } from './api'
import { AuthContext } from './auth-context'
import { credentialStore } from './runtime'
import { providerProofAdapter } from './supabase'
import type { AuthSessionContext, PublicAuthConfig, User } from '../../domain/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [lifecycle] = useState(() => createAuthLifecycle({ siteKey: authConfig.siteId, magicLoginUiEnabled: authConfig.magicLogin,
    backend: authBackend, provider: providerProofAdapter, channel: createBrowserAuthChannel(), credentialStore }))
  const mountGeneration = useRef(0)
  const state = useSyncExternalStore(lifecycle.subscribe, lifecycle.snapshot, lifecycle.snapshot)
  useEffect(() => {
    const generation = ++mountGeneration.current
    void lifecycle.start()
    return () => { queueMicrotask(() => { if (mountGeneration.current === generation) lifecycle.destroy() }) }
  }, [lifecycle])
  useEffect(() => {
    const rejected = (event: Event) => { const generation = (event as CustomEvent<{ generation?: unknown }>).detail?.generation; if (typeof generation === 'number') void lifecycle.handleAuthenticationRejected(generation) }
    window.addEventListener('unoventi:auth-rejected', rejected); return () => window.removeEventListener('unoventi:auth-rejected', rejected)
  }, [lifecycle])
  useEffect(() => {
    if (state.status !== 'authenticated' || !state.context) return
    const credential = credentialStore.snapshot(); if (!credential.expiresAt) return
    const refreshAt = Math.min(credential.expiresAt - 30_000, Date.parse(state.context.session_expires_at), Date.parse(state.context.idle_expires_at))
    const timer = window.setTimeout(() => void lifecycle.refreshSession(credential.generation), Math.min(2_147_483_647, Math.max(1_000, refreshAt - Date.now())))
    return () => window.clearTimeout(timer)
  }, [lifecycle, state.context, state.status])
  const context = state.context as AuthSessionContext | null
  const user = useMemo<User | null>(() => context ? { id: context.identity.id, email: context.identity.email, full_name: context.identity.full_name,
    avatar_url: context.identity.avatar_url, is_admin: context.roles.includes('admin'), created_at: context.session_started_at, updated_at: context.session_started_at } : null, [context])
  const value = useMemo(() => ({ status: state.status, context, message: state.failure?.message ?? null, failure: state.failure,
    policy: state.policy as PublicAuthConfig, policyLoading: state.policyLoading, refresh: lifecycle.refreshPolicy, signOut: lifecycle.signOut, magicLogin: lifecycle.magicLogin,
    user, loading: state.status === 'loading' || state.status === 'authorizing', logout: lifecycle.signOut,
    isAuthenticated: state.status === 'authenticated' || state.status === 'disabled', isAdmin: state.status === 'disabled' || context?.roles.includes('admin') === true,
    googleLoginEnabled: state.policy.enabled && state.policy.providers.includes('google'), magicLoginEnabled: state.policy.enabled && authConfig.magicLogin && state.policy.magic_login,
  }), [context, lifecycle, state, user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
