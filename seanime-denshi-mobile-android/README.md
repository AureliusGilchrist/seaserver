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
