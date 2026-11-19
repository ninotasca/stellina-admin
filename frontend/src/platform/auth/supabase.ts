import { createClient, type Session } from '@supabase/supabase-js'
import { publicConfig } from '../config/index'
import { credentialStore } from './runtime'
import type { ProviderProofAdapter } from '@ninotasca/web-platform/auth'

const supabaseUrl = publicConfig.supabaseUrl
const publishableKey = publicConfig.supabasePublishableKey
const VISIT_ID_KEY = 'unoventi.auth-visit-id'

// PKCE must retain its one-time verifier across the full-page Google redirect.
// Keep it in tab-scoped storage, then clear the Supabase session immediately
// after Core exchanges the provider proof for its HttpOnly browser session.
const oauthRedirectStorage = {
  getItem(key: string) { try { return sessionStorage.getItem(key) } catch { return null } },
  setItem(key: string, value: string) { sessionStorage.setItem(key, value) },
  removeItem(key: string) { try { sessionStorage.removeItem(key) } catch { /* already unavailable */ } },
}

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: false,
    detectSessionInUrl: true,
    persistSession: true,
    storage: oauthRedirectStorage,
  },
})

export type GoogleProviderStatus = {
  available: boolean
  code: 'available' | 'client_not_configured' | 'provider_not_configured' | 'settings_unavailable'
  technicalDetail: string | null
}
export async function googleProviderStatus(): Promise<GoogleProviderStatus> {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey } })
    if (!response.ok) return { available: false, code: 'settings_unavailable', technicalDetail: `Authentication settings request returned HTTP ${response.status}.` }
    const settings = await response.json() as { external?: { google?: boolean } }
    return settings.external?.google === true
      ? { available: true, code: 'available', technicalDetail: null }
      : { available: false, code: 'provider_not_configured', technicalDetail: 'The shared authentication project reports that Google is disabled or incomplete.' }
  } catch (error) {
    return { available: false, code: 'settings_unavailable', technicalDetail: error instanceof Error ? error.message : 'Authentication settings could not be reached.' }
  }
}
export async function accessToken(): Promise<string | null> { return credentialStore.snapshot().accessToken }
export function authVisitId(): string {
  const existing = sessionStorage.getItem(VISIT_ID_KEY)
  if (existing) return existing
  const next = crypto.randomUUID(); sessionStorage.setItem(VISIT_ID_KEY, next); return next
}
export function sessionToken(session: Session | null): string | null { return session?.access_token ?? null }
export const providerProofAdapter: ProviderProofAdapter = {
  subscribeProof(listener) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') && session?.access_token) listener(session.access_token)
    })
    return () => data.subscription.unsubscribe()
  },
  async clearLocal() { await supabase.auth.signOut({ scope: 'local' }) },
}
