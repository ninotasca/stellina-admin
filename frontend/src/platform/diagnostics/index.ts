import { publicConfig } from '../config/index';

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';
const levels: Record<ClientLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function resolveClientLogLevel(raw: string | undefined, mode: string): ClientLogLevel {
  const environments: Record<string, string> = {
    local: 'development', dev: 'development', development: 'development', test: 'development',
    stage: 'staging', staging: 'staging', preview: 'staging', prod: 'production', production: 'production',
  };
  const key = mode.trim().toLowerCase();
  if (!Object.hasOwn(environments, key)) throw new Error('Environment must be development, staging, or production');
  if (raw === undefined) return environments[key] === 'development' ? 'debug' : environments[key] === 'staging' ? 'warn' : 'error';
  const normalized = raw.trim().toLowerCase();
  if (!Object.hasOwn(levels, normalized)) throw new Error('VITE_CLIENT_LOG_LEVEL must be DEBUG, INFO, WARN, or ERROR');
  return normalized as ClientLogLevel;
}

// Configuration validation intentionally remains outside the per-event failure guard.
const minimumLevel = levels[publicConfig.clientLogLevel];
const errorClasses = new Set([
  'AuthError', 'AuthenticationRequired', 'AuthorizationDenied', 'HttpError', 'NetworkError',
  'RequestRejected', 'ServiceUnavailable', 'UnknownError', 'UpstreamConnectionError',
]);
const messages = {
  'unoventi.auth.policy_loaded': 'Authentication policy loaded',
  'unoventi.auth.policy_failed': 'Authentication policy unavailable',
  'unoventi.auth.rejected_session_cleared': 'Rejected session cleared',
  'unoventi.auth.rejected_session_clear_failed': 'Rejected session cleanup failed',
  'unoventi.auth.logout_failed': 'Logout failed',
  'unoventi.auth.session_restore_started': 'Session restoration started',
  'unoventi.auth.session_restore_succeeded': 'Session restoration succeeded',
  'unoventi.auth.session_restore_failed': 'Session restoration failed',
  'unoventi.auth.provider_exchange_succeeded': 'Provider session exchanged',
  'unoventi.auth.state_changed': 'Provider authentication state changed',
  'stellina.rfp.save_failed': 'Failed to save RFP',
  'stellina.rfp.invitations_load_failed': 'Failed to load hotel invitations',
  'stellina.rfp.responses_load_failed': 'Failed to load response comparison',
};
type ClientDiagnosticFields = {
  provider_count?: number;
  magic_login_admin?: boolean;
  magic_login_frontend?: boolean;
  magic_login_effective?: boolean;
  status?: number;
  success?: boolean;
  enabled?: boolean;
  max_age_minutes?: number;
  inactivity_minutes?: number;
  correlation_id?: string;
  auth_event?: string;
  error_class?: string;
};

export type DiagnosticError = Readonly<{ message: string; status: number; correlationId: string | null; errorClass: string }>;
export function diagnosticError(error: unknown, fallback: string): DiagnosticError {
  try {
    if (!error || typeof error !== 'object') return { message: fallback, status: 0, correlationId: null, errorClass: 'UnknownError' };
    const value = error as Record<string, unknown>;
    const status = typeof value.status === 'number' && Number.isInteger(value.status) ? value.status : 0;
    const correlationId = typeof value.correlationId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value.correlationId) ? value.correlationId : null;
    const errorClass = typeof value.errorClass === 'string' && errorClasses.has(value.errorClass) ? value.errorClass : status ? 'HttpError' : 'NetworkError';
    const message = typeof value.message === 'string' && value.message.length <= 500 ? value.message : fallback;
    return Object.freeze({ message, status, correlationId, errorClass });
  } catch { return Object.freeze({ message: fallback, status: 0, correlationId: null, errorClass: 'UnknownError' }); }
}

export function clientLog(level: ClientLogLevel, event: keyof typeof messages, fields: ClientDiagnosticFields = {}): void {
  try {
    if (levels[level] < minimumLevel || !Object.hasOwn(messages, event)) return;
    const safe: ClientDiagnosticFields = {};
    const providerCount = fields.provider_count;
    if (typeof providerCount === 'number' && Number.isInteger(providerCount) && providerCount >= 0 && providerCount <= 100) safe.provider_count = providerCount;
    for (const key of ['magic_login_admin', 'magic_login_frontend', 'magic_login_effective', 'success', 'enabled'] as const) {
      const value = fields[key];
      if (typeof value === 'boolean') safe[key] = value;
    }
    const status = fields.status;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) safe.status = status;
    for (const key of ['max_age_minutes', 'inactivity_minutes'] as const) {
      const value = fields[key]; if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 43200) safe[key] = value;
    }
    if (typeof fields.correlation_id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(fields.correlation_id)) safe.correlation_id = fields.correlation_id;
    if (typeof fields.auth_event === 'string' && /^(SIGNED_IN|TOKEN_REFRESHED|PASSWORD_RECOVERY)$/.test(fields.auth_event)) safe.auth_event = fields.auth_event;
    const errorClass = fields.error_class;
    if (typeof errorClass === 'string' && errorClasses.has(errorClass)) safe.error_class = errorClass;
    const output = JSON.stringify({
      timestamp: new Date().toISOString(), level, message: messages[event],
      service: `${publicConfig.manifest.applicationId}-web`, environment: publicConfig.environment,
      component: event.startsWith('stellina.rfp.') ? 'rfp' : 'auth', event,
      site_key: publicConfig.manifest.auth.siteKey, ...safe,
    });
    console[level](output);
  } catch { /* Browser diagnostics must never change a request outcome. */ }
}
