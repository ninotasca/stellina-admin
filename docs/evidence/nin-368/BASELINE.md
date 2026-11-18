# NIN-368 Stellina Admin baseline evidence

Captured 2026-11-18 on the isolated M3 candidate worktree. This checkpoint is
evidence-only: no application architecture or product behavior changed.

## Reproducibility

| Item | Value |
| --- | --- |
| Repository | `ninotasca/stellina-admin` |
| Baseline | `bea4717fcb0be074d162ae752adbba3bc7a4d918` |
| Branch | `migration/nin-368/stellina-admin/20261118t234359z` |
| Worktree | `delivery-worktrees/stellina-admin-nin-368-20261118t234359z-cand` |
| Lockfile SHA-256 | `e4c9994a072e440be1010f057514cbe1bcd91279effb77f76b291ada6d965d06` |
| Install | `cd frontend && npm ci` (400 packages) |
| Preview | `npm run preview -- --host 127.0.0.1 --port 3414 --strictPort` |
| Assurance scope | Stellina Admin, development/isolated preview, declared AP-200; no overlays were supplied |

The canonical `stellina-admin/main` was clean and `0 0` against `origin/main`
before this worktree was created. The recorded Unoventi Admin and Core reference
commits were also verified as `aeaa7a66dedb6026aa32e2b14c85aae974e53af8`
and `3a108b1a6e20f85dca4eb846ce3180defeab7c6d`.

## Baseline commands and results

| Command | Result | Wall time |
| --- | --- | --- |
| `npm test` | 122/122 passed outside the restricted network sandbox | 1.59 s |
| `npm run lint` | passed with 0 errors and 5 existing React-hook warnings | 2.52 s |
| `npx tsc -b --pretty false` | passed | 2.31 s |
| `npm run build` | passed; 886 modules transformed | 3.94 s total, 1.83 s Vite build |

The first test invocation inside the restricted sandbox produced three
`listen EPERM` failures because localhost binding was denied. Re-running the
same suite with localhost binding allowed passed 122/122. This is an execution
environment limitation, not an application regression.

Existing lint warnings are in `NimbleTypeahead.tsx`, `CommissionForm.tsx`, and
`CommissionProjections.tsx`. NIN-368 does not alter them.

## Bundle and chunk baseline

| Artifact | Raw | Gzip | SHA-256 |
| --- | ---: | ---: | --- |
| `dist/index.html` | 0.54 kB | 0.34 kB | `5e08a1bc3ad35cb304794640c7e16aaf19b98aabec0e3536b55dce6576aa1057` |
| `dist/assets/index-BvcGKVkT.css` | 47.47 kB | 8.48 kB | `b1e3221f127ff2d4dd2ae8bd782699a1cd9b0e458c90d0b09df2591879f15cdc` |
| `dist/assets/index-FbOxZaXl.js` | 1,629.97 kB | 471.48 kB | `065923adeb810c75dfc3935495ff16ab0f8146cff3ce117995448b71885a426f` |

The production build is a single application JavaScript chunk and emits the
Vite warning for chunks larger than 500 kB. Total emitted `dist` size is about
2.6 MB, including about 1.0 MB of brand assets. This is the comparison baseline
for NIN-374; no lazy route chunks exist at this checkpoint.

## Route inventory

Explicitly public routes:

- `/login`
- `/auth/callback`
- `/hotel-response/:guid`
- `/site-selection/:guid`

Protected full-screen routes:

- `/rfps/:rfpId/preview`
- `/commissions/:id/cvent/:uploadId`
- `/commissions/:id/cvent-merge/:mergeJobId`

Protected AppShell routes:

- `/dashboard`, `/login-attempts`
- `/rfps`, `/commissions/:eventId/rfps/new`, `/rfps/:id/edit`
- `/rfps/:rfpId/invitations`, `/rfps/:rfpId/responses`
- `/site-selection`, `/commissions/:eventId/site-selection/new`
- `/site-selection/:id/edit`, `/site-selection/:id/responses`
- `/hotel-comparisons`
- `/commissions`, `/commissions/list`, `/commissions/new`
- `/commissions/:id/hotel-comparison`, `/commissions/:id/edit`
- `/commissions/:id`, `/commissions/projections`
- `/nimble`, `/backup`, `/invoices`, `/points`

`/` and unmatched routes redirect to `/dashboard`; an anonymous visit then
settles on `/login`. The protected-route preview check confirmed this behavior.

## Authentication baseline

The current lifecycle is the legacy behavior to replace under NIN-372:

1. Supabase browser persistence restores an identity session.
2. The raw provider token is temporarily written to `localStorage` as
   `access_token` so `/api/v1/core/auth/session/stellina` can exchange it.
3. The returned Stellina bearer and a serialized user are persisted in
   `localStorage`.
4. Private Axios clients reread the bearer from `localStorage` for each request.
5. A protected-client `401` clears local bearer/user state and redirects to
   `/login`, except on `/login` and `/auth/callback`.
6. Logout reports a bounded event, signs out the local Supabase session, and
   clears persisted bearer/user state.

The automated baseline covers policy loading, restoration, new-tab initial
event deduplication, rejected-session cleanup, logout, public/private client
separation, auth-route loop prevention, and safe failure diagnostics. It does
not prove the M3 target behavior because credentials are still durable and
restoration still depends on Supabase SDK persistence. No real identity or
credential was used for this evidence checkpoint.

## API and client ownership

The browser uses same-origin `/api/v1/stellina` and `/api/v1/core` namespaces.
The owned clients at baseline are:

- `services/api.ts`: Core auth/policy/allowed-account/backup operations and
  Stellina login-history access;
