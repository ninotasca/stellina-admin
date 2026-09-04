# Stellina frontend API logging

## Inspected topology and rollout scope

Baseline: `e38b7e9` (`main`, already current after pulling `origin/main`).
The app is React 19, TypeScript and Vite 7 with React Router. The local
project root containing `package.json`, `vite.config.ts` and `vercel.json` is
`frontend/`; configure that as the Vercel Root Directory. No local `.vercel`
project link or authenticated Vercel CLI was available, so the remote project
setting and Preview routing have **not** been verified.

Before this change the six API service modules called absolute
`VITE_API_URL` / `VITE_CORE_API_URL` addresses. Vercel had only the SPA
rewrite, and Vite had no API proxy. There were **no existing API rewrites**
to retain. This change adds narrowly targeted Functions and namespace-specific
external rewrites to support same-origin browser requests.

| Route family | Behavior after this change | Reason |
| --- | --- | --- |
| `/api/v1/stellina/health` | Logged Function | Small read-only JSON health response |
| `/api/v1/stellina/commissions/projections` | Logged Function | Read-only aggregate JSON; existing backend admin authorization still required |
| Other `/api/v1/stellina/commissions/**` | External rewrite | CRUD, notes, points, Cvent uploads/cell payloads/merge work stay off Functions |
| `/api/v1/stellina/rfps/**` | External rewrite | Includes attachments, multipart uploads and download redirects |
| `/api/v1/stellina/hotel-invitations/**` | External rewrite | Public GUID forms, responses, uploads and download redirects |
| `/api/v1/stellina/site-selection/**` | External rewrite | Public/admin form reads and submissions |
| `/api/v1/stellina/nimble/**` | External rewrite | External CRM calls with less predictable duration |
| `/api/v1/core/**` | External rewrite | Shared OAuth exchange, user/account management, logout and SQLite backup download |
| `/auth/callback` and UI paths | Existing SPA fallback | Browser-side Google OAuth callback and React Router |

No broad `/api/*` Function is added. Exact Function self-rewrites precede the
namespace rewrites and SPA fallback. Trailing-slash variants and other methods
are forwarded without locally inventing authorization or 405 responses; the
backend retains its routing/redirect behavior. No browser SSE/WebSocket client,
webhook handler or dedicated streaming endpoint was found. Downloads and
potentially long-running work remain outside the buffered logging helper.

## Auth, transport and logging contract

The app uses localStorage bearer tokens, not cookie-based login. Existing token
interceptors are retained. Only the existing main API client clears localStorage
and redirects on 401; public clients do not attach tokens or redirect. The Google
OAuth redirect URI, site ID, request payload, route guards and session code are
unchanged. The proxy never adds service credentials or changes CORS policy.

The server-only helper lives in `server/stellinaProxy.js`, outside the browser
source and the auto-routed `api` directory. It uses the fixed
`https://api.unoventi.ai` origin and entry-point-selected paths, not a URL supplied
by the browser. Dependency injection of a different origin is for localhost tests
only. Request auth, cookies, origin, preflight and conditional-cache headers are
forwarded through an allowlist. Response cookies, redirects, cache policy, ETag,
Vary and authentication headers are retained; hop-by-hop headers (including
Connection-nominated headers) and stale content length/encoding are removed.
Cookies are not rewritten; a future cookie-based authentication rollout needs
its own domain/SameSite/CSRF review.

- Contract: `/api/v1/stellina`, `STELLINA_LOG_LEVEL`, `x-stellina-request-id`,
  service `stellina-web`, events `stellina.proxy.*`, JSON field `request_id`.
- IDs accept 1–128 ASCII letters/digits plus `.`, `_`, `:`, `-`. Missing/invalid
  IDs become fresh UUIDs. The same ID is sent upstream and returned downstream.
- DEBUG emits a start record; completion emits INFO for success, WARN for 4xx or
  requests taking at least 5 seconds, ERROR for 5xx/connection failures/timeouts.
- Thresholds are case-insensitive ERROR/WARN/INFO/DEBUG, default INFO, invalid
  values fall back to INFO. Errors use `console.error`, warnings `console.warn`,
  and INFO/DEBUG `console.info`. A failed log sink cannot break a request.
