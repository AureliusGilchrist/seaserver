# Project notes for Claude

## Versioning — do this on every code update

All components (server, seanime-web, Denshi, Denshi Mobile, Android) share **one** version, kept in
`versions.json` → `"version"` and propagated by `node sync-versions.js`. Never edit the version in
`package.json` or `internal/constants/constants.go` by hand.

Scheme: `X.Y.Z-N`

| When | Command | Effect |
|---|---|---|
| Every code change / test build of an update | `node sync-versions.js --bump-test` | `X.Y.Z-N` → `X.Y.Z-(N+1)` |
| The user confirms a regular update works | `node sync-versions.js --release-patch` | → `X.Y.(Z+1)-0` |
| The user confirms a huge update works | `node sync-versions.js --release-minor` | → `X.(Y+1).0-0` |

- Carry: any of X, Y, Z that goes past **15** resets to 0 and adds 1 to the number before it
  (`5.0.15` + patch → `5.1.0-0`; `5.15.15` + patch → `6.0.0-0`). The `-N` test suffix never carries.
- Commit the version bump together with the change it belongs to.
- The build scripts (`build-all.sh`, `build-all-desktop.ps1`) already call `--bump` (same as
  `--bump-test`) on every build.
- Rules are tested by `node scripts/test-sync-versions.mjs`.
- The Rooms protocol version (`rooms.version`) is separate and is not bumped.
