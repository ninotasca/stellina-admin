# Stellina Admin

Stellina Admin is a frontend-only repository. Its local frontend runs at
`http://127.0.0.1:3401` and uses the shared Unoventi API at
`http://127.0.0.1:3301`.

Start the API first, then run `./scripts/start-local-dev.sh`. The persistent
port and proxy configuration live in that script and `frontend/vite.config.ts`.
See `RUNBOOK.md` for the complete local workflow.

## Configuration

Public defaults are committed in `frontend/.env`; environment-specific public
values live in `frontend/.env.development` and `frontend/.env.production`.
Use ignored `frontend/.env.local` only for developer-specific overrides. Never
place a backend secret in a `VITE_*` variable because Vite exposes it to the
browser.
