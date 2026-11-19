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
test('real browser preserves the portable Stellina auth lifecycle', { timeout: 90000 }, async () => {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean)
  let chrome
  for (const candidate of candidates) try { await access(candidate); chrome = candidate; break } catch { /* next */ }
  assert.ok(chrome, 'Installed Chrome/Chromium required')
  const config = { environment: 'development', clientLogLevel: 'debug', apiBaseUrl: '/api/v1', buildVersion: 'test', registryRevision: 'test', siteId: 'fixture',
    manifest: { schemaVersion: 1, applicationId: 'stellina-admin', api: { owner: 'unoventi-api', productNamespace: 'stellina', coreCapabilities: ['auth'] }, auth: { siteKey: 'stellina' }, branding: { displayName: 'Stellina Admin', logoPath: '/brand/stellina-logo-black.png', postLoginPath: '/dashboard' } },
    supabaseUrl: 'https://fixture.invalid', supabasePublishableKey: 'sb_publishable_fixture_0000000000', switches: { showBuildInfo: false, enableMagicLoginUi: false, includeTestBookings: false } }
  const output = await build({ root: frontend, configFile: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"', __STELLINA_PUBLIC_CONFIG__: JSON.stringify(config) }, esbuild: { jsx: 'automatic' },
    plugins: [{ name: 'portable-auth-fixture', enforce: 'pre', load(id) {
      if (id.endsWith('/platform/auth/config.ts')) return `export const authConfig={siteId:'stellina',magicLogin:false,postLoginPath:'/dashboard'};`
      if (id.endsWith('/platform/auth/supabase.ts')) return `const h=()=>window.__authHarness; export const supabase={auth:{onAuthStateChange:(callback)=>{h().providerCallback=callback;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({error:null})}}; export const providerProofAdapter={subscribeProof:listener=>{h().providerCallback=(event,session)=>{if(session?.access_token)listener(session.access_token)};return()=>{}},clearLocal:async()=>{}}; export const sessionToken=session=>session?.access_token??null;`
      if (id.endsWith('/platform/auth/api.ts')) return `const h=()=>window.__authHarness; export const authBackend={fetchPolicy:()=>h().fetchPolicy(),restore:()=>h().restore(),exchange:proof=>h().exchange(proof),refresh:csrf=>h().refreshSession(csrf),logout:csrf=>h().logout(csrf),requestMagicLogin:async()=>(await h().magicLogin()).access_token}; export const reportAuthEvent=async()=>{};`
      if (id.endsWith('/platform/diagnostics/index.ts')) return `export const clientLog=(...values)=>window.__authHarness?.logs?.push(values); export const diagnosticError=(error,fallback)=>({message:error?.message||fallback,status:error?.status||0,errorClass:'Error',correlationId:null});`
    } }], build: { write: false, minify: false, lib: { entry: join(frontend, 'test/auth-lifecycle.browser.tsx'), formats: ['iife'], name: 'AuthLifecycle' } } })
  const bundle = (Array.isArray(output) ? output : [output]).flatMap(item => item.output).find(item => item.type === 'chunk')
  const directory = await mkdtemp(join(tmpdir(), 'stellina-auth-lifecycle-'))
  try {
    const page = join(directory, 'index.html')
    await writeFile(page, `<html><body><div id="root"></div><pre id="result">pending</pre><script>${bundle.code.replaceAll('</script', '<\\/script')}</script></body></html>`)
    const { stdout, stderr } = await promisify(execFile)(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(directory, 'profile')}`, '--virtual-time-budget=15000', '--dump-dom', pathToFileURL(page).href], { timeout: 70000, maxBuffer: 8 * 1024 * 1024 })
    const result = stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1]
    assert.equal(result, 'PASS: restore once; route continuity; exchange; state distinctions; generation safety; logout; no persistence', result ?? stderr.slice(-2000))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
