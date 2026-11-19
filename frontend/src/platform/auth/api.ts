import type { AuthBackend } from '@ninotasca/web-platform/auth'
import { CORE_API_URL, platformPublicClient } from '../http/index'
import { authConfig } from './config'
const request = <T>(path: string, options: Parameters<typeof platformPublicClient.request<T>>[1] = {}) => platformPublicClient.request<T>(`${CORE_API_URL}${path}`, { ...options, credentials: 'same-origin' })
export async function reportAuthEvent(payload: { event_type: string; email?: string; error_code?: string; details?: Record<string, string | number | boolean> }): Promise<void> {
  try { await request(`/auth/events/${encodeURIComponent(authConfig.siteId)}`, { method: 'POST', body: payload }) } catch { /* telemetry isolation */ }
}
const sessionPath = `/auth/browser-session/${encodeURIComponent(authConfig.siteId)}`
export const authBackend: AuthBackend = {
  fetchPolicy: siteKey => request(`/auth/config/${encodeURIComponent(siteKey)}`),
  exchange: proof => request(`${sessionPath}/exchange`, { method: 'POST', headers: { Authorization: `Bearer ${proof}` } }),
  restore: () => request(`${sessionPath}/restore`, { method: 'POST' }),
  refresh: csrf => request(`${sessionPath}/refresh`, { method: 'POST', headers: { 'X-CSRF-Token': csrf } }),
  logout: csrf => request(sessionPath, { method: 'DELETE', headers: csrf ? { 'X-CSRF-Token': csrf } : undefined }),
  requestMagicLogin: async () => (await request<{ access_token: string }>(`/auth/magic-login/${encodeURIComponent(authConfig.siteId)}`, { method: 'POST' })).access_token,
}
