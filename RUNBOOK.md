# Stellina Admin Local Runbook

Use this when the user asks to get the site running locally.

## Known Good Local Startup

From the repository root:

```sh
./scripts/start-local-dev.sh
```

Expected URLs:

- Frontend: http://localhost:3402
- Backend health when using Docker: http://localhost:3401/health
- Backend docs when using Docker: http://localhost:3401/docs

Docker maps the backend container's internal port `3501` to host port `3401`.
Vite's API proxy defaults to `http://localhost:3401`. Browser requests stay on
http://localhost:3402 and are forwarded to the published backend port.

For non-Docker local startup, the helper script runs the backend directly on
host port `3501` and passes the matching server-side proxy target.

## Why This Script Exists

Docker is the documented project path, but in the Codex desktop sandbox the Docker socket may be unavailable. The backend's `python -m app` entrypoint also starts Uvicorn with reload enabled unless a production-style `PORT` variable is set, and that file watcher can be blocked locally.

The helper script uses the path verified on June 24, 2026:

- Backend: `backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 3501`
- Frontend: `npm run dev -- --host 127.0.0.1 --port 3402 --strictPort`
- Frontend proxy override:
  - `STELLINA_API_PROXY_TARGET=http://localhost:3501`

`VITE_API_URL` and `VITE_CORE_API_URL` are no longer used. Vite dev/preview
forward directly and do not execute Vercel logging Functions. See
`frontend/LOGGING.md` for logging tests and deployment verification.

The backend uses the primary Unoventi Supabase project for both modules. Set
`CORE_DATABASE_SCHEMA=uno_core` and
`STELLINA_DATABASE_SCHEMA=uno_stellina`. A legacy
`ADDITIONAL_DATABASES.stellina` entry is not used for normal Stellina access.

## If It Fails

- If the backend virtualenv is missing, run this from `backend/`:

```sh
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

- If frontend dependencies are missing, run this from `frontend/`:

```sh
npm install
```

- If port binding is denied in Codex, request local network permission and rerun the script.
