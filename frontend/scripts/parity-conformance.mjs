import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map(value => value.split('=', 2)))
const root = resolve(args['--root'] ?? '.')
const flavor = args['--flavor']
if (!['stellina', 'unoventi'].includes(flavor)) throw new Error('Use --flavor=stellina or --flavor=unoventi')
const frontend = resolve(root, 'frontend')
const read = path => readFileSync(resolve(frontend, path), 'utf8')
const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value)
const digest = value => createHash('sha256').update(stable(value)).digest('hex')
const canonical = JSON.parse(readFileSync(new URL('../test/contracts/platform-parity-v1.json', import.meta.url), 'utf8'))

const paths = flavor === 'stellina' ? {
  authTypes: 'src/domain/auth.ts', authApi: 'src/platform/auth/api.ts', authContract: 'test/contracts/auth-policy.json', routes: 'src/app/routes.tsx',
} : {
  authTypes: 'src/domain/auth/types.ts', authApi: 'src/platform/auth/api.ts', authContract: 'tests/contracts/auth-policy.json', routes: 'src/app/routes.tsx',
}
const authTypes = read(paths.authTypes)
const authApi = read(paths.authApi)
const provider = read('src/platform/auth/supabase.ts')
const state = read('src/platform/state/useRemoteResource.ts')
const view = read('src/platform/ui/ViewState.tsx')
const routes = read(paths.routes)
const authContract = JSON.parse(read(paths.authContract))
const has = (source, token) => source.includes(token)
const checks = {
  auth_statuses: canonical.auth_statuses.filter(value => !has(authTypes, `'${value}'`)),
  auth_operations: canonical.auth_operations.filter(value => !has(authApi, `/browser-session/`) || !has(authApi, value === 'logout' ? 'logoutBrowserSession' : `${value}BrowserSession`)),
  state_kinds: canonical.state_kinds.filter(value => !has(view, `'${value}'`)),
  state_operations: canonical.state_operations.filter(value => ({ abort: /AbortController/.test(state), refetch: /refetch/.test(state), invalidate: /invalidate/.test(state), retain_data_on_error: /data:\s*current\.data/.test(state) })[value] !== true),
  provider_requirements: canonical.provider_requirements.filter(value => !new RegExp(value.replace(':', ':\\s*')).test(provider)),
  accessibility_requirements: canonical.accessibility_requirements.filter(value => !has(view, value)),
}
const failures = Object.entries(checks).filter(([, missing]) => missing.length).map(([name, missing]) => ({ name, missing }))
const operations = { auth: canonical.auth_operations, state: canonical.state_operations }
const result = {
  version: canonical.version, flavor, root, pass: failures.length === 0, failures,
  digests: { canonical: digest(canonical), auth_schema: digest(authContract), operations: digest(operations) },
  route_declarations: [...routes.matchAll(/<Route\s+path=/g)].length,
  public_routes: [...routes.matchAll(/path=["']([^"']+)["']/g)].map(match => match[1]).filter(path => /sign|register|password|auth\/callback|hotel-response|site-selection\/:guid/.test(path)),
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (!result.pass) process.exitCode = 1

