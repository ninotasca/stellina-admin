// @ts-nocheck -- hostile build inputs are decoded dynamically and covered by fixtures.
const publicKeys = new Set([
  'VITE_CLIENT_LOG_LEVEL', 'VITE_API_BASE_URL', 'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SHOW_BUILD_INFO',
  'VITE_AUTH_ENABLE_MAGIC_LOGIN', 'VITE_ENABLE_TEST_BOOKINGS',
])
const capabilities = new Set(['auth', 'platform-administration'])
const slug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 48
const ownedPath = value => typeof value === 'string' && /^\/(?!\/)(?!.*(?:\\|\/\.\.?\/|%2e|[?#\r\n]))[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/i.test(value)
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value, expected) => plainObject(value) && Object.keys(value).sort().join() === [...expected].sort().join()
const fail = code => { const error = new Error(`Application configuration unavailable (${code})`); error.configCode = code; throw error }
const deepFreeze = value => {
  if (plainObject(value) || Array.isArray(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}
function strictBoolean(value) {
  if (value === undefined) return false
  if (value === 'true') return true
  if (value === 'false') return false
  fail('public-invalid')
}
function logLevel(value, environment) {
  if (value === undefined) return { development: 'debug', staging: 'warn', production: 'error' }[environment]
  if (typeof value !== 'string' || !/^(DEBUG|INFO|WARN|ERROR)$/i.test(value)) fail('public-invalid')
  return value.toLowerCase()
}
function httpsOrigin(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password
  } catch { return false }
}
export function decodePublicConfig(manifest, publicValues, environment, registry) {
  try {
    if (!['development', 'staging', 'production'].includes(environment) || !plainObject(registry) ||
        registry.schemaVersion !== 1 || !plainObject(registry.applications)) fail('config-unavailable')
    if (!exactKeys(manifest, ['schemaVersion', 'applicationId', 'api', 'auth', 'branding']) ||
        !exactKeys(manifest.api, ['owner', 'productNamespace', 'coreCapabilities']) ||
        !exactKeys(manifest.auth, ['siteKey']) ||
        !exactKeys(manifest.branding, ['displayName', 'logoPath', 'postLoginPath'])) fail('manifest-invalid')
    const api = manifest.api, branding = manifest.branding
    if (manifest.schemaVersion !== 1 || !slug(manifest.applicationId) || !slug(manifest.auth.siteKey) ||
        api.owner !== 'unoventi-api' || !slug(api.productNamespace) ||
        !Array.isArray(api.coreCapabilities) || api.coreCapabilities.length > capabilities.size ||
        new Set(api.coreCapabilities).size !== api.coreCapabilities.length ||
        !api.coreCapabilities.every(value => capabilities.has(value)) ||
        typeof branding.displayName !== 'string' || branding.displayName.length < 1 || branding.displayName.length > 80 ||
        /[<>&"'\r\n]/.test(branding.displayName) || !ownedPath(branding.logoPath) || !ownedPath(branding.postLoginPath)) fail('manifest-invalid')
    const binding = registry.applications[manifest.applicationId]
    if (!plainObject(binding) || binding.applicationId !== manifest.applicationId ||
        binding.siteKey !== manifest.auth.siteKey || binding.productNamespace !== api.productNamespace ||
        typeof binding.siteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(binding.siteId) ||
        api.coreCapabilities.length !== binding.coreCapabilities?.length ||
        !api.coreCapabilities.every(value => binding.coreCapabilities.includes(value))) fail('scope-mismatch')
    if (!binding.assets?.includes(branding.logoPath) || !binding.routes?.includes(branding.postLoginPath)) fail('manifest-invalid')
    const deployment = binding.deployments?.[environment]
    if (!plainObject(deployment) || !plainObject(publicValues) || Object.keys(publicValues).some(key => !publicKeys.has(key))) fail('public-invalid')
    const apiBaseUrl = publicValues.VITE_API_BASE_URL ?? '/api/v1'
    if (apiBaseUrl !== '/api/v1') {
      if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.endsWith('/api/v1')) fail('public-invalid')
      const origin = apiBaseUrl.slice(0, -7)
      if (!httpsOrigin(origin) || !deployment.apiOrigins.includes(origin)) fail('public-invalid')
    }
    if (publicValues.VITE_SUPABASE_URL !== deployment.supabaseUrl || !httpsOrigin(publicValues.VITE_SUPABASE_URL) ||
        typeof publicValues.VITE_SUPABASE_PUBLISHABLE_KEY !== 'string' ||
        !/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(publicValues.VITE_SUPABASE_PUBLISHABLE_KEY)) fail('public-invalid')
    const enableMagicLoginUi = strictBoolean(publicValues.VITE_AUTH_ENABLE_MAGIC_LOGIN)
    const includeTestBookings = strictBoolean(publicValues.VITE_ENABLE_TEST_BOOKINGS)
    if ((enableMagicLoginUi || includeTestBookings) && environment !== 'development') fail('public-invalid')
    return Object.freeze({ ok: true, value: Object.freeze({
      manifest: deepFreeze(structuredClone(manifest)), environment,
      clientLogLevel: logLevel(publicValues.VITE_CLIENT_LOG_LEVEL, environment), apiBaseUrl,
      siteId: binding.siteId, supabaseUrl: publicValues.VITE_SUPABASE_URL,
      supabasePublishableKey: publicValues.VITE_SUPABASE_PUBLISHABLE_KEY,
      switches: Object.freeze({ showBuildInfo: strictBoolean(publicValues.VITE_SHOW_BUILD_INFO), enableMagicLoginUi, includeTestBookings }),
      registryRevision: registry.registryRevision,
    }) })
  } catch (error) {
    const allowed = new Set(['manifest-invalid', 'scope-mismatch', 'public-invalid', 'config-unavailable'])
    return Object.freeze({ ok: false, code: allowed.has(error?.configCode) ? error.configCode : 'config-unavailable' })
  }
}
export function selectPublicValues(values) {
  const selected = {}
  for (const [key, value] of Object.entries(values)) if (key.startsWith('VITE_')) selected[key] = value
  return selected
}
