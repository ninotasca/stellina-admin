# NIN-383 Stellina Admin stable acceptance

Accepted package: exact `@ninotasca/web-platform@0.1.0` from GitHub Packages.

Final gate evidence from a fresh isolated worktree:

- clean authenticated `npm ci` completed from the committed lockfile;
- 196 tests passed, including real-browser auth, unavailable-state, state/UI, proxy, package conformance, architecture, and safe-failure suites;
- type checking, lint, import boundaries, and the production build passed;
- the preview served successfully and returned HTTP success;
- package and lockfile contain no local path, workspace, git, sister-source, or legacy package dependency;
- source audit found no local authoritative auth policy/session decoder, credential store, auth lifecycle, HTTP client factory, or remote-resource implementation;
- the built bundle contains one auth lifecycle marker and one credential-store marker, confirming one packaged implementation.

The retained Axios product adapter and all other application-owned adapters are documented in the NIN-381 evidence. The stable artifact matches the lockfile SHA-1 `062a3156ae7f6f3a1af2f018e7cfbd32f81cda88` and integrity `sha512-BxTmTfrglBHCwALG3uj+9rC+rFvFlQQ23MBK+CnJYmtn4WaP+y2o1sdB7+A5t3IzY90ebWkZAq7yi8XqrBgL5A==`.
