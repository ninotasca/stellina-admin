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
  const env = loadEnv(mode, process.cwd(), '')
  const target = process.env.STELLINA_API_PROXY_TARGET || env.STELLINA_API_PROXY_TARGET || 'http://127.0.0.1:3301'
  const proxy = {
    '^/api/v1/(stellina|core)(/|$)': { target, changeOrigin: true },
  }
  // Vite forwards directly to the backend. Vercel runs the selected logging Functions.
  return {
    define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildVersion()) },
    plugins: [react()],
    server: { host: '127.0.0.1', port: 3401, strictPort: true, proxy },
    preview: { proxy },
  }
})
