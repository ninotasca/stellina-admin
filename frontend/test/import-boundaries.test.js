import test from 'node:test'
import assert from 'node:assert/strict'
import { checkBoundaries, readSources } from '../scripts/check-import-boundaries.js'
import { fileURLToPath } from 'node:url'

const permitted = {
  'domain/identity.ts': 'export type Identity = { id: string }',
  'platform/session.ts': "import type { Identity } from '../domain/identity'; export type Session = Identity",
  'features/one/index.ts': "export { page } from './page'",
  'features/one/page.ts': "import type { Session } from '../../platform/session'; export const page = (s: Session) => s.id",
  'features/two/index.ts': "export { page } from '../one'",
  'app/routes.ts': "export { page } from '../features/two'",
}
test('real source and permitted domain, cross-feature public and app edges pass', () => {
  assert.deepEqual(checkBoundaries(permitted), [])
  assert.deepEqual(checkBoundaries(readSources(fileURLToPath(new URL('../src/', import.meta.url)))), [])
})
for (const [name, file, code, message] of [
  ['platform reverse', 'platform/bad.ts', "import '../features/one'", /Platform cannot import/],
  ['feature reverse', 'features/two/bad.ts', "import '../../app/routes'", /reverse dependency/],
  ['private feature', 'features/two/bad.ts', "export * from '../one/page'", /public entry point/],
  ['app private dynamic', 'app/bad.ts', "const Page = lazy(() => import('../features/one/page'))", /public entry point/],
  ['type edge', 'features/two/bad.ts', "type T = import('../one/page').Page", /public entry point/],
  ['domain reverse', 'domain/bad.ts', "import '../platform/session'", /Pure domain cannot import/],
  ['domain package', 'domain/bad.ts', "import React from 'react'", /domain accepts only local pure contracts/],
  ['browser impurity', 'domain/bad.ts', 'export const read = () => window.localStorage.getItem("key")', /Domain purity/],
  ['IO impurity', 'domain/bad.ts', 'export const read = () => fetch("/api")', /Domain purity/],
  ['node impurity', 'domain/bad.ts', 'export const read = () => process.cwd()', /Domain purity/],
  ['dynamic path', 'features/two/bad.ts', 'const p = "../one/page"; import(p)', /literal path/],
  ['unowned', 'lib/bad.ts', 'export const x = 1', /no owner/],
  ['app behavior', 'app/bad.ts', 'const state = useState(0)', /App contains behavior/],
  ['direct console', 'features/one/bad.ts', 'console.error("private")', /platform diagnostics adapter/],
  ['direct fetch', 'features/one/bad.ts', 'fetch("/api/v1/core/private")', /platform transport/],
]) test(`rejects ${name} with actionable source path`, () => {
  const errors = checkBoundaries({ ...permitted, [file]: code })
  assert.ok(errors.some(error => error.startsWith(`${file}:`) && message.test(error)), errors.join('\n'))
})

test('the diagnostics adapter exclusively owns browser console sinks', () => {
  assert.deepEqual(checkBoundaries({
    'platform/lib/diagnostic-core.ts': 'console.error("bounded adapter output")',
    'platform/diagnostics/index.ts': "export * from '../lib/diagnostic-core'",
  }), [])
})

test('only the platform transport and provider adapter own direct fetch', () => {
  assert.deepEqual(checkBoundaries({
    'platform/http/index.ts': 'fetch("/api")',
    'platform/auth/supabase.ts': 'fetch("/auth/v1/settings")',
  }), [])
})
test('alias resolution cannot bypass public entry points', () => {
  assert.match(checkBoundaries({ ...permitted, 'features/two/bad.ts': "import '@one/page'" }, { paths: { '@one/*': ['features/one/*'] } }).join('\n'), /public entry point/)
})
test('domain cycles include the dependency chain', () => {
  assert.match(checkBoundaries({ 'domain/a.ts': "export * from './b'", 'domain/b.ts': "export * from './a'" }).join('\n'), /domain\/a.ts -> domain\/b.ts -> domain\/a.ts/)
})
test('shared boundary failure is contained and restoring source recovers', () => {
  const broken = { ...permitted, 'platform/session.ts': "import '../features/one'; export type Session = { id: string }" }
  assert.match(checkBoundaries(broken).join('\n'), /platform\/session.ts: Platform cannot import/)
  assert.deepEqual(checkBoundaries(permitted), [])
})

