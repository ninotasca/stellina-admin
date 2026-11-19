import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const domains = ['commissions', 'rfp', 'site-selection', 'cvent', 'nimble', 'administration']

test('each product domain owns a typed cancellable resource without transport implementation', () => {
  for (const domain of domains) {
    const resource = source(`features/${domain}/resources.ts`)
    const api = source(`features/${domain}/api.ts`)
    assert.match(resource, /useRemoteResource/)
    assert.match(resource, /signal/)
    assert.match(resource, /:protected/)
    assert.doesNotMatch(resource + api, /axios\.create|fetch\(/)
  }
})

test('shared state and UI primitives contain no Stellina feature rules', () => {
  const state = source('platform/state/useRemoteResource.ts')
  const view = source('platform/ui/ViewState.tsx')
  assert.match(state, /AbortController/)
  assert.match(state, /invalidate/)
  assert.match(view, /loading.*empty.*unauthenticated.*forbidden.*unavailable.*validation.*conflict.*unexpected/s)
  assert.doesNotMatch(state + view, /commission|rfp|cvent|nimble|site.selection|login.attempt/i)
})

test('public and protected domain state cannot share a resource key', () => {
  for (const domain of domains) assert.match(source(`features/${domain}/resources.ts`), /:protected/)
  assert.doesNotMatch(source('features/site-selection/resources.ts'), /publicSiteSelectionApi/)
  assert.doesNotMatch(source('features/rfp/resources.ts'), /publicHotelApi/)
})

