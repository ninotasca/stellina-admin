import { createClient, type Session } from '@supabase/supabase-js'
import { publicConfig } from '../config/index'
import { credentialSnapshot } from './credential-store'

const supabaseUrl = publicConfig.supabaseUrl
const publishableKey = publicConfig.supabasePublishableKey
const VISIT_ID_KEY = 'unoventi.auth-visit-id'

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: { flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: true, persistSession: false },
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
export async function accessToken(): Promise<string | null> { return credentialSnapshot().accessToken }
export function authVisitId(): string {
  const existing = sessionStorage.getItem(VISIT_ID_KEY)
  if (existing) return existing
  const next = crypto.randomUUID(); sessionStorage.setItem(VISIT_ID_KEY, next); return next
}
export function sessionToken(session: Session | null): string | null { return session?.access_token ?? null }
