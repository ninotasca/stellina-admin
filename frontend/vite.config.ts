import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = process.env.STELLINA_API_PROXY_TARGET || env.STELLINA_API_PROXY_TARGET || 'http://localhost:3401'
  const proxy = {
    '^/api/v1/(stellina|core)(/|$)': { target, changeOrigin: true },
  }
  // Vite forwards directly to the backend. Vercel runs the selected logging Functions.
  return { plugins: [react()], server: { port: 3402, proxy }, preview: { proxy } }
})
