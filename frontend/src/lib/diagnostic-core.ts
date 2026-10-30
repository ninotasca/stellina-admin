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
const minimumLevel = levels[resolveClientLogLevel(import.meta.env.VITE_CLIENT_LOG_LEVEL, import.meta.env.MODE)];
const messages = {
  'unoventi.auth.policy_loaded': 'Authentication policy loaded',
  'unoventi.auth.policy_failed': 'Authentication policy unavailable',
  'unoventi.auth.rejected_session_cleared': 'Rejected session cleared',
  'unoventi.auth.rejected_session_clear_failed': 'Rejected session cleanup failed',
  'unoventi.auth.logout_failed': 'Logout failed',
};
type AuthDiagnosticFields = {
  provider_count?: number;
  magic_login_admin?: boolean;
  magic_login_frontend?: boolean;
  magic_login_effective?: boolean;
  status?: number;
  success?: boolean;
  error_class?: 'AuthError' | 'UnknownError';
};

export function clientLog(level: ClientLogLevel, event: keyof typeof messages, fields: AuthDiagnosticFields = {}): void {
  try {
    if (levels[level] < minimumLevel || !Object.hasOwn(messages, event)) return;
    const safe: AuthDiagnosticFields = {};
    const providerCount = fields.provider_count;
    if (typeof providerCount === 'number' && Number.isInteger(providerCount) && providerCount >= 0 && providerCount <= 100) safe.provider_count = providerCount;
    for (const key of ['magic_login_admin', 'magic_login_frontend', 'magic_login_effective', 'success'] as const) {
      const value = fields[key];
      if (typeof value === 'boolean') safe[key] = value;
    }
    const status = fields.status;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) safe.status = status;
    const errorClass = fields.error_class;
    if (errorClass === 'AuthError' || errorClass === 'UnknownError') safe.error_class = errorClass;
    const output = JSON.stringify({
      timestamp: new Date().toISOString(), level, message: messages[event],
      service: 'stellina-admin-web', environment: import.meta.env.MODE,
      component: 'auth', event, site_key: 'stellina', ...safe,
    });
    console[level](output);
  } catch { /* Browser diagnostics must never change an authentication outcome. */ }
}
