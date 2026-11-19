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
test('real browser standardizes remote state, invalidation and cancellation', { timeout: 90000 }, async () => {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean)
  let chrome
  for (const candidate of candidates) try { await access(candidate); chrome = candidate; break } catch { /* next */ }
  assert.ok(chrome, 'Installed Chrome/Chromium required')
  const output = await build({ root: frontend, configFile: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' }, esbuild: { jsx: 'automatic' }, build: { write: false, minify: false, lib: { entry: join(frontend, 'test/state-lifecycle.browser.tsx'), formats: ['iife'], name: 'StateLifecycle' } } })
  const bundle = (Array.isArray(output) ? output : [output]).flatMap(item => item.output).find(item => item.type === 'chunk')
  const directory = await mkdtemp(join(tmpdir(), 'stellina-state-lifecycle-'))
  try {
    const page = join(directory, 'index.html')
    await writeFile(page, `<html><body><div id="root"></div><pre id="result">pending</pre><script>${bundle.code.replaceAll('</script', '<\\/script')}</script></body></html>`)
    const { stdout, stderr } = await promisify(execFile)(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(directory, 'profile')}`, '--virtual-time-budget=10000', '--dump-dom', pathToFileURL(page).href], { timeout: 70000, maxBuffer: 8 * 1024 * 1024 })
    const result = stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1]
    assert.equal(result, 'PASS: loading; ready; invalidate; retained failure; retry; cancellation; empty', result ?? stderr.slice(-2000))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

