# NIN-373 — Domain clients and standardized UI/server state

## Ownership

Commissions, RFP, site selection, Cvent, Nimble, and administration each retain their product operations in their own feature API module. Each domain now exposes a typed `resources.ts` hook through its public feature entry point. The hooks depend on the platform state primitive but contain no transport or authentication implementation.

The platform owns only generic behavior:

- `useRemoteResource` models loading, ready, and retained-data failure states;
- a resource-key change, retry, or invalidation creates a fresh request and cancels the stale request with `AbortController`;
- `ViewState` renders loading, empty, unauthenticated, forbidden, unavailable, validation, conflict, and unexpected states without product rules.

Protected resource keys are explicitly scoped with `:protected`. Public hotel-response and site-selection clients remain outside these hooks and cannot share protected state or credentials.

## Representative adoption

RFP and site-selection list pages now use the shared resource and view-state primitives. Deletes invalidate their resource and reload through the same cancellable path. Existing table rows, routes, labels, date presentation, and empty copy remain unchanged.

All six domain list reads accept and propagate an `AbortSignal`. Contract tests cover a read for every domain and mutations for commissions, RFP, site selection, Cvent, and administration. Nimble exposes only reviewed list operations and is intentionally read-only; no synthetic mutation was introduced.

## Verification

- full tests: 193 passed, 0 failed;
- real Chrome state lifecycle: loading, ready, invalidation, retained-data failure, retry, stale cancellation, and empty-ready passed;
- domain contract and client tests: typed ownership, protected/public isolation, cancellation propagation, and reviewed mutation paths passed;
- typecheck and import boundaries: passed;
- lint: 0 errors, 5 pre-existing warnings;
- production build: 910 modules; JS 1,641.51 kB (475.26 kB gzip); CSS 48.17 kB (8.66 kB gzip).

