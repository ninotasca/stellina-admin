import { coreProtectedApiClient as coreClient, stellinaProtectedApiClient as stellinaClient } from '../../platform/http/index'
import type { AllowedGoogleAccount, LoginAttempt } from '../../domain/auth'

export const administrationApi = {
  async getLoginAttempts(limit = 100, cursor?: string): Promise<LoginAttempt[]> {
    return (await stellinaClient.get<LoginAttempt[]>('/auth/login-attempts', { params: { limit, ...(cursor ? { cursor } : {}) } })).data
  },
  async getAllowedGoogleAccounts(): Promise<AllowedGoogleAccount[]> {
    return (await coreClient.get<AllowedGoogleAccount[]>('/auth/allowed-google-accounts')).data
  },
  async createAllowedGoogleAccount(payload: { email?: string; domain?: string; is_active?: boolean }): Promise<AllowedGoogleAccount> {
    return (await coreClient.post<AllowedGoogleAccount>('/auth/allowed-google-accounts', payload)).data
  },
  async updateAllowedGoogleAccount(accountId: string, payload: { email?: string; domain?: string; is_active?: boolean }): Promise<AllowedGoogleAccount> {
    return (await coreClient.patch<AllowedGoogleAccount>(`/auth/allowed-google-accounts/${accountId}`, payload)).data
  },
  async deleteAllowedGoogleAccount(accountId: string): Promise<void> {
    await coreClient.delete(`/auth/allowed-google-accounts/${accountId}`)
  },
  async downloadSqliteBackup(): Promise<Blob> {
    return (await coreClient.get('/backups/stellina/sqlite', { responseType: 'blob' })).data
  },
}
