# NIN-375 — M3 shared interface freeze

## Accepted candidates

| Application | Branch | Checkpoint |
| --- | --- | --- |
| Stellina Admin | `migration/nin-368/stellina-admin/20261118t234359z` | the commit containing this freeze document; parent comparison checkpoint `f3071e5` |
| Unoventi Admin | `migration/nin-375/unoventi-admin/20261118t234359z` | `335b553f754beeab40ef55a5192504b232f66e1d` |
| Core/API contract | detached M2 reference | `3a108b1a` |

Both product branches are isolated and pushed. No protected branch was merged, no package was published, and no production deployment or external data mutation occurred.

## Frozen revision

`platform-parity-v1` is the interface revision eligible for M4 extraction. Its canonical digest is `b32631a139217e88cdb8d9057cb4c271085b07cd6f0c1575c07d516b751eb12c`.

The frozen surface is deliberately behavioral and product-neutral:

- configuration: immutable, build-selected application identity and allowlisted public values;
- diagnostics/errors: bounded fields, fixed event messages, safe correlation, contained sink/serialization failures;
- HTTP: distinct public and protected clients, correlation/site/visit headers, cancellation, response bounds, no automatic mutation retry;
- authentication: Core-managed cookie, in-memory short token, provider proof used only for exchange, generation-safe rejection, silent restore, and `loading | anonymous | authorizing | authenticated | forbidden | disabled | unavailable`;
- state: `loading | ready | error`, retained last-good data on failure, abort on replacement, `refetch` and `invalidate`;
- UI states: loading, empty, unauthenticated, forbidden, unavailable, validation, conflict, and unexpected, with status/alert live-region semantics;
- routing/ownership: application composition owns route registration; platform never imports product features; features expose intentional public entry points.

The canonical auth schema digest is `cc1ac6e8fde58820667e9f904fd2ea1dfde7538bd13a63c54b2b609165fc0aa0`; the canonical auth/state operation digest is `e16416bea158d9f2a8f7976937d131309915363a3581530c9b78317dc7286c8c`. Both applications pass all three digests without fixture exceptions.

Product routes, API operations, branding, copy, feature types, page layout, and domain policy are explicitly outside the shared interface.

## Reconciliation completed

The NIN-374 mismatch was fixed in both products without weakening the fixture:

- Unoventi now represents a disabled policy with the shared `disabled` status while retaining its intentional access behavior.
- Stellina now announces authentication unavailability, removes sign-in controls during the outage, and exposes an accessible retry action. The real-browser regression test covers announcement, control replacement, and retry.

The final fixed-input Stellina capture is `screenshots/stellina-unavailable.png`, 1440×1000, SHA-256 `c2a50cfbfecd3d6d5d3d34700b4656546cc99b4b37a499dfebd45170ae862e10`.

## Final matrices

| Gate | Stellina | Unoventi |
| --- | --- | --- |
| clean lockfile install | pass, 400 packages | pass, 189 packages |
| complete tests | 194/194 | 122/122 |
| typecheck | pass | pass |
| import boundaries | pass | pass |
| lint | 0 errors, 5 pre-existing warnings | pass |
| build | pass, 910 modules | pass, 127 modules |
| `platform-parity-v1` | pass | pass |
| repeated internal navigation | zero restore/exchange requests | zero restore/exchange requests |

Final Stellina bundle: 1,641.84 kB JavaScript (475.29 kB gzip), 48.18 kB CSS (8.67 kB gzip). This remains below the 2% unexplained-growth threshold from the NIN-368 baseline. Final Unoventi composition remains materially unchanged from NIN-374: six JavaScript chunks totaling about 1,108.35 kB (245.59 kB gzip) and two CSS files totaling 80.98 kB (17.09 kB gzip).

## M4 extraction input

The following temporary, intentionally duplicated implementations are the proven extraction inputs:

1. public config decoding and build selection;
2. diagnostic envelope/error normalization;
3. public/protected HTTP construction and credential-generation handling;
4. browser-session auth types, credential store, policy decoder, and provider lifecycle;
5. remote-resource state primitive;
6. accessible view-state vocabulary;
7. import-boundary and synthetic conformance fixtures.

No accidental cross-feature or product-aware platform duplication remains. Product adapters and presentations stay in their applications.

## Merge and extraction order

1. Review and accept the Unoventi contract-only checkpoint `335b553f...`.
2. Review and accept the final Stellina M3 checkpoint; do not merge either merely to start extraction.
3. In M4, establish package ownership/version/rollback policy and the public subpath contract.
4. Extract testing/config/diagnostics/errors/HTTP first, then auth, then routing/state/UI.
5. Make both products consume the same candidate package version in isolated branches and rerun this complete matrix.
6. Publish only after both consumers pass and rollback to their copied implementations has been demonstrated.

## Rollback

Rollback requires no database or service change. Before any product merge, discard the candidate branch and retain the prior product checkpoint. After a reviewed merge, revert only the relevant M3/NIN-375 commits:

- Stellina comparison parent: `f3071e5`; pre-M3 product branch remains untouched.
- Unoventi prior reference: `aeaa7a66dedb6026aa32e2b14c85aae974e53af8`.

The M4 package must preserve an application-level rollback path until both products have completed the same-version acceptance window.

## Local preview

- Stellina: `npm run preview -- --host 127.0.0.1 --port 4173`
- Unoventi: `ENVIRONMENT_NAME=development npm run preview -- --host 127.0.0.1 --port 4174`

These are loopback-only last-known URLs. The preview processes were stopped after evidence capture.

