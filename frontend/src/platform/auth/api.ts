import type { AuthSessionContext, BrowserSessionResponse, PublicAuthConfig } from '../../domain/auth'
import { CORE_API_URL, publicApiClient } from '../http/index'
import { authConfig } from './config'

async function publicCoreRequest<T>(method: string, path: string, options: { data?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  return (await publicApiClient.request<T>({
    method, url: `${CORE_API_URL}${path}`, data: options.data, headers: options.headers, withCredentials: true,
  })).data
}

export async function reportAuthEvent(payload: { event_type: string; email?: string; error_code?: string; details?: Record<string, string | number | boolean> }): Promise<void> {
  try { await publicCoreRequest('POST', `/auth/events/${encodeURIComponent(authConfig.siteId)}`, { data: payload }) }
  catch { /* Audit telemetry must never prevent authentication. */ }
}
export function requestMagicLogin(): Promise<{ access_token: string }> {
  return publicCoreRequest('POST', `/auth/magic-login/${encodeURIComponent(authConfig.siteId)}`)
}
export function fetchAuthPolicy(siteKey: string): Promise<PublicAuthConfig> {
  return publicCoreRequest('GET', `/auth/config/${encodeURIComponent(siteKey)}`)
}
const browserSessionPath = `/auth/browser-session/${encodeURIComponent(authConfig.siteId)}`
export function exchangeBrowserSession(providerProof: string): Promise<BrowserSessionResponse> {
  return publicCoreRequest<unknown>('POST', `${browserSessionPath}/exchange`, { headers: { Authorization: `Bearer ${providerProof}` } }).then(decodeBrowserSession)
}
export function restoreBrowserSession(): Promise<BrowserSessionResponse> {
  return publicCoreRequest<unknown>('POST', `${browserSessionPath}/restore`).then(decodeBrowserSession)
}
export function refreshBrowserSession(csrfToken: string): Promise<BrowserSessionResponse> {
  return publicCoreRequest<unknown>('POST', `${browserSessionPath}/refresh`, { headers: { 'X-CSRF-Token': csrfToken } }).then(decodeBrowserSession)
}
export async function logoutBrowserSession(csrfToken: string | null): Promise<void> {
  await publicCoreRequest('DELETE', browserSessionPath, { headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined })
}
export function browserSessionContext(value: BrowserSessionResponse): AuthSessionContext {
  return {
    site_key: value.authority.site_key, site_uuid: null, identity: value.authority.actor,
    roles: [...value.authority.roles], permissions: [...value.authority.permissions],
    session_started_at: value.authority.session_started_at, session_expires_at: value.authority.absolute_expires_at,
    idle_expires_at: value.authority.idle_expires_at,
  }
}
function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function strings(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value) && value.length <= maximum && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 256)
}
function instant(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
export function decodeBrowserSession(value: unknown): BrowserSessionResponse {
  if (!object(value) || !object(value.authority) || !object(value.authority.actor)) throw new Error('Invalid browser session response')
  const authority = value.authority, actor = authority.actor as Record<string, unknown>
  if (typeof value.access_token !== 'string' || value.access_token.length < 32 || value.access_token.length > 8192 ||
      value.token_type !== 'bearer' || typeof value.csrf_token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(value.csrf_token) ||
      !instant(value.issued_at) || !instant(value.expires_at) || !Number.isInteger(value.expires_in_seconds) ||
      (value.expires_in_seconds as number) < 1 || (value.expires_in_seconds as number) > 300 ||
      authority.site_key !== authConfig.siteId || !strings(authority.roles, 32) || !strings(authority.permissions, 128) ||
      !instant(authority.session_started_at) || !instant(authority.absolute_expires_at) || !instant(authority.idle_expires_at) ||
      typeof actor.id !== 'string' || !actor.id || typeof actor.email !== 'string' || !actor.email.includes('@') ||
      typeof actor.provider !== 'string' || !actor.provider || (actor.full_name !== null && typeof actor.full_name !== 'string') ||
      (actor.avatar_url !== null && typeof actor.avatar_url !== 'string')) throw new Error('Invalid browser session response')
  const issued = Date.parse(value.issued_at), expires = Date.parse(value.expires_at)
  if (expires <= issued || expires > Math.min(Date.parse(authority.absolute_expires_at as string), Date.parse(authority.idle_expires_at as string))) throw new Error('Invalid browser session response')
  return value as BrowserSessionResponse
}
