# Seaserver Denshi Mobile — Android

Connect-only Android client for a Seaserver, built with Capacitor. It is the phone counterpart
of `seanime-denshi-mobile` (the Electron client): it never hosts anything itself, it connects to
the server on your network, and it hot-updates its frontend from the server without a Play Store
or a reinstall.

## How the frontend updates itself

The APK ships with a snapshot of the web build (`seanime-web/out-mobile`), but it never treats it
as final:

1. The bundled frontend carries a shell script (`shell/update-manager.js`, injected at build
   time) which asks the server for the published bundle manifest on launch, every half hour, and
   whenever the app comes back to the foreground.
2. A newer manifest version means download → write to app storage → native unzip
   (`MobileShellPlugin.installFrontend`) into `files/frontend/<version>/` → validation
   (index.html + the shell script must be present) → swap Capacitor's WebView serving directory
   (`setServerBasePath` + `persistServerBasePath`) → reload.
3. The persisted path is restored by Capacitor itself on the next cold start, before the first
   page load — the app simply boots into the newest frontend it has ever seen.

Versions are content-addressed: the version string is the sha256 of the bundle zip, so publishing
a new build always produces a new version, and republishing an identical zip is a no-op the
server recognizes.

The shell layer also owns the connection UX: on first launch (or whenever the configured server
stops answering) it shows a setup overlay to pick the server, seeded synchronously from native
preferences via a small `JavascriptInterface` (`DenshiShellConfig`) so the app's first status
fetch already points at the right place.

## How the APK updates itself

Android does not let an app silently replace its own binary, so the shell does the next best
thing — a one-tap installer hand-off:

1. On launch (20s in), every 24h, and on app resume, the shell asks GitHub for the repo's
   `*-android` prereleases and compares the newest one's workflow run number against the
   running build's `versionCode` (which CI sets to the same run number).
2. When a newer build exists, a small pill appears: **Update** downloads the APK from the
   release, writes it into app storage (`MobileShellPlugin.installApk`), and hands it to the
   system package installer through the FileProvider.
3. The first time, Android asks to allow "install unknown apps" for Denshi Mobile — a one-time
   grant. The shell sends you to the right settings screen and explains; from then on every
   update is download → installer → one confirmation tap.

Older or equal builds are ignored, and a version you dismissed (`Later`) stays dismissed in
localStorage (`sea-apk-shell-dismissed`). Releases here are prereleases — the updater matches
the `v<version>-android` tags only, never the desktop Denshi releases.

## Build

Requirements: JDK 21, Android SDK (platform 35), Node.

```sh
npm install

# 1. web assets: copies ../seanime-web/out-mobile into www/ (build it first if needed)
npm run sync

# 2. the APK
npm run build:apk          # debug   → android/app/build/outputs/apk/debug/app-debug.apk
npm run build:apk:release  # release → android/app/build/outputs/apk/release/app-release-unsigned.apk
```

The launcher icons come from the emblem SVG: `node scripts/make-icons.mjs` (needs `sharp`,
already in devDependencies at time of writing — re-run only after changing the emblem).

## Continuous builds

`.github/workflows/android-release.yml` builds the release APK on every push to `main` that
touches the client or the mobile frontend: it builds `out-mobile`, assembles `www/`, runs
`assembleRelease`, verifies the signature, and attaches the APK to a prerelease
(`v<version>-android`) plus a workflow artifact. The version string flows from `versions.json`
through `sync-versions.js` into `package.json` and the gradle build; `versionCode` is the CI run
number, so every build outranks the last.

For a **signed** release, add these repository secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_B64` | base64 of `android/denshi-mobile.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore's store password |
| `ANDROID_KEY_ALIAS` | key alias (e.g. `denshi-mobile`) |
| `ANDROID_KEY_PASSWORD` | the key password |

Encode the keystore once with:

```sh
base64 -w 0 android/denshi-mobile.keystore
```

(On Windows Git Bash, `base64 -w 0` works; without `-w 0` the wrapped lines still decode
fine with `base64 -d`.)

Without the secrets the workflow still succeeds — the APK falls back to the debug signing key,
which installs but can't update over a release-signed install. Signatures must match across
installs, so add the secrets before publishing the first CI build users will keep.

## Publishing a frontend update

From this directory:

```sh
# build + zip + upload to the server (token = sha256 of the server password)
node scripts/publish-frontend.mjs --upload http://<server>:43211 --password <serverPassword>

# or just produce publish/bundle.zip + publish/manifest.json
node scripts/publish-frontend.mjs
```

Zip rules that keep the update chain alive (the native installer enforces them): the zip contains
the frontend's **contents at the root** (index.html at the root, not inside a folder) and always
includes `shell/update-manager.js`. By default the 350 MB of desktop theme wallpapers in
`out-mobile/themes/` are left out; pass `--include-themes` to publish them anyway.

You can also publish by hand: copy `publish/bundle.zip` and `publish/manifest.json` into the
server data directory under `mobile-frontend/`.

### Server requirement

The upload/check/stream endpoints (`/api/v1/mobile-frontend/publish`, `/manifest`, `/bundle`)
live in the server binary — the NAS must run a build of the server that includes
`internal/handlers/mobile_frontend.go`. An older server answers 404, and the app simply stays on
whatever frontend it has: the update engine treats that as "nothing published".

## Notes

- The app label is "Denshi Mobile"; the server URL, connection mode, and frontend version live in
  localStorage (`sea-remote-server-url`, `sea-server-connection-mode`, `sea-apk-frontend-version`),
  written by the shell script — the same contract the Electron clients use.
- Cleartext HTTP is enabled (`android:usesCleartextTraffic`) because servers on a LAN are plain
  http.
- `seanime-denshi-mobile-android` is connect-only: there is no local server mode.