- Logs contain timestamp, level, service, component, event, request ID, fixed
  route, bounded method, status, duration and (on failure) a safe classification.
  They contain no query values, bodies, tokens, cookies, arbitrary headers,
  exception messages or stack traces, including at DEBUG.
- The application timeout is 15 seconds; each Function has `maxDuration: 30`.
  Responses are buffered only for these small JSON routes, so duration includes
  reading the upstream body. Connection/body failures return safe 502 JSON;
  timeouts return safe 504 JSON with matching header/body IDs and `no-store`.
  Requests are never retried.

Set `STELLINA_LOG_LEVEL=INFO` in the Stellina Vercel project's server environment
and redeploy after changing it. Do not prefix it with `VITE_`. Backend logging is
assumed deployed independently; this change does not modify the backend,
Supabase configuration, business/audit records, log files or disk rotation.

## Browser behavior

The existing Axios clients now share response/error handling from
`src/services/http.ts`. All URLs use same-origin Stellina/core prefixes.
Successful JSON primitives, objects, arrays, empty responses and blob downloads
retain their values. Malformed successful JSON and HTML/text HTTP failures
produce safe messages instead of parsing exceptions.

A validated response header takes precedence over a JSON error's `request_id`.
Screens display `Reference: <ID>` when one exists; network failures do not invent
an ID or HTTP response. Axios status/identity and cancellation remain intact;
Cvent's expected missing-tracker 404 still returns null. Only reviewed static 4xx
messages are displayed. Validation 422 errors retain bounded, sanitized field/type
entries in `validationErrors` and `response.data.validation_errors`, plus a safe
readable message; reflected input, custom messages and context are omitted.
UI error slots use the common message reader, including no-response failures.

This is API diagnostics, not automatic browser crash telemetry.

## Local checks and Preview gate

Use Node >=22.15 (or supported newer Node) for the dependency-free Node test
runner and TypeScript loader. From `frontend/`:

```sh
npm ci
npm test
npm run build
npm run lint
```

Tests use harmless mock services on ephemeral loopback ports. They cover
success/read/write/bodyless responses, 4xx/5xx, malformed JSON, connection/body
failures, full-body timeouts, levels, invalid settings, ID correlation, privacy,
failed sinks, headers/cookies/cache/redirects, authentication, public requests,
404 behavior, validation, cancellation, uploads and route isolation. The
end-to-end correlation test observes the mock upstream ID; it does not claim
to verify live Railway logs. No production write endpoint is called.

Vite dev and preview proxy directly to `http://localhost:3401` (Docker mapping).
Use `STELLINA_API_PROXY_TARGET=http://localhost:3501` for a directly run backend;
`scripts/start-local-dev.sh` now sets this automatically. Old `VITE_API_URL` and
`VITE_CORE_API_URL` values are ignored. Vite does not execute the logging
Functions; the localhost tests exercise the helper/entry points separately.

Before production, use an authenticated Vercel Preview deployment to verify:

1. Root Directory is `frontend`; the two exact paths invoke their Functions,
   returning `x-stellina-request-id` and emitting one completion at INFO.
2. An unauthenticated projection request remains denied; admin projection reads
   work normally, and a controlled failure displays a searchable reference.
3. The same ID appears in the deployed backend's Stellina logs.
4. Uploads, downloads, OAuth callback, public forms and other routes continue
   through their intended external rewrite or SPA route.

No deployment or production configuration change is included in this patch.

Reference pattern inspected: BPL `frontend/api/_proxy.js`, its exact
`lines/current.js` entry, browser client, proxy tests and Vite/Vercel configuration.
Adaptations include fixed route labels, cookie/cache forwarding, buffering/body
failure coverage, shorter timeout and preservation of Stellina's Axios clients.

Platform references: [Node Functions](https://vercel.com/docs/functions/runtimes/node-js),
[rewrites](https://vercel.com/docs/routing/rewrites),
[configuration](https://vercel.com/docs/project-configuration/vercel-json).
