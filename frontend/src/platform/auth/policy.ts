import type { PublicAuthConfig } from '../../domain/auth'

export function parseAuthPolicy(value: unknown, siteKey: string): PublicAuthConfig {
  const invalid = (): never => { throw new Error('Invalid authentication policy.') }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const policy = value as Record<string, unknown>
  if (policy.site_key !== siteKey ||
      !(policy.site_uuid === null || (typeof policy.site_uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(policy.site_uuid))) ||
      typeof policy.enabled !== 'boolean' || !Array.isArray(policy.providers) ||
      !Array.from(policy.providers).every(provider => provider === 'email' || provider === 'google') ||
      new Set(policy.providers).size !== policy.providers.length ||
      (policy.registration !== 'open' && policy.registration !== 'closed') ||
      typeof policy.password_reset !== 'boolean' || typeof policy.magic_login !== 'boolean') return invalid()
  for (const [field, maximum] of [['session_max_age_minutes', 43200], ['session_inactivity_minutes', 43200], ['session_resume_after_minutes', 10080]] as const) {
    const minutes = policy[field]
    if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 5 || minutes > maximum) return invalid()
  }
  return {
    site_key: siteKey, site_uuid: policy.site_uuid as string | null, enabled: policy.enabled,
    providers: [...policy.providers] as string[], registration: policy.registration,
    password_reset: policy.password_reset, magic_login: policy.magic_login,
    session_max_age_minutes: policy.session_max_age_minutes as number,
    session_inactivity_minutes: policy.session_inactivity_minutes as number,
    session_resume_after_minutes: policy.session_resume_after_minutes as number,
  }
}
