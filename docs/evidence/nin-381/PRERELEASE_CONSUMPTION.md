# NIN-381 prerelease consumption

Stellina Admin consumes the immutable GitHub Packages artifact `@ninotasca/web-platform@0.1.0-next.0`. Its lockfile resolves the same artifact and integrity as Unoventi Admin, with no filesystem, workspace, tarball, git, or sister-repository dependency.

The package is authoritative for configuration types, browser logging mechanics, safe errors, Core public HTTP transport, auth policy/session decoding, in-memory credentials, auth lifecycle and cross-tab coordination, safe return paths, remote-resource mechanics, shared view-state markup, and UI styles. The copied credential store and auth decoders were removed.

The remaining application adapters own Stellina-specific concerns:

- `config` exposes the registry-bound Stellina deployment selection and product switch.
- `diagnostics` supplies Stellina's reviewed event catalog and product field allowlists.
- `auth/api`, `auth/supabase`, and `AuthProvider` bind Core endpoints, Supabase, React, and the legacy Stellina user shape to the package lifecycle.
- The Axios clients remain product adapters because Stellina features depend on Axios cancellation identity, response metadata, binary upload/download behavior, and reviewed safe-detail translation. Core authentication uses the package public HTTP client; no shared credential or lifecycle mechanics remain in Axios.
- `useRemoteResource` and `ViewState` bind React and Stellina copy to package state and UI primitives. Other controls under `platform/ui` are product-specific form widgets and formatters, not copied platform authority.

Consumer conformance is covered by `test/platform-package.test.js`, the complete application suite, clean type checking/build, and the real-browser auth/state/login suites.
