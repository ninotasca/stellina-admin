import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'

const frontend = fileURLToPath(new URL('..', import.meta.url))
test('Stellina login exposes unavailable semantics and retry in a real browser', { timeout: 90000 }, async () => {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean)
  let chrome
  for (const candidate of candidates) try { await access(candidate); chrome = candidate; break } catch { /* next */ }
  assert.ok(chrome, 'Installed Chrome/Chromium required')
  const config = { environment: 'development', clientLogLevel: 'debug', apiBaseUrl: '/api/v1', buildVersion: 'test', registryRevision: 'test', siteId: 'fixture', manifest: { schemaVersion: 1, applicationId: 'stellina-admin', api: { owner: 'unoventi-api', productNamespace: 'stellina', coreCapabilities: ['auth'] }, auth: { siteKey: 'stellina' }, branding: { displayName: 'Stellina Admin', logoPath: '/brand/stellina-logo-black.png', postLoginPath: '/dashboard' } }, supabaseUrl: 'https://fixture.invalid', supabasePublishableKey: 'sb_publishable_fixture_0000000000', switches: { showBuildInfo: false, enableMagicLoginUi: false, includeTestBookings: false } }
  const output = await build({ root: frontend, configFile: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"', __STELLINA_PUBLIC_CONFIG__: JSON.stringify(config) }, esbuild: { jsx: 'automatic' }, plugins: [{ name: 'login-state-fixture', enforce: 'pre', load(id) {
    if (id.endsWith('/platform/auth/supabase.ts')) return `export const supabase={auth:{signOut:async()=>({error:null}),signInWithOAuth:async()=>({error:null})}};`
    if (id.endsWith('/platform/auth/api.ts')) return `export const reportAuthEvent=async()=>{};`
  } }], build: { write: false, minify: false, lib: { entry: join(frontend, 'test/login-state.browser.tsx'), formats: ['iife'], name: 'LoginState' } } })
  const bundle = (Array.isArray(output) ? output : [output]).flatMap(item => item.output).find(item => item.type === 'chunk')
  const directory = await mkdtemp(join(tmpdir(), 'stellina-login-state-'))
  try {
    const page = join(directory, 'index.html')
    await writeFile(page, `<html><body><div id="root"></div><pre id="result">pending</pre><script>${bundle.code.replaceAll('</script', '<\\/script')}</script></body></html>`)
    const { stdout, stderr } = await promisify(execFile)(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(directory, 'profile')}`, '--virtual-time-budget=8000', '--dump-dom', pathToFileURL(page).href], { timeout: 70000, maxBuffer: 8 * 1024 * 1024 })
    const result = stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1]
    assert.equal(result, 'PASS: unavailable announcement; controls hidden; retry', result ?? stderr.slice(-2000))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('IAM-IDN-003: Google sign-in clears a prior local provider session before OAuth', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(join(frontend, 'src/features/authentication/Login.tsx'), 'utf8'))
  const clearIndex = source.indexOf("signOut({ scope: 'local' })")
  const oauthIndex = source.indexOf('signInWithOAuth({')
  assert.ok(clearIndex >= 0, 'Google sign-in must clear the local provider session')
  assert.ok(oauthIndex > clearIndex, 'Local provider-session clearing must precede OAuth')
})

