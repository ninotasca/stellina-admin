# NIN-370 — Typed configuration, logging, and error contract

## Fixed application identity

The pinned manifest identifies exactly one application and authority scope:

- application: `stellina-admin`
- site key: `stellina`
- product namespace: `stellina`
- API owner: `unoventi-api`
- Core capabilities: `auth` only
- post-login route: `/dashboard`

The registry separately binds the known Stellina site UUID, owned asset, route, and deployment Supabase origin. Its exact bytes are protected by a separately stored SHA-256 digest. A serving URL, runtime global, public environment value, feature switch, or browser path cannot select another binding.

## Build adapter

`build/environment.js` normalizes deployment selectors before any environment file is loaded. `build/public-config.js` decodes a small allowlist of public values, exact manifest shapes, fixed scope, strict booleans, allowed origins, publishable-key shape, and canonical log levels. `vite.config.ts` injects the resulting immutable typed object once.

There are no `import.meta.env` reads in browser source. API roots, Supabase public values, site identity, logging identity, build display, magic-login presentation, and test-booking presentation all consume `platform/config`.

Magic login and test bookings are presentation/query gates only, are allowed only in development, and cannot add capabilities or alter site/product identity.

## Diagnostics and rendered errors

The single diagnostics adapter derives `service`, `environment`, and `site_key` from typed configuration. It retains the bounded event allowlist, safe-field projection, correlation validation, threshold filtering, serialization containment, and sink containment. No feature owns a direct console sink. Existing API error normalization continues to discard arbitrary backend content and render only reviewed safe messages.

## Verification

- deterministic builds: development, staging, and production passed.
- configuration negative matrix: foreign application/site/product, capability expansion, unknown fields/keys, malformed values, foreign origins, digest mutation, and production UX switches all rejected.
- full tests: 186 passed, 0 failed.
- privacy/sink and RFP diagnostics: passed, including hostile canaries and unsafe mutation probes.
- import boundaries: passed.
- lint: 0 errors, 5 pre-existing warnings.
- typecheck: passed.
- production build: 896 modules; CSS 47.47 kB (8.48 kB gzip); JS 1,629.89 kB (471.63 kB gzip).
