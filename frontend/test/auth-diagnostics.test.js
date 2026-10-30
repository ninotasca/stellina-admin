import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { build } from 'vite'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('..', import.meta.url))
const entry = fileURLToPath(new URL('../src/contexts/AuthContext.tsx', import.meta.url))
const source = readFileSync(entry, 'utf8')

// Focused source enforcement includes bracket access; mutation fixtures prove detection.
function directConsoleCalls(text) {
  const file = ts.createSourceFile('AuthContext.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found = []
  const owners = new Set(['console', 'globalThis.console', 'window.console', "globalThis['console']", "window['console']"])
  const methods = new Map()
  const methodNames = ['debug', 'info', 'warn', 'error', 'log']
  function methodOf(node) {
    if (ts.isIdentifier(node)) return methods.get(node.text)
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const method = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression?.text
      if (owners.has(node.expression.getText(file)) && methodNames.includes(method)) return method
    }
  }
  function aliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        if (owners.has(node.initializer.getText(file))) owners.add(node.name.text)
        const method = methodOf(node.initializer)
        if (method) methods.set(node.name.text, method)
      } else if (ts.isObjectBindingPattern(node.name) && owners.has(node.initializer.getText(file))) {
        for (const binding of node.name.elements) {
          const method = binding.propertyName?.text ?? binding.name.text
          if (methodNames.includes(method) && ts.isIdentifier(binding.name)) methods.set(binding.name.text, method)
        }
      }
    }
    ts.forEachChild(node, aliases)
  }
  aliases(file)
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const method = methodOf(node.expression)
      if (method) found.push(method)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

test('AuthContext uses the browser adapter and direct-console mutations are detected', () => {
  assert.deepEqual(directConsoleCalls(source), [])
  assert.match(source, /import \{ clientLog \} from '\.\.\/lib\/diagnostic-core'/)
  for (const method of ['debug', 'info', 'warn', 'error', 'log']) {
    for (const call of [
      `console.${method}('fixture')`, `console['${method}']('fixture')`, `globalThis.console.${method}('fixture')`,
      `const logger = console; logger.${method}('fixture')`,
      `const logger = window.console; const chained = logger; chained['${method}']('fixture')`,
      `const emit = console.${method}; emit('fixture')`,
      `const { ${method}: emit } = globalThis.console; emit('fixture')`,
    ]) {
      assert.deepEqual(directConsoleCalls(source + '\n' + call), [method])
    }
  }
  assert.deepEqual(directConsoleCalls("clientLog('error', 'unoventi.auth.policy_failed')"), [])
  const adapter = readFileSync(new URL('../src/lib/diagnostic-core.ts', import.meta.url), 'utf8')
  assert.match(adapter, /console\[level\]\(output\)/)
})

// A deterministic hook harness runs the real provider's effects and callbacks
// without a DOM, live Supabase, or HTTP. The browser adapter remains real.
async function compiledAuth(raw = 'DEBUG', mode = 'production') {
  const output = await build({
    root, configFile: false, mode, logLevel: 'silent',
    define: {
      'import.meta.env.VITE_CLIENT_LOG_LEVEL': raw == null ? 'undefined' : JSON.stringify(raw),
      'import.meta.env.VITE_AUTH_ENABLE_MAGIC_LOGIN': '"true"',
    },
    esbuild: { jsx: 'transform' },
    plugins: [{
      name: 'isolated-auth-dependencies',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'react') return '\0test-react'
        if (id === 'axios') return '\0test-axios'
        if (id === '../services/api') return '\0test-api'
        if (id === '../services/supabase') return '\0test-supabase'
      },
      load(id) {
        if (id === '\0test-react') return `
          const h = () => globalThis.__authDiagnosticFixture;
          export const createContext = () => ({ Provider: 'provider' });
          export const useContext = () => h().value;
          export const useState = initial => {
            const f = h(), index = f.index++;
            if (!(index in f.state)) f.state[index] = initial;
            return [f.state[index], value => { f.state[index] = value; }];
          };
          export const useEffect = effect => { if (!h().mounted) h().effects.push(effect); };
          export default { createElement: (type, props) => ({ type, props }) };
        `
        if (id === '\0test-axios') return 'export default { isAxiosError: error => error?.isAxiosError === true };'
        if (id === '\0test-api') return 'export const apiClient = globalThis.__authDiagnosticFixture.api;'
        if (id === '\0test-supabase') return 'export const supabase = globalThis.__authDiagnosticFixture.supabase;'
      },
    }],
    build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
  })
  const code = (Array.isArray(output) ? output : [output]).flatMap(bundle => bundle.output).find(item => item.type === 'chunk').code
  assert.doesNotMatch(code, /createClient|ReactSharedInternals|fetch\(/)
  return code
}

