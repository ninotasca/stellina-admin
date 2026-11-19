import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const pages = { RFPForm: 'save_failed', HotelInvitations: 'invitations_load_failed', ResponseComparison: 'responses_load_failed' }

// Run real pages, API clients, bearer interceptors, error normalization and
// diagnostics. Only rendering/router and rich-text UI are replaced.
async function compile(page, contained = false, unsafe = false) {
  const output = await build({
    root, configFile: false, mode: 'production', logLevel: 'silent',
    esbuild: { jsx: 'transform' },
    plugins: [{
      name: 'rfp-page-fixture', enforce: 'pre',
      resolveId(id) {
        if (id.endsWith('/fixture-entry')) return '\0entry'
        if (id === 'axios') return '\0axios'
        if (id === 'react') return '\0react'
        if (id === 'react-router-dom') return '\0router'
        if (id.endsWith('/RichTextInput')) return '\0richtext'
        if (id === '../commissions/index' || id.endsWith('/features/commissions/index')) return '\0commissions'
        if ((contained || unsafe) && (id.endsWith('/diagnostics') || id.endsWith('/diagnostics.ts'))) return '\0contained'
      },
      load(id) {
        if (id === '\0axios') return `import axios from ${JSON.stringify(`${root}/node_modules/axios/index.js`)};
          export * from ${JSON.stringify(`${root}/node_modules/axios/index.js`)};
          axios.defaults.adapter = config => globalThis.__rfpFixture.adapter(config); export default axios;`
        if (id === '\0entry') return `export { default as Page } from ${JSON.stringify(`${root}/src/features/rfp/${page}.tsx`)}; export { default as axios } from 'axios'; export { logRfpFailure } from ${JSON.stringify(`${root}/src/features/rfp/diagnostics.ts`)};`
        if (id === '\0react') return `
          const h = () => globalThis.__rfpFixture;
          export const useState = initial => {
            const f = h(), i = f.index++;
            if (!(i in f.state)) f.state[i] = initial;
            return [f.state[i], value => { f.state[i] = value; }];
          };
          export const useEffect = effect => { if (!h().mounted) h().effects.push(effect); };
          export default { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
        `
        if (id === '\0router') return `export const useParams = () => globalThis.__rfpFixture.params;
          export const useNavigate = () => path => globalThis.__rfpFixture.navigation.push(path);`
        if (id === '\0richtext') return 'export default function RichTextInput() {}'
        if (id === '\0commissions') return `export { commissionApi } from ${JSON.stringify(`${root}/src/features/commissions/api.ts`)};`
        // Exercise containment and an unsafe raw-error regression through real page handlers.
        if (id === '\0contained') return unsafe
          ? 'export function logRfpFailure(event, error) { console.error(error); }'
          : 'export function logRfpFailure() {}'
      },
    }],
    build: { write: false, minify: false, lib: { entry: `${root}/fixture-entry`, formats: ['es'] } },
  })
  const code = (Array.isArray(output) ? output : [output]).flatMap(bundle => bundle.output).find(item => item.type === 'chunk').code
  return import('data:text/javascript;base64,' + Buffer.from(code + `\n//# sourceURL=rfp-${page}-${contained}-${unsafe}.js`).toString('base64'))
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return [tree]
  return [tree, ...nodes(tree.props?.children)]
}
const settle = () => new Promise(resolve => setImmediate(resolve))

