import { execFileSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function buildVersion() {
  const deployed = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (deployed && /^[0-9a-f]{7,40}$/i.test(deployed)) return deployed.slice(0, 7).toLowerCase()
  try {
    const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase()
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()
    return `${commit}${dirty ? '-dirty' : ''}`
  } catch {
    return 'development'
  }
}

export default defineConfig(({ mode }) => {
  const aliases: Record<string, string> = {
    local: 'development', dev: 'development', development: 'development', test: 'development',
    stage: 'staging', staging: 'staging', preview: 'staging', prod: 'production', production: 'production',
  }
  const key = mode.trim().toLowerCase()
  if (!Object.hasOwn(aliases, key)) throw new Error('Environment must be development, staging, or production')
  const environment = aliases[key]
  const env = loadEnv(mode, process.cwd(), '')
  const raw = process.env.VITE_CLIENT_LOG_LEVEL ?? env.VITE_CLIENT_LOG_LEVEL
  const level = raw === undefined ? (environment === 'development' ? 'DEBUG' : environment === 'staging' ? 'WARN' : 'ERROR') : raw.trim().toUpperCase()
  if (!['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(level)) {
    throw new Error('VITE_CLIENT_LOG_LEVEL must be DEBUG, INFO, WARN, or ERROR')
  }
  const target = process.env.STELLINA_API_PROXY_TARGET || env.STELLINA_API_PROXY_TARGET || 'http://127.0.0.1:3301'
  const proxy = {
    '^/api/v1/(stellina|core)(/|$)': { target, changeOrigin: true },
  }
  // Vite forwards directly to the backend. Vercel runs the selected logging Functions.
  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion()),
      'import.meta.env.VITE_CLIENT_LOG_LEVEL': JSON.stringify(level),
    },
    plugins: [react()],
    server: { host: '127.0.0.1', port: 3401, strictPort: true, proxy },
    preview: { proxy },
  }
})
