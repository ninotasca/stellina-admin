# NIN-374 side-by-side reproduction

Use the pinned worktrees and do not point either preview at production services.

```sh
cd /Users/ntagent/dev/unoventi/delivery-worktrees/stellina-admin-nin-368-20261118t234359z-cand/frontend
npm ci --ignore-scripts
npm test
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

```sh
cd /Users/ntagent/dev/unoventi/delivery-worktrees/unoventi-admin-m2-reference-aeaa7a6/frontend
npm ci --ignore-scripts
UNOVENTI_API_ROOT=/Users/ntagent/dev/unoventi/delivery-worktrees/unoventi-api-m2-reference-3a108b1 npm test
npm run build
ENVIRONMENT_NAME=development npm run preview -- --host 127.0.0.1 --port 4174
```

From the Stellina worktree root, run the identical versioned matrix against both candidates:

```sh
node frontend/scripts/parity-conformance.mjs --root=/Users/ntagent/dev/unoventi/delivery-worktrees/stellina-admin-nin-368-20261118t234359z-cand --flavor=stellina
node frontend/scripts/parity-conformance.mjs --root=/Users/ntagent/dev/unoventi/delivery-worktrees/unoventi-admin-m2-reference-aeaa7a6 --flavor=unoventi
```

At the NIN-374 checkpoint, the second command intentionally reports the `disabled` status mismatch documented in `COMPARISON.md`. NIN-375 must make both commands pass without weakening the fixture.

