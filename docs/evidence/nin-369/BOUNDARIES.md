# NIN-369 — Stellina source boundaries

## Result

The frontend now has four explicit ownership layers:

- `src/app`: application composition and route ownership only.
- `src/domain`: browser-free shared contracts.
- `src/platform`: authentication, transport, diagnostics, configuration types, and reusable UI primitives.
- `src/features`: administration, authentication, commissions, Cvent, Nimble, RFP, and site-selection behavior.

Every feature exposes a public `index.ts`. Cross-feature imports use those public entries; direct private cross-feature imports are rejected.

## Deterministic enforcement

`scripts/check-import-boundaries.js` and `test/import-boundaries.test.js` are the proven NIN-353/M2 checker and adversarial test matrix. The checker is mandatory in `build`, `lint`, and `test:architecture`. It rejects reverse dependencies, private cross-feature imports, domain impurity, direct browser I/O outside platform adapters, dynamic/glob bypasses, cycles, unowned files, direct console use, and direct fetch use.

## Route and behavior parity

The route table was moved intact from `App.tsx` to `src/app/routes.tsx`. Its 28 explicit paths are unchanged: 4 public/auth routes, 3 protected full-screen routes, 19 protected shell routes, and the `/` plus wildcard redirects. No route path, protection rule, or component binding changed.

The migration updated test fixture paths only. The complete pre-existing behavior, proxy, diagnostics, transport, upload, cancellation, RFP, and auth test set remains green.

## Verification

- `npm run check:imports`: passed.
- `npm test`: 181 passed, 0 failed (122 pre-existing tests plus 59 deterministic architecture-boundary cases).
- `npm run lint`: 0 errors, 5 pre-existing warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed; 895 modules; CSS 47.47 kB (8.48 kB gzip); JS 1,629.67 kB (471.45 kB gzip).

## Explicit migration debt

- The legacy feature/UI lint posture is scoped in `eslint.config.js`; new platform code remains strict. The existing five hook warnings are unchanged.
- The legacy Axios factory remains temporarily in `src/platform/http/index.ts` and is replaced by the shared transport contract in NIN-371.
- The legacy local-storage auth provider remains temporarily in `src/platform/auth/AuthContext.tsx` and is replaced by the portable browser-session module in NIN-372.
- The current single large bundle is unchanged and is not concealed; code splitting is outside this structural checkpoint.
