# NIN-371 — Public and protected transport convergence

## Owned transport contract

All feature clients now consume one of three platform-owned clients from `src/platform/http/index.ts`:

- `stellinaProtectedApiClient`: fixed `/api/v1/stellina` namespace.
- `coreProtectedApiClient`: fixed approved `/api/v1/core` namespace.
- `publicApiClient`: same-origin public operations with no credential read and no auth rejection behavior.

Feature code no longer creates Axios instances, reads bearer storage, or installs request/response interceptors. Axios remains an implementation detail of the platform transport adapter so the proven multipart, blob, cancellation, HEAD, empty-body, and normalized-error behavior is retained.

## Shared behavior

Every request receives the fixed Stellina site header, bounded browser visit identifier, and a fresh correlation identifier unless the caller supplied one. Protected requests alone read and attach the application bearer. A protected 401 clears the legacy credential snapshot and redirects to `/login` only when not already on `/login` or `/auth/callback`; this prevents callback/login refresh loops. NIN-372 replaces that legacy snapshot with the portable generation-aware browser-session module.

Public hotel and site-selection operations use only `publicApiClient`. Tests prove that even with a bearer present they do not receive Authorization and a public 401 cannot clear credentials or redirect.

## Preserved response contract

- malformed JSON retains HTTP status and safe correlation reference;
- arbitrary backend messages, parser details, payloads, and headers remain discarded;
- reviewed 4xx details and bounded 422 field/type messages remain renderable;
- cancellation identity and `AbortSignal` behavior are retained;
- 204/205, HEAD, empty responses, and blob downloads retain their values;
- multipart bodies remain `FormData` and potentially partial writes are never retried;
- no transport path performs automatic request retries.

## Verification

- full tests: 186 passed, 0 failed.
- endpoint namespace, bearer/site/visit/correlation headers, public credential exclusion, bounded 401 handling, multipart/blob, cancellation, malformed response, validation, proxy, and RFP tests passed.
- import boundaries: passed.
- lint: 0 errors, 5 pre-existing warnings.
- typecheck: passed.
- production build: 896 modules; JS 1,629.41 kB (471.34 kB gzip); CSS 47.47 kB (8.48 kB gzip).