let fixtureSequence = 0
async function probeAuth(code, threshold) {
  const sinks = { debug: console.debug, info: console.info, warn: console.warn, error: console.error }
  const storage = globalThis.localStorage
  const lines = []
  try {
    for (const method of Object.keys(sinks)) console[method] = line => {
      lines.push(JSON.parse(line))
      throw new Error('sink-private-canary')
    }
    async function mount({ policyFails = false, session = 'identity-fixture', rejected = false, cleanup = 'ok', logoutFails = false } = {}) {
      const store = new Map()
      globalThis.localStorage = { setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }
      const reports = [], signouts = []
      const user = { id: 'synthetic-user', is_admin: true }
      const h = {
        index: 0, state: [], effects: [], mounted: false, value: undefined, event: undefined,
        api: {
          getAuthPolicy: async () => {
            if (policyFails) throw new Error('policy-private-canary')
            return { enabled: true, providers: ['google'], magic_login: true }
          },
          exchangeSession: async () => {
            if (rejected) throw { isAxiosError: true, response: { status: 401 }, message: 'exchange-private-canary' }
            return { access_token: 'application-fixture', user }
          },
          reportAuthEvent: async (...args) => {
            reports.push(args)
            if (logoutFails && args[0] === 'logout') throw new Error('logout-private-canary')
          },
        },
        supabase: { auth: {
          getSession: async () => ({ data: { session: session ? { access_token: session } : null } }),
          onAuthStateChange: callback => {
            h.event = callback
            return { data: { subscription: { unsubscribe() {} } } }
          },
          signOut: async options => {
            signouts.push(options)
            if (cleanup === 'throws') throw new Error('signout-private-canary')
            return { error: cleanup === 'error' ? { name: 'name-private-canary' } : null }
          },
        } },
      }
      globalThis.__authDiagnosticFixture = h
      const mod = await import('data:text/javascript;base64,' + Buffer.from(code + '\n//# sourceURL=auth-diagnostic-fixture-' + fixtureSequence++ + '.js').toString('base64'))
      const render = () => {
        h.index = 0
        h.value = mod.AuthProvider({ children: null }).props.value
        return h.value
      }
      render()
      assert.equal(h.value.loading, true)
      assert.equal(h.value.policyLoading, true)
      const cleanups = h.effects.map(effect => effect())
      h.mounted = true
      await new Promise(resolve => setImmediate(resolve))
      render()
      return { h, render, store, user, reports, signouts, unmount: () => cleanups.forEach(fn => fn?.()) }
    }
    const success = await mount()
    assert.equal(success.h.value.loading, false)
    assert.equal(success.h.value.policyLoading, false)
    assert.equal(success.h.value.googleLoginEnabled, true)
    assert.equal(success.h.value.magicLoginEnabled, true)
    assert.equal(success.h.value.user, success.user)
    assert.equal(success.store.get('access_token'), 'application-fixture')
    // Initial provider callback must not exchange the session twice.
    success.h.event('INITIAL_SESSION', null)
    assert.equal(success.render().user, success.user)
    await success.h.value.logout()
    assert.equal(success.render().user, null)
    assert.equal(success.store.size, 0)
    assert.deepEqual(success.reports, [['logout']])
    assert.deepEqual(success.signouts, [{ scope: 'local' }])
    success.unmount()

    const failedPolicy = await mount({ policyFails: true, session: null })
    assert.equal(failedPolicy.h.value.policyLoading, false)
    assert.equal(failedPolicy.h.value.loading, false)
    assert.equal(failedPolicy.h.value.googleLoginEnabled, false)
    assert.equal(failedPolicy.h.value.magicLoginEnabled, false)
    await assert.rejects(failedPolicy.h.value.magicLogin(), /Magic Login is disabled/)
    failedPolicy.unmount()

    for (const cleanup of ['ok', 'error', 'throws']) {
      const rejected = await mount({ rejected: true, cleanup })
      assert.equal(rejected.h.value.user, null)
      assert.equal(rejected.h.value.loading, false)
      assert.equal(rejected.store.size, 0)
      assert.deepEqual(rejected.reports, [['auth_error', 'session_restore_failed']])
      assert.deepEqual(rejected.signouts, [{ scope: 'local' }])
      rejected.unmount()
    }
    const failedLogout = await mount({ logoutFails: true })
    await failedLogout.h.value.logout()
    assert.equal(failedLogout.render().user, null)
    assert.equal(failedLogout.store.size, 0)
    assert.deepEqual(failedLogout.reports, [['logout']])
    failedLogout.unmount()
    assert.ok(lines.some(line => line.event === 'unoventi.auth.policy_failed'))
    assert.ok(lines.some(line => line.event === 'unoventi.auth.logout_failed'))
    assert.ok(lines.some(line => line.event === 'unoventi.auth.policy_failed' && line.level === 'error'))
    assert.equal(lines.some(line => line.event === 'unoventi.auth.rejected_session_clear_failed'), threshold !== 'error')
    assert.ok(lines.filter(line => line.event === 'unoventi.auth.rejected_session_clear_failed').every(line => line.level === 'warn'))
    assert.ok(lines.filter(line => line.event === 'unoventi.auth.rejected_session_cleared').every(line => line.level === 'info'))
    assert.doesNotMatch(JSON.stringify(lines), /canary|identity-fixture|application-fixture|synthetic-user/)
  } finally {
    Object.assign(console, sinks)
    if (storage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = storage
    delete globalThis.__authDiagnosticFixture
  }
}

test('policy, restoration, cleanup and logout retain behavior with failing diagnostics', async () => {
  await probeAuth(await compiledAuth(), 'debug')
})

test('actual Vite configuration rejects invalid levels before staging or production artifact generation', async t => {
  const previous = process.env.VITE_CLIENT_LOG_LEVEL
  const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))
  const adapterEntry = fileURLToPath(new URL('../src/lib/diagnostic-core.ts', import.meta.url))
  try {
    for (const mode of ['development', 'staging', 'production']) {
      for (const raw of ['', 'WARNING', 'toString', 'private-invalid-canary']) {
        process.env.VITE_CLIENT_LOG_LEVEL = raw
        let started = false, generated = false
        await assert.rejects(build({
          root, configFile, mode, logLevel: 'silent',
          plugins: [{
            name: 'observe-artifact-generation',
            buildStart() { started = true },
            generateBundle() { generated = true },
          }],
          build: { write: false, lib: { entry: adapterEntry, formats: ['es'] } },
        }), { message: 'VITE_CLIENT_LOG_LEVEL must be DEBUG, INFO, WARN, or ERROR' })
        assert.equal(started, false)
        assert.equal(generated, false)
      }
      for (const raw of [undefined, 'DEBUG', 'info', ' wArN ', 'ERROR']) {
        if (raw === undefined) delete process.env.VITE_CLIENT_LOG_LEVEL
        else process.env.VITE_CLIENT_LOG_LEVEL = raw
        const output = await build({
          root, configFile, mode, logLevel: 'silent',
          build: { write: false, minify: false, lib: { entry: adapterEntry, formats: ['es'] } },
        })
        const code = (Array.isArray(output) ? output : [output]).flatMap(bundle => bundle.output).find(item => item.type === 'chunk').code
        const { resolveClientLogLevel } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
        assert.equal(resolveClientLogLevel(raw, mode), raw === undefined
          ? ({ development: 'debug', staging: 'warn', production: 'error' })[mode]
          : raw.trim().toLowerCase())
      }
      t.diagnostic(mode + ': actual Vite config rejected all four invalid levels before buildStart/generateBundle; missing and four canonical levels built in memory')
    }
  } finally {
    if (previous === undefined) delete process.env.VITE_CLIENT_LOG_LEVEL
    else process.env.VITE_CLIENT_LOG_LEVEL = previous
  }
})

