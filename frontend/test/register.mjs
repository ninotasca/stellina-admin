// Node >=22.15: run the actual TypeScript services without another test framework.
import { registerHooks } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import ts from 'typescript'

globalThis.__STELLINA_PUBLIC_CONFIG__ = {
  manifest: {
    schemaVersion: 1, applicationId: 'stellina-admin',
    api: { owner: 'unoventi-api', productNamespace: 'stellina', coreCapabilities: ['auth'] },
    auth: { siteKey: 'stellina' },
    branding: { displayName: 'Stellina Admin', logoPath: '/brand/stellina-logo-black.png', postLoginPath: '/dashboard' },
  },
  environment: 'development', clientLogLevel: 'debug', apiBaseUrl: '/api/v1',
  siteId: 'd38ebee3-f29d-42ac-ae53-5d20d1bf7fde',
  supabaseUrl: 'https://qcpklgptamrrlmqrhfmt.supabase.co',
  supabasePublishableKey: 'sb_publishable_test_fixture_key_1234567890',
  switches: { showBuildInfo: true, enableMagicLoginUi: true, includeTestBookings: false },
  registryRevision: 'test', buildVersion: 'test',
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts') && !url.includes('/node_modules/')) {
      const source = readFileSync(new URL(url), 'utf8')
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText }
    }
    return nextLoad(url, context)
  },
})
