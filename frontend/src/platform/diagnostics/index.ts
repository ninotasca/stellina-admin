import { resolveClientLogLevel, type ClientLogLevel } from '@ninotasca/web-platform/config'
import { normalizeError, type SafeErrorShape } from '@ninotasca/web-platform/errors'
import { createBrowserLogger, createConsoleSink } from '@ninotasca/web-platform/logging'
import { publicConfig } from '../config/index'
export { resolveClientLogLevel }
export type { ClientLogLevel }
export type DiagnosticError = SafeErrorShape

const fields = {
  provider_count: { kind: 'integer', minimum: 0, maximum: 100 }, magic_login_admin: { kind: 'boolean' }, magic_login_frontend: { kind: 'boolean' },
  magic_login_effective: { kind: 'boolean' }, status: { kind: 'integer', minimum: 100, maximum: 599 }, success: { kind: 'boolean' }, enabled: { kind: 'boolean' },
  max_age_minutes: { kind: 'integer', minimum: 0, maximum: 43_200 }, inactivity_minutes: { kind: 'integer', minimum: 0, maximum: 43_200 },
  correlation_id: { kind: 'identifier', maximumLength: 128 }, auth_event: { kind: 'identifier', maximumLength: 64 }, error_class: { kind: 'identifier', maximumLength: 96 },
} as const
const auth = (message: string) => ({ message, component: 'auth', fields })
const rfp = (message: string) => ({ message, component: 'rfp', fields })
const catalog = {
  'unoventi.auth.policy_loaded': auth('Authentication policy loaded'), 'unoventi.auth.policy_failed': auth('Authentication policy unavailable'),
  'unoventi.auth.rejected_session_cleared': auth('Rejected session cleared'), 'unoventi.auth.rejected_session_clear_failed': auth('Rejected session cleanup failed'),
  'unoventi.auth.logout_failed': auth('Logout failed'), 'unoventi.auth.session_restore_started': auth('Session restoration started'),
  'unoventi.auth.session_restore_succeeded': auth('Session restoration succeeded'), 'unoventi.auth.session_restore_failed': auth('Session restoration failed'),
  'unoventi.auth.provider_exchange_succeeded': auth('Provider session exchanged'), 'unoventi.auth.state_changed': auth('Provider authentication state changed'),
  'stellina.rfp.save_failed': rfp('Failed to save RFP'), 'stellina.rfp.invitations_load_failed': rfp('Failed to load hotel invitations'),
  'stellina.rfp.responses_load_failed': rfp('Failed to load response comparison'),
} as const
const logger = createBrowserLogger({ minimumLevel: publicConfig.clientLogLevel, service: `${publicConfig.manifest.applicationId}-web`,
  environment: publicConfig.environment, siteKey: publicConfig.manifest.auth.siteKey, catalog, sink: createConsoleSink() })
const approvedFields = Object.keys(fields)
const errorClasses = new Set(['AuthError', 'AuthenticationRequired', 'AuthorizationDenied', 'HttpError', 'NetworkError', 'RequestRejected', 'ServiceUnavailable', 'UnknownError', 'UpstreamConnectionError'])
export function clientLog(level: ClientLogLevel, event: keyof typeof catalog, values: Readonly<Record<string, unknown>> = {}): void {
  const safe: Record<string, unknown> = {}
  try {
    for (const key of approvedFields) {
      const value = values[key]
      if (key !== 'error_class' || (typeof value === 'string' && errorClasses.has(value))) safe[key] = value
    }
  } catch { logger.log(level, event); return }
  logger.log(level, event, safe)
}
export function diagnosticError(error: unknown, fallback: string): DiagnosticError { return normalizeError(error, { fallbackMessage: fallback }) }
