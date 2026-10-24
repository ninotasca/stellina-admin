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
Vite selects the appropriate mode-specific file automatically. Use ignored,
mode-specific local files for developer-only public overrides. For example,
`frontend/.env.development.local` may temporarily show test bookings without
affecting a local production build. Never place a backend secret in a `VITE_*`
variable because Vite exposes it to the browser.

The server-side API proxy uses a safe `INFO` logging default in production;
development traffic is proxied directly by Vite. A hosted `STELLINA_LOG_LEVEL`
override is optional rather than required frontend configuration.
