# NIN-374 — Unoventi Admin / Stellina side-by-side comparison

## Pinned candidates

| Application | Exact checkpoint | Candidate |
| --- | --- | --- |
| Stellina Admin | `08d85f0b140d3de96d5ff4af458efb9b18d1c541` | isolated M3 branch before comparison-only artifacts |
| Unoventi Admin | `aeaa7a66dedb6026aa32e2b14c85aae974e53af8` | detached M2 reference |
| Core/API contract | `3a108b1a` | detached M2 reference used by both auth digest tests |

No production data, credentials, database mutation, or production deployment was used.

## Clean reproducibility and flake measurement

Both candidates were installed from their lockfiles with `npm ci --ignore-scripts`.

| Measure | Stellina | Unoventi | Interpretation |
| --- | ---: | ---: | --- |
| clean install | 5.53 s, 400 packages | 0.90 s, 189 packages | Intentional product dependency difference; Stellina includes rich-text, charting, sanitization, and spreadsheet-facing UI dependencies. |
| audit report | 51 findings | 16 findings | Pre-existing dependency exposure; recorded, not auto-fixed because an audit upgrade is outside M3 and could change behavior. |
| test run 1 | 193/193, 2.08 s wall | 122/122, 10.69 s wall | Pass. Unoventi serializes browser-oriented suites; test counts are product-specific. |
| test run 2 | 193/193, 1.83 s wall | 122/122, 10.62 s wall | Pass. No flake in either repeated run. |
| measured build | 4.46 s wall | 2.82 s wall | Pass. Stellina transforms 910 modules; Unoventi transforms 127. |

The Unoventi contract test requires `UNOVENTI_API_ROOT` to point to the detached Core/API candidate. Its first deliberately unconfigured run failed only because that source path was absent; both pinned reruns passed.

## Bundle and performance thresholds

Stellina emits one 1,641.51 kB JavaScript chunk (475.26 kB gzip) and 48.17 kB CSS (8.66 kB gzip). This is +0.71% raw JS and +0.80% gzip JS from the NIN-368 Stellina baseline, below the comparison threshold of 2% unexplained growth. The existing over-500-kB chunk warning remains.

Unoventi emits six JavaScript chunks totaling 1,108.35 kB (245.58 kB gzip) plus two CSS files totaling 80.98 kB (17.09 kB gzip). Stellina's larger JavaScript payload is explained by product libraries and its current single-chunk composition; the latter is M4 extraction/optimization input, not a functional regression. No performance change is accepted when it exceeds 2% from the same-product baseline without an explanation, or when a representative synthetic workflow regresses by more than 20% across three runs.

## Versioned synthetic conformance

The same `platform-parity-v1` script was run against both roots. The canonical and operation digests matched exactly:

- canonical matrix: `b32631a139217e88cdb8d9057cb4c271085b07cd6f0c1575c07d516b751eb12c`
- auth schema: `cc1ac6e8fde58820667e9f904fd2ea1dfde7538bd13a63c54b2b609165fc0aa0`
- auth/state operations: `e16416bea158d9f2a8f7976937d131309915363a3581530c9b78317dc7286c8c`

Stellina passed the complete matrix. Unoventi exposed one interface mismatch: its `AuthStatus` union omits `disabled`, although its policy decoder accepts disabled policies. This is a genuine shared-interface drift and must be reconciled in NIN-375 before M4.

Both applications passed their browser auth/state suites. They prove silent cookie restoration, provider-proof exchange isolation, generation-safe rejection handling, cancellation/invalidation, and zero extra restore/exchange calls during repeated internal navigation.

## Route, runtime, and visual comparison

Stellina has 32 route declarations (three public application routes); Unoventi has 33 (six public account routes). The difference is intentional product ownership, not shared routing behavior. Protected and public transport isolation passes in both suites.

Both previews ran simultaneously on distinct loopback ports. With the Core/API intentionally absent, Chrome produced no application crash; each preview generated the expected failed proxy calls. The fixed 1440×1000 visual captures are:

- `screenshots/stellina-login.png`, SHA-256 `5e868437936f63fb85fe206c651d9190bf18e949fbb83f78ae797c5d92ca0ad3`
- `screenshots/unoventi-login.png`, SHA-256 `bf9affa7ef4b41181285b83971719ebc66377881601e983d7e16df7cb6d7e11c`

Brand, copy, imagery, and layout are intentional product differences. The fixed outage input revealed one semantic visual regression: Unoventi clearly renders authentication unavailable with retry, while Stellina's `/login` renders an access-only card with no unavailable explanation or retry. NIN-375 must reconcile this state/focus contract without copying product visuals.

## Developer touch points and conditionals

A protected feature in both candidates touches the feature's public entry, typed client/resource, page, and application route registry. Stellina additionally has feature-owned product types where required. Neither platform layer imports a feature, and no shared API requires a product route or operation conditional.

The only discovered product-conditional pressure is presentation: each product supplies its own authentication branding and copy around the same status vocabulary. The shared contract should freeze state and accessibility semantics, not product markup.

## Finding disposition

| Finding | Classification | Disposition |
| --- | --- | --- |
| Unoventi `AuthStatus` omits `disabled` | shared interface drift | reconcile in NIN-375; blocks M4 |
| Stellina login hides unavailable/retry state | functional and visual state regression | fix and browser-test in NIN-375; blocks M4 |
| Stellina single large JS chunk | explained product/bundle difference | record as M4 optimization input |
| product routes, branding, copy, package counts | intentional product differences | retain |