test('unresolved configured aliases fail closed', () => {
  assert.match(checkBoundaries({ ...permitted, 'platform/bad.ts': "import '@feature/missing'" }, { paths: { '@feature/*': ['features/one/*'] } }).join('\n'), /platform\/bad.ts: Cannot resolve/)
})

for (const eager of [false, true]) {
  for (const [name, file, dependency] of [
    ['platform to feature', 'platform/glob.ts', '../features/one/page.ts'],
    ['cross-feature private', 'features/two/glob.ts', '../one/page.ts'],
  ]) test(`rejects ${name} ${eager ? 'eager' : 'lazy'} glob with actionable source path`, () => {
    const code = `const modules = import.meta.glob('${dependency}', { eager: ${eager} })`
    const errors = checkBoundaries({ ...permitted, [file]: code })
    assert.ok(errors.some(error => error.startsWith(`${file}:`) &&
      error.includes('import.meta.glob is not permitted') && error.includes('explicit literal imports')), errors.join('\n'))
  })
}

for (const code of [
  "import.meta['glob']('../features/one/page.ts')",
  'const glob = import.meta.glob; glob("../features/one/page.ts")',
  'const key = "glob"; import.meta[key]("../features/one/page.ts")',
]) test(`rejects indirect glob access: ${code}`, () => {
  assert.match(checkBoundaries({ ...permitted, 'platform/glob.ts': code }).join('\n'),
    /platform\/glob.ts: import.meta.glob is not permitted/)
})

for (const extension of ['js', 'jsx']) {
  test(`pure ${extension} domain contracts pass semantic checking`, () => {
    assert.deepEqual(checkBoundaries({
      [`domain/value.${extension}`]: 'export const value = 1',
      'domain/public.ts': `export { value } from './value.${extension}'`,
    }), [])
  })
  for (const [name, code] of [
    ['browser', 'export const read = () => window.localStorage.getItem("key")'],
    ['IO', 'export const read = () => fetch("/api")'],
    ['Node', 'export const read = () => process.cwd()'],
    ['React', 'export const view = () => React.createElement("div")'],
  ]) test(`rejects ${name} impurity in ${extension} domain with actionable source path`, () => {
    assert.match(checkBoundaries({ [`domain/bad.${extension}`]: code }).join('\n'),
      new RegExp(`domain/bad\\.${extension}: Domain purity`))
  })
}

test('domain JSX cannot acquire an ambient rendering runtime', () => {
  assert.match(checkBoundaries({ 'domain/bad.jsx': 'export const view = () => <div />' }).join('\n'),
    /domain\/bad.jsx: Domain purity/)
})

test('fileless domain compilation failures are reported rather than discarded', () => {
  assert.match(checkBoundaries({ 'domain/value.ts': 'export const value = 1' }, { noLib: true }).join('\n'),
    /domain\/value.ts: Domain purity compilation:/)
})

const styles = {
  'platform/base.css': ':root { color: black }',
  'features/one/private.css': '.one { color: blue }',
}
for (const [name, wrap] of [
  ['quoted', value => `"${value}"`],
  ['single quoted URL', value => `url('${value}')`],
  ['double quoted URL', value => `url("${value}")`],
  ['unquoted URL', value => `url(${value})`],
  ['whitespace URL', value => `url( \n ${value}\t )`],
  ['comment separated URL', value => `/* comment */ URL( /* comment */ ${value} /* comment */ )`],
]) {
  test(`permits platform and same-feature stylesheet imports: ${name}`, () => {
    assert.deepEqual(checkBoundaries({ ...styles,
      'platform/theme.css': `@import ${wrap('./base.css')};`,
      'features/one/theme.css': `@import ${wrap('./private.css')};`,
    }), [])
  })
  for (const [file, target, message] of [
    ['platform/bad.css', '../features/one/private.css', /Platform cannot import/],
    ['features/two/bad.css', '../one/private.css', /public entry point/],
  ]) test(`rejects forbidden stylesheet edge in ${file}: ${name}`, () => {
    const errors = checkBoundaries({ ...styles, [file]: `@import ${wrap(target)} screen;` })
    assert.ok(errors.some(error => error.startsWith(`${file}:`) && message.test(error)), errors.join('\n'))
  })
}
