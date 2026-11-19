import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('local Core proxy preserves the browser host for exact-origin session CSRF checks', () => {
  const source = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')
  assert.match(source, /\^\/api\/v1\/\(stellina\|core\)/)
  assert.match(source, /changeOrigin:\s*false/)
  assert.doesNotMatch(source, /changeOrigin:\s*true/)
})
