# Seanime Fork — Player, Streaming & Extensions Work Plan

> Handoff document for continuing work on the **seaserver** fork of Seanime.
> Captures everything done and everything still pending from the prior working session.
> Workspace root: `e:\Main\server\seaserver`

---

## 0. Context you need up front

- This is a **fork** of upstream `5rahim/seanime`. Fork version branding is `v2.4.2 "Karasu"` (branding only). Upstream latest was `v3.8.7 "Kanata"`. The fork already tracks a modern codebase (rsbuild + TanStack Router) and contains the full upstream **`video-core`** player plus fork-only additions.
- The user runs the **Denshi desktop app** (Electron shell + Go sidecar server), NOT just the plain web server.
- **All player surfaces already use the modern `video-core` player** (online, local/mediastream, native). The old Vidstack `sea-media-player` is retired for playback (only a leftover `useSkipData` hook is still imported in a couple places — cosmetic dedupe opportunity, not a bug).

### Build & embed pipeline (CRITICAL — most "missing feature" reports are stale builds)
- Go server embeds the web UI via `//go:embed all:web` in `main.go`. Serving stale `web/` = user sees old UI.
- Frontend source: `seanime-web/src`. Build outputs:
  - `pnpm build` → `seanime-web/out/` → copy to repo-root `web/` (plain server).
  - `pnpm build:denshi` → `seanime-web/out-denshi/` → copy to `seanime-denshi/web-denshi/` (Denshi).
- Denshi desktop app = three artifacts:
  1. `seanime-denshi/web-denshi/` (frontend bundle, packaged into asar)
  2. `seanime-denshi/binaries/seanime-server-windows.exe` (Go sidecar server)
  3. `seanime-denshi/dist/seanime-denshi-*.exe` (electron-builder installer)

### Build commands (Windows PowerShell, from repo root)
```powershell
# Plain web server
cd seanime-web; pnpm --config.verify-deps-before-run=false build; cd ..
Remove-Item .\web -Recurse -Force; Copy-Item .\seanime-web\out .\web -Recurse
go build -o seanime.exe .

# Denshi frontend + sidecar
cd seanime-web; pnpm --config.verify-deps-before-run=false build:denshi; cd ..
Remove-Item .\seanime-denshi\web-denshi -Recurse -Force
Copy-Item .\seanime-web\out-denshi .\seanime-denshi\web-denshi -Recurse
go build -trimpath '-ldflags=-s -w' -o seanime.exe .
Copy-Item -Force .\seanime.exe .\seanime-denshi\binaries\seanime-server-windows.exe

# Denshi full installer
cd seanime-denshi; npm run build:win
```

### Gotchas learned
- `pnpm build` auto-runs a pre-build dep check that fails on ignored build scripts (core-js/esbuild). Bypass with `pnpm --config.verify-deps-before-run=false build`. Do NOT modify `package.json` for this.
- `grep_search` with an `includePattern` containing literal `(main)` parens returns EMPTY (glob issue). Search whole repo or use `file_search`.
- `grep_search` skips `node_modules` (gitignored) unless `includeIgnoredFiles: true`.
- Code signing is skipped in the installer (no cert) — normal; Windows shows "unknown publisher".

---

## 1. Original user requests (the 5 asks)

1. **First-launch lag** — on first app launch, subtitles/stream lag until it "fixes itself." Make it work immediately.
2. **Player parity with latest upstream** + two additions: **opening/ending split** (separate skip toggles) and **Filler Skip** (auto-skip filler). Modernize ALL players (the "older" online one included) to have all brand-new features.
3. **Pop-out** feature that works with subtitles — watch local/online while matching anime.
4. **Dedicated local player page** like the online player (episode list, descriptions, everything the online page has) — not just fullscreen/mini.
5. **Extensions area** — streaming providers disappeared; restore them.

### Decisions captured from user
- Player: match upstream, but implemented as **port-and-merge** to preserve fork features. Modernize the online player fully (all VideoCore features).
- OP/ED split = **separate toggles** for skip-opening vs skip-ending.
- Filler Skip = **auto-skip** using an external filler database (real backend, not stub).
- Pop out = separate **window** that keeps subtitles.
- Extensions = **fix marketplace fetch AND bundle** a fallback.

---

