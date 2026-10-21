# Seaserver Denshi Mobile

A connect-only, phone-shaped Electron client for Seaserver. It hosts nothing — it builds its own
frontend from the `seanime-web` checkout on this machine, then connects to the Seaserver instance
running elsewhere (typically the NAS).

A sibling of [`seanime-denshi`](../seanime-denshi), not a fork of its behavior: same privileged
`app://` protocol, same preload surface, same popout player, Discord RPC bridge and Chromecast
sender — with the local-server sidecar removed, a bottom tab dock instead of the desktop sidebar
rail, and the launch build engine pointed at a mobile build of the web app.

## Run it

```powershell
cd seanime-denshi-mobile
npm install
npm start
```

- `npm run dev` — same, with `NODE_ENV=development`.
- First launch builds the frontend (a few minutes); every launch after that skips the build when
  the `seanime-web` source is unchanged (SHA-1 of `src/**` plus the config files).
- The frontend source is found by walking up from the app's own directories until a folder that
  contains `seanime-web/package.json` shows up — i.e. run it from inside the repo checkout, or set
  `sourceRepoPath` in `%APPDATA%/seanine-denshi-mobile/denshi-mobile-settings.json`.

## Where things live

| Path | What it is |
| --- | --- |
| `%APPDATA%/seanine-denshi-mobile/` | user data: settings, server connection, build state |
| `.../live/web-mobile/` | the staged frontend actually served over `app://` |
| `.../mobile-build-state.json` | source hash of the last successful build |
| `.../server-connection.json` | `{ "mode": "remote", "remote_url": ... }` — the only mode |
| `src/main.js` | the shell: boot machine, windows, IPC, Discord, cast |
| `src/mobile-build.js` | the launch build engine (hash → build → stage → activate) |
| `src/preload.js` | the renderer bridge (whitelisted channels only) |
| `splash/splash.html` | the static boot page: build progress, setup, connection |
| `web-mobile/` | optional bundled fallback build for packaged installs |

## Boot flow

1. Splash window opens (always — with no tray, an invisible launch would strand the app).
2. The frontend build runs unless the source hash matches the last build. Progress streams to the
   splash; a failure offers **Try again**, and **Continue anyway** when a previous good build exists.
3. With a frontend ready, the splash either shows one-time setup (validate → save → plant the
   remote URL in `localStorage` on the shared `app://` origin) or, when a server connection is
   already configured, connects immediately and hands off to the main window.
4. Main window: 430×932 portrait, custom-drawn title bar, deferred load so setup never spawns
   WebSocket retries in a hidden window.

## Connect-only rules

- `server-config:save` rejects anything but `mode: "remote"` — the shell will not host a server,
  and it says so rather than silently converting the request.
- The server URL is validated with a 5-second `GET /api/v1/status` before it is saved.

## Desktop parity

`.env.mobile` sets both `NEXT_PUBLIC_PLATFORM=mobile` and `NEXT_PUBLIC_DESKTOP=electron`, so the
frontend runs the entire Electron feature surface — native player, popout player, Discord RPC,
Chromecast — while `__isMobileShell__` swaps the navigation to the bottom dock and keeps the
sidebar mounted only as a drawer.

## Packaging

`npm run build` (electron-builder) ships `src/`, `splash/`, `assets/` and — if present —
`web-mobile/` as the offline fallback build. Copy `seanime-web/out-mobile/` into
`seanime-denshi-mobile/web-mobile/` before packaging to include it.
