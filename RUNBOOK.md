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
The frontend's checked-in `.env` uses `3401` so browser requests from
http://localhost:3402 reach the published backend port.

For non-Docker local startup, the helper script runs the backend directly on
host port `3501` and passes matching frontend API overrides.

## Why This Script Exists

Docker is the documented project path, but in the Codex desktop sandbox the Docker socket may be unavailable. The backend's `python -m app` entrypoint also starts Uvicorn with reload enabled unless a production-style `PORT` variable is set, and that file watcher can be blocked locally.

The helper script uses the path verified on June 24, 2026:

- Backend: `backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 3501`
- Frontend: `npm run dev -- --host 127.0.0.1 --port 3402 --strictPort`
- Frontend API overrides:
  - `VITE_API_URL=http://localhost:3501/api/v1/stellina`
  - `VITE_CORE_API_URL=http://localhost:3501/api/v1/core`

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
