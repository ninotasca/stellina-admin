# Stellina Admin repository guidance

This is the frontend repository for Stellina Admin. Do not add backend source,
database migrations, or server credentials here.

The canonical backend is `/Users/ninotasca/dev/unoventi/unoventi-api`:

- Stellina business routes: `app/modules/stellina`
- Shared platform routes: `app/modules/core`
- Stellina API prefix: `/api/v1/stellina`
- Shared API prefix: `/api/v1/core`
- Stellina database schema: `uno_stellina`

Local development expects the shared API at `http://127.0.0.1:3301` and the
frontend at `http://127.0.0.1:3401`. Production same-origin API routes are
rewritten to `https://api.unoventi.ai`.

When a task changes an API contract, inspect and update both this repository and
`unoventi-api`. Stellina code may depend on shared core contracts; it must not
depend on another product's module or schema.
