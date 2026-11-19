/** @typedef {'development' | 'staging' | 'production'} BuildEnvironment */

/** @type {Record<string, BuildEnvironment>} */
const aliases = {
  local: 'development', dev: 'development', development: 'development', test: 'development',
  stage: 'staging', staging: 'staging', preview: 'staging', prod: 'production', production: 'production',
}

/**
 * @param {string | undefined} mode
 * @param {Record<string, string | undefined>} [values]
 * @param {string} [command]
 * @returns {BuildEnvironment}
 */
export function resolveBuildEnvironment(mode, values = process.env, command = 'serve') {
  const selected = [values.ENVIRONMENT_NAME, values.RAILWAY_ENVIRONMENT_NAME, values.VERCEL_ENV, mode]
    .find(value => value?.trim())
  if (selected === undefined && [values.VERCEL, values.RAILWAY_SERVICE_ID, values.RAILWAY_DEPLOYMENT_ID]
    .some(value => value?.trim())) throw new Error('Hosted environment must be identified')
  if (selected === undefined && command !== 'serve') throw new Error('Build environment must be explicitly selected')
  const key = (selected ?? 'development').trim().toLowerCase()
  if (!Object.hasOwn(aliases, key)) throw new Error('Environment must be development, staging, or production')
  return aliases[key]
}
