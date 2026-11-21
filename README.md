# Stellina Admin

Stellina Admin is a frontend-only repository. Its local frontend runs at
`http://127.0.0.1:3401` and uses the shared Unoventi API at
`http://127.0.0.1:3301`.

Start the API first, then run `./scripts/start-local-dev.sh`. The persistent
port and proxy configuration live in that script and `frontend/vite.config.ts`.
See `RUNBOOK.md` for the complete local workflow.

## Configuration

Public defaults are committed in `frontend/.env`; environment-specific public
values live in `frontend/.env.development` and `frontend/.env.production`.
Build-time deployment configuration resolves the first nonblank process selector
in this order: `ENVIRONMENT_NAME`, `RAILWAY_ENVIRONMENT_NAME`, `VERCEL_ENV`,
then Vite mode. Values are trimmed and case-insensitive: `local`, `dev`, and
`test` map to `development`; `stage` and `preview` map to `staging`; `prod`
maps to `production`. Canonical names are also accepted. An unknown selected
value fails before configuration loading, even when a lower-priority selector
is valid. Without any selector, only an unhosted local invocation may default
to development; Vercel/Railway hosting markers require an identified environment.

The canonical environment selects the `.env.<environment>` file, browser
`import.meta.env.MODE`, and logging defaults. For example,
`ENVIRONMENT_NAME=production npm run build -- --mode development` loads production
configuration and production diagnostics. Vite's `DEV`/`PROD` flags retain their
framework meaning based on `NODE_ENV`; use the canonical `MODE` for environment
identity. Public values retain Vite's native process-variable and env-file
precedence within the selected environment. Use ignored,
mode-specific local files for developer-only public overrides. For example,
`frontend/.env.development.local` may temporarily show test bookings without
affecting a local production build. Never place a backend secret in a `VITE_*`
variable because Vite exposes it to the browser.

The server-side API proxy uses a safe `INFO` logging default in production;
development traffic is proxied directly by Vite. The optional server override
is `LOG_LEVEL` (`DEBUG`, `INFO`, `WARN`, or `ERROR`); `STELLINA_LOG_LEVEL` is ignored.
The proxy validates this value when the server process starts and refuses to
start when it is invalid. Change `LOG_LEVEL` in the hosting environment and
redeploy or restart the server before expecting the new threshold to apply.

## Authentication

Stellina uses the shared Unoventi authentication framework documented in the
[canonical authentication guide](https://github.com/ninotasca/unoventi-admin/blob/main/README_AUTHENTICATION.md).
Magic Login requires both the frontend visibility flag and the backend's
effective site capability. The shared API always disables that capability in
production and rejects direct Magic Login requests regardless of frontend or
site-policy settings.

## Environment-selection release check

For NIN-242 (AP-200), run the focused regression checks from `frontend`:
`node --import ./test/register.mjs --test test/build-environment.test.js test/diagnostic-core.test.js`.
They exercise selector conflicts, aliases, blank and unknown values, and real
in-memory production-selected builds under development mode. Browser probes
verify production logging and disabled test bookings without publishing output.

Vercel Git deployments are intentionally enabled only for `main`; non-main
branch commits must not create Preview deployments. Before merging to `main`,
confirm the intended API target, test-booking visibility, authentication, and
production diagnostic filtering using the validated local release candidate.
Retain the last healthy production deployment and its selector settings. If a
released build regresses, restore that deployment and settings, or revert the
application change and rebuild using explicit production mode. Repeat the
health checks. No hosted rollout or health verification is performed by these
local tests.

### Existing lint debt

NIN-242 attempt 2 attributes the pre-existing lint failures to baseline revision
`937119fc7e8b781b7ccadaf54e7605aa12130cef`: all 32 affected source files and
`frontend/eslint.config.js` are byte-identical to that revision. The 86 errors
comprise 67 explicit `any` types, seven hook purity violations, five unused
expressions, five state updates in effects, one manual memoization violation,
and one component export violation. Five existing warnings remain visible.

`frontend/eslint-suppressions.json` records these counts using the installed
ESLint's native bulk suppression mechanism, automatically consumed by
`npm run lint`. No rules or source files are excluded. Errors in new files,
new rules in an existing file, or increases above a file/rule's baseline fail
lint. The baseline is a count budget, so review must also prevent replacing an
existing violation with a new one of the same rule in the same file. Do not
regenerate or enlarge it to pass a change. Fix existing debt when changing an
affected area, then run `./node_modules/.bin/eslint . --prune-suppressions` to
reduce the baseline; ordinary lint rejects unused suppressions. This records
existing debt rather than claiming those source files are lint-clean.

The review-driven changes beyond the environment fix are this lint baseline
and the localhost proxy test's timing budget. Ordinary localhost requests have
five seconds of headroom; the stalled-body case has a one-second deadline and
asserts headers arrived before timeout. Independent injected-fetch tests retain
their two-millisecond timeout coverage. Full-suite execution belongs to the
Harness; implementation checks target environment builds, diagnostics, proxy
behavior, and lint. No additional assurance uplift was identified.

## Proxy log envelope release check

For NIN-260 (AP-200), run `node --test test/proxy.test.js` from `frontend`.
The proxy captures its classified `environment` at Function startup, alongside
its log threshold. Every emitted event includes a fixed readable `message`;
request events expose the validated `x-stellina-request-id` as `correlation_id`.
The existing `request_id`, upstream/response header, and gateway body reference
remain available for compatibility. This change does not migrate HTTP headers.

The application owner should release to one preview deployment first, then a
bounded group of existing users before wider promotion. Verify a successful
request and a controlled upstream failure: status/body behavior must remain
healthy, and Runtime Logs must contain `environment`, `message`, and a
`correlation_id` matching the response reference. Keep the existing threshold;
DEBUG start events are checked automatically without raising hosted verbosity.
Stop promotion on missing fields, mismatched references, or response regressions.
Retain the last healthy deployment and its environment/threshold settings. If
health regresses, restore that deployment and settings, or revert the NIN-260
application change and rebuild/redeploy; repeat the same health checks. Reverting
also restores the prior missing log fields. Hosted rollout and health evidence
remain release-time checks; local tests do not establish them.
