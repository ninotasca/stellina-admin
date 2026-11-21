import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('deployment guides match the server logging startup contract', () => {
  const guides = [read('../../README.md'), read('../LOGGING.md')]
  const server = read('../server/stellinaProxy.js')

  for (const guide of guides) {
    assert.match(guide, /`LOG_LEVEL`|LOG_LEVEL=INFO/)
    assert.match(guide, /startup|starts/)
    assert.match(guide, /redeploy|deployment/)
    assert.doesNotMatch(guide, /STELLINA_LOG_LEVEL=/)
  }

  assert.match(server, /resolveProxyLogLevel\(process\.env\.LOG_LEVEL, environment\)/)
  assert.match(server, /LOG_LEVEL must be DEBUG, INFO, WARN, or ERROR/)
})
