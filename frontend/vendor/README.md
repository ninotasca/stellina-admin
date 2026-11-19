# Vendored frontend platform release

`ninotasca-web-platform-0.3.1.tgz` is the verified npm package artifact built
from `ninotasca/frontend-platform` version `0.3.1`. Its SHA-512 integrity is
pinned in `package-lock.json`.

The artifact is checked in so production builds do not require a personal
GitHub Packages token. When the shared platform is upgraded, rebuild and
validate the package in `frontend-platform`, replace this tarball, then update
`package.json`, the lockfile, and the package contract test together.