async function probe(mod, page, { status = 401, stage = 'rfp', edit = false, contained = false, throwingSink = false } = {}) {
  const methods = ['debug', 'info', 'warn', 'error', 'log', 'trace', 'dir', 'table']
  const sinks = Object.fromEntries(methods.map(method => [method, console[method]]))
  // Preserve the property without invoking Node's experimental storage getter.
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const lines = [], requests = []
  const canary = 'synthetic-rfp-private-canary'
  const event = { id: 'event-fixture', meeting_name: 'Meeting', hotels_considered: [] }
  const rfp = { id: 'rfp-fixture', event_id: event.id, rfp_type: 'Standard', display_name: 'Meeting', room_nights: [], meeting_rooms: [], custom_questions: [] }
  const f = { index: 0, state: [], effects: [], mounted: false, navigation: [],
    params: page === 'RFPForm' ? (edit ? { id: rfp.id } : { eventId: event.id }) : { rfpId: rfp.id }, saving: false }
  globalThis.__rfpFixture = f
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true, value: { getItem: () => canary },
  })
  f.adapter = async config => {
    requests.push(config)
    const fails = page === 'RFPForm' ? f.saving :
      stage === 'rfp' ? config.url === `/rfps/${rfp.id}` :
      stage === 'event' ? config.url === `/commissions/events/${event.id}` : config.url.includes(page === 'HotelInvitations' ? 'invitations' : 'responses')
    if (fails) {
      const response = status === null ? undefined : { status, data: { detail: canary }, headers: { private: canary }, config }
      const error = new mod.axios.AxiosError(canary, status === null ? 'ERR_NETWORK' : 'ERR_BAD_RESPONSE', config, { private: canary }, response)
      error.name = canary
      error.stack = canary
      error.cause = { private: canary }
      throw error
    }
    const data = (config.url.endsWith('/attachments') || config.url.startsWith('/hotel-invitations/')) ? [] : config.url.includes('/commissions/') ? event : rfp
    return { status: 200, data, headers: {}, config }
  }
  try {
    for (const method of methods) console[method] = (...args) => {
      lines.push([method, args])
      if (throwingSink) throw new Error('synthetic sink failure')
    }
    const render = () => { f.index = 0; return mod.Page() }
    render()
    f.effects.forEach(effect => effect())
    f.mounted = true
    await settle()
    let tree = render()
    if (page === 'RFPForm') {
      f.saving = true
      const save = nodes(tree).find(node => node?.type === 'button' && nodes(node).includes(edit ? 'Update RFP' : 'Create RFP'))
      assert.ok(save, 'real save handler is available')
      await save.props.onClick()
      tree = render()
      const expected = status === null ? 'Stellina could not reach the data service. Please try again.' :
        status === 401 ? 'Please sign in again.' : status === 403 ? 'You do not have permission to perform this action.' : 'The Stellina data service is unavailable. Please try again.'
      assert.ok(nodes(tree).includes(expected), 'existing safe error UI remains visible')
      assert.ok(nodes(tree).includes(edit ? 'Update RFP' : 'Create RFP'), 'saving state cleared')
      assert.deepEqual(f.navigation, [])
    } else {
      assert.ok(nodes(tree).includes('RFP not found'), 'existing unavailable UI remains visible and loading clears')
    }
    assert.ok(requests.length > 0)
    assert.ok(requests.every(config => config.headers.Authorization === `Bearer ${canary}`), 'requests carry synthetic authentication')
    assert.equal(JSON.stringify(lines).includes(canary), false, 'no credential or arbitrary error surface reaches console')
    assert.equal(JSON.stringify(lines).includes('Authorization'), false, 'no Authorization header reaches console')
    if (contained) assert.deepEqual(lines, [])
    else {
      assert.equal(lines.length, 1)
      const [method, args] = lines[0]
      assert.equal(method, 'error')
      assert.equal(args.length, 1)
      const diagnostic = JSON.parse(args[0])
      assert.equal(diagnostic.event, `stellina.rfp.${pages[page]}`)
      assert.equal(diagnostic.component, 'rfp')
      assert.equal(diagnostic.error_class, status === null ? 'NetworkError' : 'HttpError')
      assert.equal(diagnostic.status, status ?? undefined)
      assert.equal(diagnostic.environment, 'production')
      assert.equal(diagnostic.level, 'error')
      assert.equal(diagnostic.service, 'stellina-admin-web')
      assert.equal(diagnostic.site_key, 'stellina')
      assert.equal(diagnostic.message, {
        RFPForm: 'Failed to save RFP',
        HotelInvitations: 'Failed to load hotel invitations',
        ResponseComparison: 'Failed to load response comparison',
      }[page])
      assert.ok(Number.isFinite(Date.parse(diagnostic.timestamp)))
      assert.deepEqual(Object.keys(diagnostic).sort(), [
        'timestamp', 'level', 'message', 'service', 'environment', 'component', 'event', 'site_key', 'error_class',
        ...(status === null ? [] : ['status']),
      ].sort())
    }
  } finally {
    Object.assign(console, sinks)
    if (previousStorage === undefined) delete globalThis.localStorage
    else Object.defineProperty(globalThis, 'localStorage', previousStorage)
    delete globalThis.__rfpFixture
  }
}
for (const page of Object.keys(pages)) {
  test(`${page}: authenticated failures preserve safe diagnostics and UI without leaking credentials`, async () => {
    const source = readFileSync(new URL(`../src/features/rfp/${page}.tsx`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\bconsole\s*(?:\.|\[)/)
    const mod = await compile(page)
    for (const status of [401, 403, 500, null]) {
      for (const stage of page === 'RFPForm' ? ['create', 'edit'] : ['rfp', 'event', 'related']) {
        await probe(mod, page, { status, stage, edit: stage === 'edit' })
      }
    }
    await probe(mod, page, { throwingSink: true })
    if (page === 'RFPForm') {
      const sink = console.error, lines = []
      try {
        console.error = (...args) => lines.push(args)
        for (const error of [null, 'synthetic-private-canary', new Error('synthetic-private-canary')]) {
          mod.logRfpFailure('stellina.rfp.save_failed', error)
          assert.equal(JSON.parse(lines.at(-1)[0]).error_class, 'UnknownError')
        }
        for (const status of ['synthetic-private-canary', NaN, Infinity, 99, 600, 401.5]) {
          mod.logRfpFailure('stellina.rfp.save_failed', { isAxiosError: true, response: { status } })
          assert.equal('status' in JSON.parse(lines.at(-1)[0]), false)
        }
        assert.equal(JSON.stringify(lines).includes('synthetic-private-canary'), false)
        const hostile = Object.defineProperty({}, 'isAxiosError', { get() { throw new Error('synthetic-private-canary') } })
        assert.doesNotThrow(() => mod.logRfpFailure('stellina.rfp.save_failed', hostile))
      } finally { console.error = sink }
    }
  })
  test(`${page}: unsafe raw-error logging mutation is rejected by the page failure probe`, async () => {
    const unsafe = await compile(page, false, true)
    await assert.rejects(probe(unsafe, page), /no credential or arbitrary error surface reaches console/)
  })
  test(`${page}: forward containment disables diagnostics and retains failure behavior`, async () => {
    await probe(await compile(page, true), page, { contained: true })
  })
}
