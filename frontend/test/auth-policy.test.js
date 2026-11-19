import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAuthPolicy } from '../src/platform/auth/policy.ts'
import { validPolicy } from './auth-fixtures.js'

test('Stellina closed-site policy is copied and malformed or foreign policy fails closed', () => {
  const parsed = parseAuthPolicy(validPolicy, 'stellina')
  assert.deepEqual(parsed, validPolicy)
  assert.notEqual(parsed, validPolicy)
  assert.notEqual(parsed.providers, validPolicy.providers)
  for (const candidate of [
    null, [], {}, { ...validPolicy, site_key: 'unoventi-admin' },
    { ...validPolicy, providers: ['google', 'google'] }, { ...validPolicy, providers: ['unknown'] },
    { ...validPolicy, registration: 'open', session_max_age_minutes: 4 },
    ...Object.keys(validPolicy).map(key => Object.fromEntries(Object.entries(validPolicy).filter(([field]) => field !== key))),
  ]) assert.throws(() => parseAuthPolicy(candidate, 'stellina'), { message: 'Invalid authentication policy.' })
})

test('enabled and disabled policies are distinct and retain session boundaries', () => {
  for (const enabled of [true, false]) {
    const policy = { ...validPolicy, enabled, providers: enabled ? ['google'] : [] }
    assert.equal(parseAuthPolicy(policy, 'stellina').enabled, enabled)
  }
})