## 2. Work COMPLETED this session (all shipped into Denshi build)

### ✅ Request #1 — First-launch lag (DONE)
Root cause: ffmpeg/ffprobe cold-start + hardware-accel probing ran lazily on the *first* stream.
- `internal/mediastream/transcoder/hwaccel.go` — memoized `ffmpeg -filters` output (`getFFmpegFilters` + cache), added `WarmUpHardwareAccel()`. The inner `probeFFmpegFilter` now uses the cache (no per-call ffmpeg spawn).
- `internal/mediastream/repository.go` — added `warmUp()` (warms filter cache + `ffprobe -version`), fired async from `InitializeModules`. Added `os/exec` import.
- Verified: `go build ./...` EXIT 0.

### ✅ Request #2 — Already existed + verified (DONE, no code change needed)
The **local VideoCore player already has**:
- Separate OP/ED skip toggles: `vc_autoSkipOPAtom` + `vc_autoSkipEDAtom` (with migration from legacy combined `vc_autoSkipOPEDAtom`) in `seanime-web/src/app/(main)/_features/video-core/video-core.atoms.ts` (~L177).
- Filler auto-skip: `vc_autoSkipFillerAtom`, with settings toggles in `video-core-settings-menu.tsx` (~L220-235).
- **Real filler backend**: `internal/api/filler/`, `fillermanager` package, `HandlePopulateFillerData` handler, `AnimeEntryFillerHydrationEvent` hook.
- The online page (`onlinestream/_containers/onlinestream-page.tsx`) already uses VideoCore (VideoCoreProvider, VideoCoreInlineLayout, video-core-hls). It only imports the `useSkipData` hook from the old folder — harmless.
- **Root cause the user thought these were missing**: stale embedded `web/` bundle (was from a prior date). Fixed by rebuild.

### ✅ Request #3 — Pop-out with subtitles (EXISTS)
`video-core-pip.ts` — `VideoCorePipManager` composites subtitles onto a canvas and pipes that as the PiP video (`pipProxy` + `setSubtitleManager`/`setMediaCaptionsManager`), so the floating PiP window keeps subtitles. Control bar has a PiP button + `KeyP` keybind. This satisfies "pop out with subtitles" via browser PiP. (Optional upgrade: Document Picture-in-Picture for a richer separate window — see Pending.)

### ✅ Request #4 — Dedicated local page (EXISTS)
`mediastream/page.tsx` is already a dedicated page using the same `SeaMediaPlayerLayout` as online, with episode list (`EpisodeGridItem`), descriptions (`MediaEpisodeInfoModal`: summary/overview/airdate/length), episode selection (`onPlayFile`), filler badges, watched progress, and the VideoCore player (`MediastreamVideoCore`). Not a fullscreen/mini overlay.

### ✅ Request #5 — Extensions streaming providers (DONE, mechanism)
**Root cause (important): NOT a fork bug.** Upstream `5rahim/seanime-extensions` marketplace.json **no longer serves any streaming/torrent/manga providers** — every entry is now `type: "plugin"` or `"custom-source"`. Upstream purged them (legal). So the section is empty because there's nothing to show.
- `internal/extension_repo/marketplace.go` — `GetMarketplaceExtensions` now **merges multiple marketplace URLs** (split on newline/comma/semicolon), dedupes by ID, resilient to partial failures, always includes the default. Added `parseMarketplaceUrls()`. Added `strings` import.
- `seanime-web/src/app/(main)/extensions/_containers/marketplace-extensions.tsx` — "Change Repository" modal now accepts **multiple URLs** (TextInput → Textarea, per-URL validation), Source line shows "Official repository + N custom source(s)". The `onlinestream-provider` tab + grouping already existed.
- **User action required**: paste a trusted community provider marketplace URL in Extensions → Change Repository (we deliberately did NOT hardcode a third-party scraper repo — trust/legal decision for the user).
- Verified: `go build ./...` EXIT 0; frontend type-check (tsgo) passed.

