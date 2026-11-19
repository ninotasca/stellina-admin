import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import { createApiClient, CORE_API_URL } from '../http/index'
import type { GoogleAuthRequest, LogoutResponse, TokenResponse, User } from '../../domain/auth'
import { publicConfig } from '../config/index'

const SITE_ID = publicConfig.siteId
export const AUTH_SITE_KEY = publicConfig.manifest.auth.siteKey
const AUTH_VISIT_KEY = 'unoventi.auth-visit-id'

export interface PublicAuthConfig {
  enabled: boolean
  providers: Array<'email' | 'google'>
  registration: 'open' | 'closed'
  password_reset: boolean
  magic_login: boolean
}

function browserId(key: string) {
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(key, created)
  return created
}

export function createLegacyProtectedClient(baseURL: string): AxiosInstance {
  const client = createApiClient({ baseURL, headers: { 'Content-Type': 'application/json' } })
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token')
    config.headers['X-Unoventi-Site-Id'] = AUTH_SITE_KEY
    config.headers['X-Unoventi-Visit-Id'] = browserId(AUTH_VISIT_KEY)
    config.headers['X-Correlation-Id'] = crypto.randomUUID()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })
  client.interceptors.response.use(response => response, (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      if (!['/login', '/auth/callback'].includes(window.location.pathname)) window.location.href = '/login'
    }
    return Promise.reject(error)
  })
  return client
}

class AuthApi {
  private readonly coreClient = createLegacyProtectedClient(CORE_API_URL)

  async healthCheck(): Promise<{ status: string; message: string }> {
    return (await this.coreClient.get('/health/stellina')).data
  }

  async googleAuth(code: string, redirectUri: string): Promise<TokenResponse> {
    const request: GoogleAuthRequest = { code, redirect_uri: redirectUri, ...(SITE_ID ? { site_id: SITE_ID } : {}) }
    return (await this.coreClient.post<TokenResponse>('/auth/google', request)).data
  }

  async logout(): Promise<LogoutResponse> {
    return (await this.coreClient.post<LogoutResponse>('/auth/logout')).data
  }

  async exchangeSession(): Promise<{ access_token: string; user: User }> {
    const response = await this.coreClient.get<{
      access_token: string
      context: { identity: { id: string; email: string; full_name: string | null; avatar_url: string | null }; roles: string[] }
    }>('/auth/session/stellina')
    const context = response.data.context
    const now = new Date().toISOString()
    return { access_token: response.data.access_token, user: {
      id: context.identity.id, email: context.identity.email, full_name: context.identity.full_name,
      avatar_url: context.identity.avatar_url, is_admin: true, created_at: now, updated_at: now,
    } }
  }

  async getCurrentUser(): Promise<User> { return (await this.exchangeSession()).user }

  async getAuthPolicy(): Promise<PublicAuthConfig> {
    return (await this.coreClient.get<PublicAuthConfig>(`/auth/config/${AUTH_SITE_KEY}`)).data
  }

  async magicLogin(): Promise<{ access_token: string }> {
    return (await this.coreClient.post<{ access_token: string }>(`/auth/magic-login/${AUTH_SITE_KEY}`)).data
  }

  async reportAuthEvent(eventType: 'oauth_started' | 'oauth_callback_failed' | 'auth_error' | 'logout', errorCode?: string): Promise<void> {
    try {
      await this.coreClient.post(`/auth/events/${AUTH_SITE_KEY}`, {
        event_type: eventType, ...(errorCode ? { error_code: errorCode.slice(0, 120) } : {}),
      })
    } catch { /* Auth telemetry must not interrupt authentication. */ }
  }
}

export const authApi = new AuthApi()
