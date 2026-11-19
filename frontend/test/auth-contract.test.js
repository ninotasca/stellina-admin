import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAuthPolicy } from '../src/platform/auth/policy.ts'
import { validPolicy } from './auth-fixtures.js'

const contract = JSON.parse(readFileSync(new URL('./contracts/auth-policy.json', import.meta.url), 'utf8'))
const api = process.env.UNOVENTI_API_ROOT ?? fileURLToPath(new URL('../../../unoventi-api-m2-reference-3a108b1/', import.meta.url))

test('shared M2 auth contract digest matches the pinned Core/API sources', () => {
  for (const [path, digest] of Object.entries(contract.sources)) {
    const actual = createHash('sha256').update(readFileSync(resolve(api, path))).digest('hex')
    assert.equal(actual, digest, `Canonical contract drift in ${path}`)
  }
})

function example(schema) {
  assert.ok(Object.keys(schema).every(key => ['type', 'enum', 'anyOf', 'items', 'properties', 'required', 'format', 'minimum', 'maximum', 'default', 'title', 'maxLength', 'minLength', 'pattern', 'maxItems', 'minItems'].includes(key)))
  if (schema.enum) return schema.enum[0]
  if (schema.anyOf) return example(schema.anyOf[0])
  if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, example(value)]))
  if (schema.type === 'array') return [example(schema.items)]
  if (schema.type === 'string') return schema.format === 'uuid' ? '12345678-1234-1234-1234-123456789abc' : validPolicy.site_key
  if (schema.type === 'integer') return schema.minimum ?? 5
  if (schema.type === 'boolean') return true
  if (schema.type === 'null') return null
  throw new Error('Review unsupported canonical schema type')
}

test('Stellina decoder accepts the shared canonical response surface and duration bounds', () => {
  const schema = contract.schemas.PublicAuthConfig, update = contract.schemas.AuthPolicyUpdate
  const candidate = example(schema)
  candidate.site_key = 'stellina'
  assert.deepEqual(Object.keys(parseAuthPolicy(candidate, 'stellina')).sort(), Object.keys(schema.properties).sort())
  for (const key of ['session_max_age_minutes', 'session_inactivity_minutes', 'session_resume_after_minutes']) {
    const bounds = update.properties[key]
    for (const value of [bounds.minimum, bounds.maximum]) assert.equal(parseAuthPolicy({ ...validPolicy, [key]: value }, 'stellina')[key], value)
    for (const value of [bounds.minimum - 1, bounds.maximum + 1, bounds.minimum + 0.5]) assert.throws(() => parseAuthPolicy({ ...validPolicy, [key]: value }, 'stellina'))
  }
})
