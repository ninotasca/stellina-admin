# NIN-372 — Portable Stellina authentication lifecycle

## Browser-session boundary

Stellina now delegates browser admission and session restoration to Core's site-scoped browser-session contract:

- `POST /api/v1/core/auth/browser-session/stellina/exchange` accepts the provider proof once;
- `POST /api/v1/core/auth/browser-session/stellina/restore` silently restores from the Core-managed cookie;
- `POST /api/v1/core/auth/browser-session/stellina/refresh` rotates the short application token;
- `DELETE /api/v1/core/auth/browser-session/stellina` terminates the browser session with the CSRF proof.

The provider proof is never installed on a product client. The exchanged application credential is held only in memory, is bounded to Stellina authority, and is never persisted to `localStorage` or Supabase storage. The Supabase client is configured with `persistSession: false` and `autoRefreshToken: false`.

## Lifecycle and failure semantics

`AuthProvider` restores exactly once at application startup. Client-side route changes reuse the current in-memory credential and perform zero restore calls; reload and a new tab can restore silently through the Core cookie. Public routes remain outside the protected admission boundary.

The UI distinguishes loading, anonymous, authenticated, forbidden, disabled, and unavailable states. A transient restore/refresh failure receives one bounded retry and then becomes unavailable rather than presenting a false logout. Malformed or foreign sessions fail closed. Backend-derived Stellina site authority and permissions control admission.

Each installed credential receives a monotonically increasing generation. A protected 401 reports the generation used by that request; only that generation may be cleared, so a late rejection cannot invalidate a newer session.

## Shared conformance

The Stellina decoder is exercised against the same canonical auth-policy fixture and pinned SHA-256 contract digest as the detached Core/API M2 reference (`3a108b1a`). The digest covers:

- `app/modules/core/routes/auth_routes.py`
- `app/modules/core/schemas/supabase_auth.py`

The real-browser lifecycle test covers initial restore, route continuity, provider exchange, transient unavailability, forbidden, disabled and anonymous states, stale/current 401 generation handling, logout, and the absence of persistent browser credentials.

## Verification

- full tests: 188 passed, 0 failed, including the headless Chrome lifecycle test;
- focused auth/transport/RFP/safe-failure tests: 52 passed, 0 failed;
- typecheck and import boundaries: passed;
- lint: 0 errors, 5 pre-existing warnings;
- production build: passed; JS 1,639.30 kB (474.29 kB gzip), CSS 47.47 kB (8.48 kB gzip).