- `services/commissionApi.ts`: commissions, hotels, notes, points, line items,
  projections, and test-booking presentation parameters;
- `services/rfpApi.ts`: RFPs, rooms, questions, invitations, responses, public
  hotel forms, attachments, and multipart uploads;
- `services/siteSelectionApi.ts`: protected form administration and public
  form read/submit;
- `services/cventTrackerApi.ts`: tracker upload, workbook views, merge jobs,
  conflict resolution, and download-related reads;
- `services/nimbleApi.ts`: contacts, companies, deals, and browser links to the
  Nimble application.

`services/http.ts` owns Axios construction, bounded JSON parsing, safe error
classification, correlation references, empty/bodyless responses, blob
preservation, and cancellation identity. Product clients independently own
bearer interceptors, so transport/auth ownership is duplicated at baseline.

Public clients deliberately carry no bearer interceptor or authentication
redirect. Automated evidence covers public hotel/site-selection forms, private
Core/Stellina paths, `GET`/`POST`/`PUT`/`PATCH`/`DELETE`, `HEAD`, empty/204/205/304
responses, blobs, multipart uploads, malformed JSON, bounded validation details,
timeouts, cancellation, redirects, compressed responses, and correlation.

## Configuration and browser-state inventory

Tracked public configuration names:

- shared: `VITE_SITE_ID`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`;
- development/production: `VITE_AUTH_ENABLE_MAGIC_LOGIN`,
  `VITE_ENABLE_TEST_BOOKINGS`;
- local proxy selection: `STELLINA_API_PROXY_TARGET`;
- build-owned values: `VITE_CLIENT_LOG_LEVEL`, `VITE_APP_VERSION`, and `MODE`.

Direct `import.meta.env` reads exist in the Supabase adapter, commissions
client/page, auth context, diagnostic adapter, Core client, and build-version
component. NIN-370 must consolidate them behind typed configuration.

Browser storage keys/usages include:

- `access_token`: provider token during exchange, then Stellina bearer;
- `user`: serialized UI user context;
- `unoventi.auth-visit-id`: non-authoritative visit correlation identifier;
- Supabase SDK browser persistence under its provider-owned keys.

The credential entries violate the M3 target and are explicit NIN-372 migration
input. No IndexedDB, direct cookie read/write, or Cache Storage ownership was
found in application source.

## Destination, proxy, and secret-free boundary review

Every browser/static-server/Function/proxy destination found in source or
deployment configuration was classified:

| Surface | Destination/authority | Credential behavior | Classification |
| --- | --- | --- | --- |
| Vite dev/preview proxy | fixed local target, default `127.0.0.1:3301`; only `/api/v1/(stellina|core)` | forwards request headers; does not refresh, terminate, or mint credentials | frontend-classified development proxy |
| Vercel rewrites | fixed `https://api.unoventi.ai/api/v1/stellina/*` and `/api/v1/core/*` | transparent forwarding; no secret read | frontend-classified rewrite |
| Two Vercel Function entries | fixed Stellina health and projections paths through `server/stellinaProxy.js` | forwards bounded nominated headers; no credential refresh/termination/rewrite | frontend-classified proxy |
| Supabase browser SDK | configured public URL and publishable key | provider PKCE identity client; browser persistence currently enabled | public provider client |
| Nimble links | fixed `https://app.nimble.com` browser navigation | no application credential attached | external user navigation |

The secret-name/source/config scan found no embedded privileged credential,
service-role key, client secret, private key, or dynamically selected remote
upstream. The only authorization-header construction reads the current
`localStorage` bearer; tests contain synthetic canaries only. Proxy tests prove
browser host/path/query input cannot select a different upstream.

No positive trusted-boundary finding was identified: no frontend-classified
server component reads privileged secrets, terminates or refreshes sessions,
mints credentials, or exercises privileged upstream authority. The transparent
credential forwarding and browser persistence are migration inputs, not an
approved trusted server boundary.

## Diagnostics baseline

Browser source contains no direct console sink. Browser diagnostics flow through
`src/lib/diagnostic-core.ts`; proxy diagnostics flow through
`server/stellinaProxy.js`. Tests cover threshold selection, fixed envelopes,
safe correlation, sink failure, and omission of authorization, cookie, body,
query, header, exception, and provider canaries.

Application event names currently use the `unoventi.*` and `stellina.*`
prefixes. Service identity is split between `stellina-admin-web` and
`stellina-web`; NIN-370 must reconcile identity through typed configuration
without changing the canonical logging privacy contract.

## Browser evidence

- `login-baseline.png` — anonymous login presentation at build `bea4717`.
- `public-hotel-unavailable-baseline.png` — public hotel form with the API
  unavailable and a safe user-facing failure.
- `public-site-selection-unavailable-baseline.png` — public site-selection form
  with the API unavailable and a safe user-facing failure.

The screenshots are synthetic and contain no production data or credentials.
Their SHA-256 digests are respectively
`5ac54e270282729a4509a2e1e19dc0396ab0b089c02d969f92d6f815754e486a`,
`82ead927604348df123a175a38fafb5637e2a387c5196d53ed05bdbb7430627c`,
and `9f328bd611dd0d2a3440b2e16ea827337aea1dde81965e2599da27f2a093c871`.

## Gate interpretation

NIN-368 baseline evidence is complete for source, automated behavior, local
preview, boundary classification, bundle composition, and synthetic screenshots.
Authenticated browser timing against a live nonproduction backend was not run
because this worktree has no machine-local secrets and the checkpoint must not
use production credentials. That limitation is retained for NIN-372/NIN-374
nonproduction conformance evidence; it is not represented as a passing flow.

No architecture change, deployment, database migration, Supabase policy change,
or protected branch merge was performed.
