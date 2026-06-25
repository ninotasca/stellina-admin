# Stellina Admin Local Runbook

Use this when the user asks to get the site running locally.

## Known Good Local Startup

From the repository root:

```sh
./scripts/start-local-dev.sh
```

Expected URLs:

- Frontend: http://localhost:3402
- Backend health: http://localhost:3501/health
- Backend docs: http://localhost:3501/docs

## Why This Script Exists

Docker is the documented project path, but in the Codex desktop sandbox the Docker socket may be unavailable. The backend's `python -m app` entrypoint also starts Uvicorn with reload enabled unless a production-style `PORT` variable is set, and that file watcher can be blocked locally.

The helper script uses the path verified on June 24, 2026:

- Backend: `backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 3501`
- Frontend: `npm run dev -- --host 127.0.0.1 --port 3402 --strictPort`
- Frontend API overrides:
  - `VITE_API_URL=http://localhost:3501/api/v1/stellina`
  - `VITE_CORE_API_URL=http://localhost:3501/api/v1/core`

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