### ✅ Bug — Online player subtitle crash (DONE)
Symptom: toasts "Failed to load subtitle track: TypeError: Cannot read properties of undefined (reading 'apply')" and "Error initializing libass renderer: ...".
Root cause: **jassub 2.4.1 creates its Web Worker as `type: "module"`** (see `node_modules/jassub/dist/jassub.js` ~L63-64), but `seanime-web/rsbuild.config.ts` `processJassub()` transpiled the worker with esbuild `format: "iife"`. A module worker needs an ES module; the IIFE bundle broke jassub's `abslink` worker handshake → the `.apply` on undefined error. (The earlier `pnpm install` bumped jassub to a module-worker version, exposing the mismatch.)
Fix: in `rsbuild.config.ts` `processJassub()`, changed esbuild `format: "iife"` → `"esm"` and removed the `define: { "import.meta.url": "self.location.href" }` (native in ESM worker).
Verified: rebuilt worker is valid ESM (~179974 bytes, starts `var __defProp`).
DEBUNKED hypotheses (don't revisit): stale/v1 worker asset (no, freshly generated); `.renderer.addFonts` wrong API (no, API is correct — `renderer` is a valid `Remote<ASSRenderer>` proxy).

### ✅ Bug — Fullscreen playback lag (DONE)
Root cause: in fullscreen, jassub renders the ASS overlay onto a large (up to `maxRenderHeight` = 1080) ARGB canvas composited every frame. For ≤720p online streams, subtitles were rendered at a HIGHER resolution than the video itself = wasted GPU → stutter.
Note: jassub 2.x **removed** `offscreenRender`/`asyncRender`/`dropAllAnimations` options (always worker + OffscreenCanvas). Remaining perf levers: `prescaleFactor`, `prescaleHeightLimit`, `maxRenderHeight` (all public/settable; `maxRenderHeight` read live and reapplied on `resize()`).
Fix: in `video-core-subtitles.ts` `loadedmetadata` listener, set
`this.libassRenderer.maxRenderHeight = Math.min(1080, Math.max(720, video.videoHeight))` then `resize()`. Caps subtitle render to source resolution (720–1080 clamp) — no visible quality loss (video upscaled to same size), big GPU savings for sub-1080p streams; 1080p sources unchanged. Constructor still sets `maxRenderHeight: 1080` for the initial pre-metadata state.
- The fork is actually AHEAD of upstream here (upstream doesn't cap `maxRenderHeight` at all).

### ✅ Denshi desktop build (DONE)
All of the above were rebuilt into Denshi:
- `seanime-denshi/web-denshi/` refreshed (ESM worker + fullscreen fix + extensions).
- `seanime-denshi/binaries/seanime-server-windows.exe` rebuilt (lag + extensions backend).
- Full installer rebuilt: `seanime-denshi/dist/seanime-denshi-4.1.2-0_Windows_x64.exe` (~698 MB). Packages web-denshi (asar) + binaries (extraResources).

---

## 3. Files touched (for quick diff/review)

| File | Change |
|---|---|
| `internal/mediastream/transcoder/hwaccel.go` | Memoized `ffmpeg -filters` cache; `getFFmpegFilters`, `WarmUpHardwareAccel` |
| `internal/mediastream/repository.go` | Async `warmUp()` from `InitializeModules`; `os/exec` import |
| `internal/extension_repo/marketplace.go` | Multi-URL marketplace merge; `parseMarketplaceUrls`; `strings` import |
| `seanime-web/src/app/(main)/extensions/_containers/marketplace-extensions.tsx` | Multi-URL Change Repository modal (Textarea + validation) |
| `seanime-web/rsbuild.config.ts` | jassub worker esbuild `iife` → `esm` (subtitle crash fix) |
| `seanime-web/src/app/(main)/_features/video-core/video-core-subtitles.ts` | Adaptive `maxRenderHeight` cap on `loadedmetadata` (fullscreen lag fix) |

---

## 4. PENDING / NOT DONE (pick up here)

### A. Full player port to latest upstream (deferred — large, higher risk)
User said "continue with the latest upstream version." The player is largely already upstream-equivalent and in some areas ahead. A full sync of `video-core` (+ `native-player`, `onlinestream`) to upstream `3.8.7` is a big, regression-prone effort. Recommended approach: **incremental, testable stages**, validating playback (online HLS, local, torrent/debrid) between each. Do NOT blind-overwrite (would delete fork-only features like `video-core-resume-prompt.tsx`, `video-core-auto-progress.tsx`, custom branding).
- Upstream reference files to diff against (may be newer): `video-core-hls.ts`, `video-core-cast.tsx`, `video-core-events.ts`, subtitle/pip refactors.

### B. Pop-out upgrade: Document Picture-in-Picture (optional)
Current PiP is browser PiP with subtitles composited onto a canvas — already works. If the user wants a richer, resizable **separate window** (Document PiP API) carrying the full video + JASSUB/PGS subtitle canvas and synced controls, extend `video-core-pip.ts` and add a button/keybind in `video-core-control-bar.tsx`. Denshi (Electron) could alternatively use a native BrowserWindow.

### C. Extensions — provider source still needs a URL (blocked on user)
The merge mechanism is built, but streaming providers won't appear until the user adds a trusted community marketplace URL (upstream serves none). Options if the user wants it built-in:
- Wire a user-provided marketplace URL as an additional default in `internal/constants/constants.go` / the frontend default.
- Or bundle built-in providers in `internal/core/extensions.go` (currently registers manga/torrent built-ins but NO streaming providers).
Awaiting the user to name a provider source they trust.

### D. Cosmetic dedupe (low priority)
Point the `useSkipData` imports in `onlinestream-page.tsx` / `mediastream-videocore.tsx` / native player to `video-core/_lib/aniskip.ts` instead of the old `sea-media-player/aniskip` to fully retire the old folder.

### E. Verification still owed
- Confirm with the user that after installing the new Denshi build: first-launch lag gone, online subtitles load, fullscreen is smooth.
- If fullscreen still lags on a **1080p source at 1080p display** (where the subtitle cap doesn't help), investigate the video decode path / Anime4K (`video-core` Anime4K manager, `requestVideoFrameCallback` usage) rather than subtitles.

---

## 5. Key file map (reference)

**Backend (Go)**
- Startup/init: `internal/core/` (modules init), `internal/mediastream/repository.go`
- Transcode/HLS: `internal/mediastream/transcoder/` (`hwaccel.go`, `keyframes.go`), `internal/mediastream/playback.go`
- Direct play: `internal/directstream/` (`subtitles.go`, `localfile.go`)
- Filler: `internal/api/filler/`, `fillermanager`
- Extensions: `internal/extension/`, `internal/extension_repo/` (`marketplace.go`, `external_onlinestream_provider.go`), `internal/core/extensions.go`, `internal/handlers/extensions.go`, `internal/constants/constants.go` (`DefaultExtensionMarketplaceURL`)

**Frontend (seanime-web/src/app/(main))**
- Player core: `_features/video-core/` — `video-core.tsx`, `video-core.atoms.ts`, `video-core-settings-menu.tsx`, `video-core-subtitles.ts`, `video-core-pgs-renderer.ts`, `video-core-pip.ts`, `video-core-fullscreen.ts`, `video-core-control-bar.tsx`, `video-core-hls.ts`, `_lib/aniskip.ts`, `_lib/aniskip.utils.ts`. Fork-only: `video-core-resume-prompt.tsx`, `video-core-auto-progress.tsx`.
- Online page: `onlinestream/_containers/onlinestream-page.tsx`
- Local page: `mediastream/page.tsx`, `mediastream/_lib/mediastream-videocore.tsx`
- Extensions UI: `extensions/page.tsx`, `extensions/_containers/marketplace-extensions.tsx`, `extensions/_lib/marketplace.atoms.ts`
- Build: `seanime-web/rsbuild.config.ts` (see `processJassub`), `seanime-web/Makefile`, `seanime-web/package.json`

**Denshi**
- `seanime-denshi/package.json` (electron-builder config, `build:denshi`, `build:win`), `seanime-denshi/web-denshi/`, `seanime-denshi/binaries/seanime-server-windows.exe`, `seanime-denshi/dist/`

---

## 6. Suggested next-step order for the new session
1. Have user install the new Denshi build and confirm the 4 fixes (lag, subtitle crash, fullscreen, extensions UI).
2. Get a trusted streaming-provider marketplace URL from the user → wire as default (Pending C).
3. If fullscreen still lags on true 1080p: investigate decode/Anime4K (Pending E).
4. Only then, if desired, start the incremental upstream player port (Pending A) in small tested stages.
5. Optional: Document PiP upgrade (Pending B) and dedupe (Pending D).
