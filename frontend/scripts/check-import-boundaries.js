import ts from 'typescript'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css']
const owner = file => file.split('/')[0]
const feature = file => file.split('/')[1]
const isTest = file => /\.test\.[^.]+$/.test(file)

// Use the TypeScript resolver so aliases and directory imports obey exactly the
// same ownership rules as relative imports. Type-only edges also count.
export function checkBoundaries(sources, options = {}) {
  const root = path.resolve('/source-boundary-root')
  const files = new Map(Object.entries(sources).map(([file, code]) => [path.join(root, file), code]))
  const directories = new Set([...files.keys()].flatMap(file => {
    const dirs = []; for (let dir = path.dirname(file); dir.startsWith(root); dir = path.dirname(dir)) dirs.push(dir)
    return dirs
  }))
  const host = { fileExists: file => files.has(file), readFile: file => files.get(file), directoryExists: dir => directories.has(dir) }
  const compilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, ...options,
    baseUrl: root }
  const errors = []; const graph = new Map()
  const report = (file, message) => errors.push(`${file}: ${message}`)
  for (const [file, code] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    if (isTest(file)) continue
    if (!['app', 'platform', 'features', 'domain'].includes(owner(file)) && !['main.tsx', 'index.css'].includes(file) && !file.startsWith('assets/')) report(file, 'Source has no owner; use app/, platform/, features/, or domain/.')
    const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true)
    const edge = specifier => {
      const resolved = ts.resolveModuleName(specifier, path.join(root, file), compilerOptions, host).resolvedModule
      // TS does not resolve side effect CSS imports. Still check their owner.
      const css = specifier.startsWith('.') && specifier.endsWith('.css') ? path.resolve(root, path.dirname(file), specifier) : undefined
      const target = resolved?.resolvedFileName ?? (files.has(css) ? css : undefined)
      if (!target) {
        const configuredAlias = Object.keys(compilerOptions.paths ?? {}).some(pattern => {
          const [prefix, suffix = ''] = pattern.split('*')
          return pattern.includes('*') ? specifier.startsWith(prefix) && specifier.endsWith(suffix) : specifier === pattern
        })
        if (specifier.startsWith('.') || specifier.startsWith('/') || configuredAlias || owner(file) === 'domain') report(file, `Cannot resolve permitted source dependency "${specifier}"; domain accepts only local pure contracts.`)
        return
      }
      const to = path.relative(root, target).split(path.sep).join('/')
      if (to.startsWith('../')) { report(file, `Dependency escapes source ownership: ${specifier}`); return }
      if (isTest(to)) report(file, `Production source imports test ${to}`)
      const fromOwner = owner(file); const toOwner = owner(to)
      if (fromOwner === 'platform' && !['platform', 'domain'].includes(toOwner)) report(file, `Platform cannot import ${to}; move product behavior into its feature.`)
      if (fromOwner === 'features' && !['features', 'platform', 'domain'].includes(toOwner)) report(file, `Feature cannot import reverse dependency ${to}.`)
      if (toOwner === 'features' && (fromOwner !== 'features' || feature(file) !== feature(to)) && !/^features\/[^/]+\/index\.[tj]sx?$/.test(to)) report(file, `Import ${to} through features/${feature(to)}/index.ts public entry point.`)
      if (fromOwner === 'domain') {
        if (toOwner !== 'domain') report(file, `Pure domain cannot import ${to}.`)
        else graph.set(file, [...(graph.get(file) ?? []), to])
      }
    }
    const visit = node => {
      // Vite expands glob dependencies after this check. Fail closed instead of
      // allowing eager or lazy expansion to bypass ownership/public entries.
      // Check the access itself so extracting the function also cannot evade it.
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
        node.expression.name.text === 'meta' &&
        (ts.isPropertyAccessExpression(node) ? node.name.text === 'glob' :
          !ts.isStringLiteralLike(node.argumentExpression) || node.argumentExpression.text === 'glob')) {
        report(file, 'import.meta.glob is not permitted; use explicit literal imports through feature public entry points so ownership can be checked.')
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) edge(node.moduleSpecifier.text)
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'console' &&
        file !== 'platform/lib/diagnostic-core.ts' && !isTest(file)) {
        report(file, 'Direct console calls are not permitted; use the platform diagnostics adapter.')
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fetch' &&
        !['platform/http/index.ts', 'platform/auth/supabase.ts'].includes(file) && !isTest(file)) {
        report(file, 'Direct fetch calls are not permitted; use an owned operation client and the platform transport.')
      }
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) edge(node.argument.literal.text)
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) edge(node.moduleReference.expression.text)
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === 'require')) {
        if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) edge(node.arguments[0].text)
        else report(file, 'Dynamic dependency must use a literal path so ownership can be checked.')
      }
      const mapsLazyImport = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'then' && ts.isCallExpression(node.expression.expression) && node.expression.expression.expression.kind === ts.SyntaxKind.ImportKeyword
      if (owner(file) === 'app' && (ts.isNewExpression(node) || (ts.isCallExpression(node) && node.expression.kind !== ts.SyntaxKind.ImportKeyword && node.expression.getText(ast) !== 'lazy' && !mapsLazyImport))) report(file, 'App contains behavior; keep only provider/route assembly and lazy entry points here.')
      ts.forEachChild(node, visit)
    }
    if (file.endsWith('.css')) {
      // Comments are whitespace in CSS; preserve quoted strings while removing
      // them so comments between @import/url tokens cannot hide dependencies.
      const css = code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\//g,
        token => token.startsWith('/*') ? ' ' : token)
      const imports = /@import\s+(?:url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^\s()'"\\])+))\s*\)|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/gi
      for (const match of css.matchAll(imports)) {
        const specifier = match.slice(1).find(value => value !== undefined)
        // CSS escapes must resolve to the same path as their literal spelling.
        edge(specifier.replace(/\\([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|\\([^\r\n\f])/gi,
          (_, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : char))
      }
    } else visit(ast)
  }
  const visitDomain = (file, stack = []) => {
    if (stack.includes(file)) { report(file, `Domain cycle: ${[...stack, file].join(' -> ')}`); return }
    for (const to of graph.get(file) ?? []) visitDomain(to, [...stack, file])
  }
  for (const file of graph.keys()) visitDomain(file)
  // Compile domain against ECMAScript only: no React, browser, Node or ambient
  // application declarations can silently make an impure contract typecheck.
  const domainFiles = [...files.keys()].filter(file => owner(path.relative(root, file)) === 'domain' && !isTest(file))
  if (domainFiles.length) {
    const opts = { ...compilerOptions, target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts'], types: [], strict: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, allowJs: true, checkJs: true, jsx: ts.JsxEmit.Preserve }
    const pureHost = ts.createCompilerHost(opts)
    const originalRead = pureHost.readFile; const originalExists = pureHost.fileExists; const originalDir = pureHost.directoryExists
    pureHost.readFile = file => files.get(file) ?? originalRead(file)
    pureHost.fileExists = file => files.has(file) || originalExists(file)
    pureHost.directoryExists = dir => directories.has(dir) || originalDir(dir)
    pureHost.getSourceFile = (file, languageVersion) => { const code = pureHost.readFile(file); return code === undefined ? undefined : ts.createSourceFile(file, code, languageVersion, true) }
    const program = ts.createProgram(domainFiles, opts, pureHost)
    for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
      // Option/global diagnostics have no source file. They must fail closed:
      // otherwise a broken purity compilation can look like a valid domain.
      const file = diagnostic.file ? path.relative(root, diagnostic.file.fileName) : path.relative(root, domainFiles[0])
      report(file, `Domain purity${diagnostic.file ? '' : ' compilation'}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`)
    }
  }
  return [...new Set(errors)].sort()
}

export function readSources(directory) {
  const sources = {}
  const walk = dir => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (extensions.includes(path.extname(file))) sources[path.relative(directory, file).split(path.sep).join('/')] = readFileSync(file, 'utf8')
  } }
  walk(directory); return sources
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const frontend = fileURLToPath(new URL('../', import.meta.url))
  const configPath = path.join(frontend, 'tsconfig.app.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, frontend)
  const sourceRoot = path.join(frontend, 'src')
  const paths = Object.fromEntries(Object.entries(options.paths ?? {}).map(([alias, targets]) => [alias,
    targets.map(target => path.relative(sourceRoot, path.resolve(options.baseUrl ?? frontend, target))),
  ]))
  const errors = checkBoundaries(readSources(sourceRoot), { ...options, paths })
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
  else console.log('Source import boundaries passed.')
}
