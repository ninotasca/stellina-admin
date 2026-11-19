import { randomUUID } from 'node:crypto'
import { writeSync } from 'node:fs'

const UPSTREAM_ORIGIN = 'https://api.unoventi.ai'
const REQUEST_ID_HEADER = 'x-stellina-request-id'
const TIMEOUT_MS = 15_000
const ERROR_BY_STATUS = new Map([
  [400, ['request_rejected', 'The Stellina request was not accepted.']],
  [401, ['authentication_required', 'Authentication is required.']],
  [403, ['authorization_denied', 'This account is not permitted to perform that action.']],
  [404, ['resource_not_found', 'The requested Stellina resource was not found.']],
  [405, ['method_not_allowed', 'That operation is not supported.']],
  [409, ['request_conflict', 'The Stellina request conflicts with the current state.']],
  [413, ['payload_too_large', 'The Stellina request is too large.']],
  [422, ['validation_failed', 'The Stellina request did not pass validation.']],
  [429, ['rate_limited', 'Too many Stellina requests were made. Please try again later.']],
  [500, ['upstream_failure', 'The Stellina data service could not complete the request.']],
  [502, ['upstream_unavailable', 'Stellina could not reach the data service.']],
  [503, ['upstream_unavailable', 'The Stellina data service is unavailable.']],
  [504, ['upstream_timeout', 'The Stellina data service took too long to respond.']],
])
const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 }
const LOG_FAILURE_FIELDS = '"level":"error","service":"stellina-web","component":"api-proxy","event":"stellina.proxy.logging_failed","message":"Stellina proxy diagnostic logging failed."'
export function classifyEnvironment(values = process.env) {
  const selected = values.ENVIRONMENT_NAME ?? values.RAILWAY_ENVIRONMENT_NAME ?? values.VERCEL_ENV ?? values.NODE_ENV
  if (selected === undefined && (values.VERCEL || values.RAILWAY_SERVICE_ID || values.RAILWAY_DEPLOYMENT_ID)) {
    throw new Error('Hosted environment must be identified')
  }
  const aliases = {
    local: 'development', dev: 'development', development: 'development', test: 'development',
    stage: 'staging', staging: 'staging', preview: 'staging', prod: 'production', production: 'production',
  }
  const raw = (selected ?? 'development').trim().toLowerCase()
  if (!Object.hasOwn(aliases, raw)) throw new Error('Environment must be development, staging, or production')
  return aliases[raw]
}
export function resolveProxyLogLevel(raw, environment = classifyEnvironment()) {
  const classified = classifyEnvironment({ ENVIRONMENT_NAME: environment })
  if (raw === undefined) return classified === 'development' ? LEVELS.DEBUG : LEVELS.INFO
  const normalized = raw.trim().toUpperCase()
  if (!Object.hasOwn(LEVELS, normalized)) throw new Error('LOG_LEVEL must be DEBUG, INFO, WARN, or ERROR')
  return LEVELS[normalized]
}

// Reject invalid server configuration while loading the Function, before traffic.
const environment = classifyEnvironment()
const minimumLevel = resolveProxyLogLevel(process.env.LOG_LEVEL, environment)
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
      timestamp: new Date().toISOString(), level, service: 'stellina-web', environment,
      component: 'api-proxy', ...fields,
    }))
  } catch {
    // Only interpolate an ISO timestamp, the startup enum and the validated opaque ID.
    // Bypass JSON.stringify and the logger; sync stderr avoids async stream errors.
    try {
      writeSync(2, `{"timestamp":"${new Date().toISOString()}","environment":"${environment}","correlation_id":"${fields.correlation_id}",${LOG_FAILURE_FIELDS}}\n`)
    } catch { /* Fallback construction and writing must never break a request. */ }
  }
}

function safeError(status, correlationId) {
  const [code, message] = ERROR_BY_STATUS.get(status)
    || (status >= 500
      ? ['upstream_failure', 'The Stellina data service could not complete the request.']
      : ['request_rejected', 'The Stellina request was not accepted.'])
  return { detail: { code, message, correlation_id: correlationId } }
}

// Server-only helper; routePath comes from a reviewed entry point, never browser input.
// It intentionally buffers small JSON responses so timeouts/body failures are correlated.
export async function proxyStellinaRequest(request, routePath, options = {}) {
  const now = options.now || (() => performance.now())
  const startedAt = now()
  const suppliedId = request.headers.get(REQUEST_ID_HEADER) || ''
  const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId) ? suppliedId : randomUUID()
  const threshold = options.logLevel === undefined ? minimumLevel : resolveProxyLogLevel(options.logLevel, 'test')
  const logger = options.logger || console
  const context = {
    event: 'stellina.proxy.started', request_id: requestId, correlation_id: requestId,
    method: METHODS.has(request.method) ? request.method : 'OTHER', route: routePath,
  }
  const log = (level, fields) => emit(logger, threshold, level, { ...context, ...fields })
  log('debug', { message: 'Stellina proxy request started.' })

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
      message: 'Stellina proxy request completed.',
    })
    if (upstream.status >= 400 && !noBody) {
      responseHeaders.set('cache-control', 'no-store')
      responseHeaders.set('content-type', 'application/json; charset=utf-8')
      return Response.json(safeError(upstream.status, requestId), {
        status: upstream.status, statusText: upstream.statusText, headers: responseHeaders,
      })
    }
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })
  } catch {
    const status = timedOut ? 504 : 502
    log('error', {
      event: timedOut ? 'stellina.proxy.timed_out' : 'stellina.proxy.failed',
      message: timedOut ? 'Stellina proxy upstream request timed out.' : 'Stellina proxy upstream request failed.',
      status, duration_ms: Math.max(0, Math.round(now() - startedAt)),
      error_type: timedOut ? 'UpstreamTimeout' : request.signal.aborted ? 'RequestCancelled' : 'UpstreamConnectionError',
    })
    return Response.json(safeError(status, requestId), {
      status, headers: { 'cache-control': 'no-store', [REQUEST_ID_HEADER]: requestId },
    })
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener('abort', cancel)
  }
}