test('independent privacy-safe browser forward recovery restores retained compiled thresholds and auth behavior', async t => {
  // The pinned baseline has raw exception output. Recover with a bounded safe
  // forward artifact instead; retain its compiled bytes independently of admin.
  const baseline = execFileSync('git', ['-C', root, 'show',
    '9b1e04393571282d00cb07833141a06969c64c5c:frontend/src/contexts/AuthContext.tsx'], { encoding: 'utf8' })
  assert.match(baseline, /console\.(log|warn|error)/)
  const staging = await compiledAuth(null, 'staging')
  const recovery = await compiledAuth('WARN')
  const candidate = await compiledAuth(null)
  await probeAuth(staging, 'warn')
  await probeAuth(recovery, 'warn')
  await probeAuth(candidate, 'error')
  const invalid = await compiledAuth('INVALID')
  try {
    globalThis.__authDiagnosticFixture = { api: {}, supabase: {} }
    await assert.rejects(import('data:text/javascript;base64,' + Buffer.from(invalid).toString('base64')), /VITE_CLIENT_LOG_LEVEL must be/)
  } finally { delete globalThis.__authDiagnosticFixture }
  await probeAuth(recovery, 'warn')
  const digest = code => createHash('sha256').update(code).digest('hex')
  t.diagnostic('Stellina independent forward recovery: baseline 9b1e043; recovery WARN sha256=' + digest(recovery) + '; candidate production ERROR sha256=' + digest(candidate) + '; retained recovery bytes restored after invalid replacement; policy/session/logout/reporting and privacy probes passed')
})
