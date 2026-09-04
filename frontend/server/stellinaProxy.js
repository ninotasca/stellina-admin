import { randomUUID } from 'node:crypto'

const UPSTREAM_ORIGIN = 'https://api.unoventi.ai'
const REQUEST_ID_HEADER = 'x-stellina-request-id'
const TIMEOUT_MS = 15_000
const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 }
const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const REQUEST_HEADERS = [
  'accept', 'authorization', 'content-type', 'cookie', 'origin',
  'if-modified-since', 'if-none-match', 'if-match', 'if-unmodified-since',
  'cache-control', 'pragma', 'access-control-request-method', 'access-control-request-headers',
]
const HOP_HEADERS = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]

function strippedHeaders(headers) {
  return [...HOP_HEADERS, ...(headers.get('connection') || '').toLowerCase().split(',').map(s => s.trim())]
}

function emit(logger, threshold, level, fields) {
  if (LEVELS[level.toUpperCase()] < threshold) return
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'
  try {
    logger[method](JSON.stringify({
      timestamp: new Date().toISOString(), level, service: 'stellina-web',
      component: 'api-proxy', ...fields,
    }))
  } catch { /* A log sink must never break a request. */ }
}

// Server-only helper; routePath comes from a reviewed entry point, never browser input.
// It intentionally buffers small JSON responses so timeouts/body failures are correlated.
export async function proxyStellinaRequest(request, routePath, options = {}) {
  const now = options.now || (() => performance.now())
  const startedAt = now()
  const suppliedId = request.headers.get(REQUEST_ID_HEADER) || ''
  const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID()
  const setting = String(options.logLevel ?? process.env.STELLINA_LOG_LEVEL ?? 'INFO').trim().toUpperCase()
  const threshold = Object.hasOwn(LEVELS, setting) ? LEVELS[setting] : LEVELS.INFO
  const logger = options.logger || console
  const context = {
    event: 'stellina.proxy.started', request_id: requestId,
    method: METHODS.has(request.method) ? request.method : 'OTHER', route: routePath,
  }
  const log = (level, fields) => emit(logger, threshold, level, { ...context, ...fields })
  log('debug', {})

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? TIMEOUT_MS)
  const cancel = () => controller.abort()
  request.signal.addEventListener('abort', cancel, { once: true })
  if (request.signal.aborted) cancel()

  try {
    // The origin override is dependency injection for localhost tests, not an HTTP parameter.
    const incomingUrl = new URL(request.url)
    const upstreamUrl = new URL(routePath, options.upstreamOrigin || UPSTREAM_ORIGIN)
    upstreamUrl.search = incomingUrl.search
    const headers = new Headers()
    const blocked = strippedHeaders(request.headers)
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name)
      if (value && !blocked.includes(name)) headers.set(name, value)
    }
    headers.set(REQUEST_ID_HEADER, requestId)
    const init = { method: request.method, headers, redirect: 'manual', signal: controller.signal }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
      init.duplex = 'half'
    }
    const upstream = await (options.fetchImpl || fetch)(upstreamUrl, init)
    const noBody = request.method === 'HEAD' || [204, 205, 304].includes(upstream.status)
    const body = noBody ? null : await upstream.arrayBuffer()
    const responseHeaders = new Headers(upstream.headers)
    for (const name of [...strippedHeaders(upstream.headers), 'content-length', 'content-encoding']) {
      if (name) responseHeaders.delete(name)
    }
    responseHeaders.set(REQUEST_ID_HEADER, requestId)
    const duration = Math.max(0, Math.round(now() - startedAt))
    log(upstream.status >= 500 ? 'error' : upstream.status >= 400 || duration >= 5000 ? 'warn' : 'info', {
      event: 'stellina.proxy.completed', status: upstream.status, duration_ms: duration,
    })
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })
  } catch {
    const status = timedOut ? 504 : 502
    log('error', {
      event: timedOut ? 'stellina.proxy.timed_out' : 'stellina.proxy.failed',
      status, duration_ms: Math.max(0, Math.round(now() - startedAt)),
      error_type: timedOut ? 'UpstreamTimeout' : request.signal.aborted ? 'RequestCancelled' : 'UpstreamConnectionError',
    })
    return Response.json({
      detail: timedOut ? 'The Stellina data service took too long to respond.' : 'Stellina could not reach the data service.',
      request_id: requestId,
    }, { status, headers: { 'cache-control': 'no-store', [REQUEST_ID_HEADER]: requestId } })
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', cancel)
  }
}
