# NIN-382 Stellina Admin upgrade and rollback

The consumer completed the following registry-only sequence:

1. Upgraded `0.1.0-next.0` to exact `0.1.0`; 196 tests, type checking, lint, import boundaries, and the production build passed.
2. Rolled back to exact `0.1.0-next.0`; all 196 tests and the production build passed.
3. Re-upgraded to exact `0.1.0`; a clean `npm ci`, package conformance test, and the production build passed.

The final lock entry resolves `https://npm.pkg.github.com/download/@ninotasca/web-platform/0.1.0/062a3156ae7f6f3a1af2f018e7cfbd32f81cda88` with integrity `sha512-BxTmTfrglBHCwALG3uj+9rC+rFvFlQQ23MBK+CnJYmtn4WaP+y2o1sdB7+A5t3IzY90ebWkZAq7yi8XqrBgL5A==`.

The A-to-B-to-A-to-B sequence changed only the package manifest, lockfile, installed artifact, and version-aware conformance expectation. It required no source copying or compatibility shim.
