# Stellina Admin Local Runbook

Use this when the user asks to get the site running locally.

## Known Good Local Startup

From the repository root:

```sh
./scripts/start-local-dev.sh
```

Expected URLs:

- Frontend: http://localhost:3401
- Shared Unoventi API health: http://127.0.0.1:3301/health
- Shared Unoventi API docs: http://127.0.0.1:3301/docs

Stellina Admin is a frontend-only repository. Its API implementation lives in
`/Users/ninotasca/dev/unoventi/unoventi-api/app/modules/stellina` and is served
locally by the shared Unoventi API on port `3301`.

Vite's API proxy defaults to `http://127.0.0.1:3301`. Browser requests stay on
http://localhost:3401 and are forwarded to the shared API. Docker uses
`http://host.docker.internal:3301` to reach that same host process.

## Why This Script Exists

The helper script verifies that the separately managed Unoventi API is healthy,
then starts only the Stellina frontend:

- Frontend: `npm run dev -- --host 127.0.0.1 --port 3401 --strictPort`
- Frontend proxy override:
  - `STELLINA_API_PROXY_TARGET=http://127.0.0.1:3301`

`VITE_API_URL` and `VITE_CORE_API_URL` are no longer used. Vite dev/preview
forward directly and do not execute Vercel logging Functions. See
`frontend/LOGGING.md` for logging tests and deployment verification.

Backend configuration, database schemas, migrations, and credentials belong in
the `unoventi-api` repository, not this frontend repository.

## If It Fails

- If the API health check fails, start the canonical `unoventi-api` checkout on
  `127.0.0.1:3301` before running this script.

- If frontend dependencies are missing, run this from `frontend/`:

```sh
npm install
```

- To use another shared API instance, set `UNOVENTI_API_URL` when invoking the
  script. Do not add a backend checkout to this repository.
