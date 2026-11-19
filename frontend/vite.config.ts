import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveBuildEnvironment } from './build/environment.js'
import { decodePublicConfig, selectPublicValues } from './build/public-config.js'

export { resolveBuildEnvironment } from './build/environment.js'

const frontendRoot = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(frontendRoot, 'src/app/application-manifest.json')
const registryPath = resolve(frontendRoot, 'config/application-binding.registry.json')
const digestPath = resolve(frontendRoot, 'config/application-binding.registry.sha256')

function readPinnedConfiguration() {
  const registrySource = readFileSync(registryPath)
  const actual = createHash('sha256').update(registrySource).digest('hex')
  const expected = readFileSync(digestPath, 'utf8').trim()
  if (actual !== expected) throw new Error('Application binding registry digest mismatch')
  return { manifest: JSON.parse(readFileSync(manifestPath, 'utf8')), registry: JSON.parse(registrySource.toString('utf8')) }
}

function buildVersion() {
  const deployed = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (deployed && /^[0-9a-f]{7,40}$/i.test(deployed)) return deployed.slice(0, 7).toLowerCase()
  try {
    const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().toLowerCase()
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return `${commit}${dirty ? '-dirty' : ''}`
  } catch { return 'development' }
}

export default defineConfig(({ mode, command }) => {
  const environment = resolveBuildEnvironment(mode, process.env, command)
  process.env.NODE_ENV = environment === 'development' ? 'development' : 'production'
  // Public configuration is pinned in the repository's reviewed environment
  // profile. Hosted ambient variables must not override application identity,
  // auth policy, or the strict public allowlist.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VITE_')) delete process.env[key]
  }
  const env = loadEnv(environment, process.cwd(), '')
  delete env.VITE_USER_NODE_ENV
  const { manifest, registry } = readPinnedConfiguration()
  const decoded = decodePublicConfig(manifest, selectPublicValues(env), environment, registry)
  if (!decoded.ok) throw new Error(`Application configuration unavailable (${decoded.code})`)
  const publicConfig = { ...decoded.value, buildVersion: buildVersion() }
  const target = process.env.STELLINA_API_PROXY_TARGET || env.STELLINA_API_PROXY_TARGET || 'http://127.0.0.1:3301'
  // Core's browser-session adapter compares Origin with the request host as a
  // CSRF boundary. Preserve the browser-facing host through the local proxy.
  const proxy = { '^/api/v1/(stellina|core)(/|$)': { target, changeOrigin: false } }
  return {
    mode: environment,
    envDir: false,
    define: {
      'import.meta.env.MODE': JSON.stringify(environment),
      'import.meta.env.DEV': JSON.stringify(environment === 'development'),
      'import.meta.env.PROD': JSON.stringify(environment !== 'development'),
      __STELLINA_PUBLIC_CONFIG__: JSON.stringify(publicConfig),
    },
    plugins: [react()],
    server: { host: '127.0.0.1', port: 3401, strictPort: true, proxy },
    preview: { proxy },
  }
})
