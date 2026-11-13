const path = require("path")
const fs = require("fs")
const os = require("os")
const { spawn } = require("child_process")
const { net } = require("electron")
const { getLiveWebDir } = require("./live-update")

// Live frontend updates, no GitHub release involved.
//
// .github/workflows/frontend-live.yml builds only the Denshi frontend on every push that touches
// seanime-web and force-pushes it as the single commit of the orphan branch "frontend-live":
// frontend-live.zip (the build, minus the theme wallpapers), the same build file by file under
// files/, and frontend-live.json (its manifest, with every file's hash). Denshi watches that
// branch's head every ten seconds through git's own ref listing (a 74-byte answer, always fresh
// and outside the REST API's 60-an-hour limit, which the old once-a-minute API check used up).
// When the head moves, the manifest is fetched from raw.githubusercontent.com pinned to that
// commit (a branch URL there is CDN-cached for minutes; a commit URL is never stale), only the
// files whose hash differs from the installed frontend are downloaded (the zip when the manifest
// has no file list or most of the build changed), and the windows reload once nothing is playing.
const GITHUB_REPO = "AureliusGilchrist/seaserver"
const LIVE_BRANCH = "frontend-live"
const MANIFEST_FILE = "frontend-live.json"
const POLL_INTERVAL_MS = 10_000
const DELTA_CONCURRENCY = 8
// Past this share of the build's bytes, one zip download beats many file downloads.
const DELTA_MAX_SHARE = 0.5
const RATE_LIMITED_INTERVAL_MS = 5 * 60_000
const PLAYING_RECHECK_MS = 15_000
const API_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000
const HEADERS = { "User-Agent": "seanime-denshi" }

function createGitHubFrontendUpdater({ app, log, isDevelopment, emitProgress, reloadWindows, isOtherUpdateRunning, isMediaPlaying, getBundledWebDir }) {
    let busy = false
    let lastPercent = 0
    let headEtag = null
    let headSha = null
    let manifestCache = null // { sha, manifest }
    let pollTimer = null
    let pendingReload = false

    function emitStep(percent, step) {
        lastPercent = percent
        log.info(`[FrontendLive] [${percent}%] ${step}`)
        emitProgress({ target: "frontend", line: `Frontend update: [${String(percent).padStart(2, "0")}%] ${step}` })
    }

    function emitFailure(message) {
        log.error(`[FrontendLive] Failed: ${message}`)
        emitProgress({
            target: "frontend",
            line: `Frontend update: [${String(lastPercent).padStart(2, "0")}%] Failed - ${message}`,
        })
    }

    // Next to the live dir: what the live frontend is and where it came from. Written by this
    // updater; a local build from source removes it (live-update.js).
    function getMarkerPath() {
        return path.join(path.dirname(getLiveWebDir(app)), "frontend-version.json")
    }

    function readMarker() {
        try {
            const m = JSON.parse(fs.readFileSync(getMarkerPath(), "utf8"))
            return m && m.version ? m : null
        } catch {
            return null
        }
    }

    function mtimeOf(file) {
        try {
            return fs.statSync(file).mtime.toISOString()
        } catch {
            return null
        }
    }

    // What is being served now, and from when. `since` is what a live build has to be newer
    // than: the commit time of an installed live build, otherwise when the frontend in use was
    // built (a local build or the one bundled with the app).
    function currentInstall() {
        const marker = readMarker()
        const liveIndex = path.join(getLiveWebDir(app), "index.html")
        if (marker && fs.existsSync(liveIndex)) {
            return {
                version: String(marker.version),
                commit: marker.commit ?? null,
                source: "github",
                installedAt: marker.installedAt ?? null,
                since: marker.commitTime ?? marker.installedAt ?? null,
            }
        }
        if (fs.existsSync(liveIndex)) {
            return { version: null, commit: null, source: "local", installedAt: mtimeOf(liveIndex), since: mtimeOf(liveIndex) }
        }
        const bundledIndex = path.join(getBundledWebDir(), "index.html")
        return { version: app.getVersion(), commit: null, source: "bundled", installedAt: null, since: mtimeOf(bundledIndex) }
    }

    function withTimeout(ms, promise, what) {
        let timer
        return Promise.race([
            promise,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms) }),
        ]).finally(() => clearTimeout(timer))
    }

    // The branch head over git's smart HTTP protocol (v2 ls-refs, filtered to the one branch).
    // Not part of the REST API, so not rate limited, and never cached.
    async function fetchHeadGit() {
        const pkt = (line) => (line.length + 4).toString(16).padStart(4, "0") + line
        const body = pkt("command=ls-refs\n") + "0001" + pkt(`ref-prefix refs/heads/${LIVE_BRANCH}\n`) + "0000"
        const res = await withTimeout(API_TIMEOUT_MS, net.fetch(`https://github.com/${GITHUB_REPO}.git/git-upload-pack`, {
            method: "POST",
            headers: {
                ...HEADERS,
                "Git-Protocol": "version=2",
                "Content-Type": "application/x-git-upload-pack-request",
                Accept: "application/x-git-upload-pack-result",
            },
            body,
            cache: "no-store",
        }), "Checking for a new frontend")
        if (!res.ok) throw new Error(`git ls-refs returned HTTP ${res.status}`)
        const text = await res.text()
        const m = text.match(/([0-9a-f]{40}) refs\/heads\/(\S+)/)
        if (m && m[2] === LIVE_BRANCH) return m[1]
        if (/^0000\s*$/.test(text)) throw new Error("No frontend-live build has been published yet")
        throw new Error("Unexpected answer from git ls-refs")
    }

    // The branch head: git first, then the REST API (conditional, so an unchanged head is a 304),
    // and last the branch's raw manifest (CDN-cached up to five minutes).
    async function fetchHead() {
        try {
            headSha = await fetchHeadGit()
            return { sha: headSha, rateLimited: false }
        } catch (err) {
            if (/No frontend-live build/.test(err.message)) return { sha: null, rateLimited: false, error: err }
            log.warn(`[FrontendLive] git ref check failed, trying the API: ${err.message}`)
        }
        return fetchHeadApi()
    }

    async function fetchHeadApi() {
        const headers = { ...HEADERS, Accept: "application/vnd.github+json" }
        if (headEtag && headSha) headers["If-None-Match"] = headEtag
        let res
        try {
            res = await withTimeout(API_TIMEOUT_MS, net.fetch(
                `https://api.github.com/repos/${GITHUB_REPO}/git/ref/heads/${LIVE_BRANCH}`,
                { headers, cache: "no-store" },
            ), "Checking for a new frontend")
        } catch (err) {
            return { sha: null, rateLimited: false, error: err }
        }
        if (res.status === 304) return { sha: headSha, rateLimited: false }
        if (res.ok) {
            const body = await res.json()
            headEtag = res.headers.get("etag")
            headSha = body?.object?.sha ?? null
            return { sha: headSha, rateLimited: false }
        }
        const rateLimited = res.status === 403 || res.status === 429
        if (res.status === 404) return { sha: null, rateLimited: false, error: new Error("No frontend-live build has been published yet") }
        return { sha: null, rateLimited, error: new Error(`GitHub API returned HTTP ${res.status}`) }
    }

    function rawUrl(ref, file) {
        return `https://raw.githubusercontent.com/${GITHUB_REPO}/${ref}/${file}`
    }

    async function fetchManifest(ref) {
        if (manifestCache && manifestCache.sha === ref) return manifestCache.manifest
        const res = await withTimeout(API_TIMEOUT_MS, net.fetch(rawUrl(ref, MANIFEST_FILE), { headers: HEADERS, cache: "no-store" }), "Reading the frontend manifest")
        if (!res.ok) throw new Error(`Manifest download failed (HTTP ${res.status})`)
        const manifest = await res.json()
        if (!manifest?.commit || !manifest?.asset) throw new Error("The frontend manifest is incomplete")
        // A branch ref ("frontend-live") is not a stable key; a commit sha is.
        if (/^[0-9a-f]{40}$/.test(ref)) manifestCache = { sha: ref, manifest }
        return manifest
    }

    // The newest live build: { ref, manifest } with ref the branch commit to fetch files at.
    async function fetchLatest() {
        const head = await fetchHead()
        if (head.sha) return { ref: head.sha, manifest: await fetchManifest(head.sha), rateLimited: false }
        if (head.error && /No frontend-live build/.test(head.error.message)) throw head.error
        // API down or rate limited: the branch URL still works, just a few minutes behind.
        try {
            return { ref: LIVE_BRANCH, manifest: await fetchManifest(LIVE_BRANCH), rateLimited: head.rateLimited }
        } catch {
            throw head.error ?? new Error("Could not reach GitHub")
        }
    }

    function label(manifest) {
        return `${manifest.version} (${String(manifest.commit).slice(0, 7)})`
    }

    function isNewer(manifest, current) {
        if (current.commit && current.commit === manifest.commit) return false
        if (!current.since || !manifest.commitTime) return true
        return new Date(manifest.commitTime).getTime() > new Date(current.since).getTime()
    }

    async function check() {
        try {
            const { manifest } = await fetchLatest()
            const current = currentInstall()
            const updateAvailable = isNewer(manifest, current)
            return {
                ok: true,
                current: current.version,
                currentCommit: current.commit,
                currentSource: current.source,
                installedAt: current.installedAt,
                latest: manifest.version,
                latestCommit: manifest.commit,
                latestCommitTime: manifest.commitTime ?? null,
                latestBuiltAt: manifest.builtAt ?? null,
                tag: String(manifest.commit).slice(0, 7),
                assetName: manifest.asset,
                assetSize: manifest.size ?? null,
                releaseUrl: `https://github.com/${GITHUB_REPO}/commit/${manifest.commit}`,
                updateAvailable,
                // The install button also carries a local or bundled frontend over to the live one.
                canInstall: updateAvailable || (current.source !== "github" && current.commit !== manifest.commit),
                pendingReload,
            }
        } catch (err) {
            const message = err?.message ?? String(err)
            return { ok: false, error: message }
        }
    }

    function runCmd(cmd, args) {
        return new Promise((resolve) => {
            let child
            try {
                child = spawn(cmd, args, { windowsHide: true })
            } catch {
                return resolve(false)
            }
            child.on("error", () => resolve(false))
            child.on("close", code => resolve(code === 0))
        })
    }

    async function extractZip(zipPath, dest) {
        // Windows 10+ ships bsdtar as tar.exe, which unpacks zips and is far quicker than
        // Expand-Archive on a frontend's worth of small files. PowerShell is the fallback.
        if (process.platform === "win32") {
            if (await runCmd("tar", ["-xf", zipPath, "-C", dest])) return
            const quote = (p) => `'${String(p).replace(/'/g, "''")}'`
            const ps = `Expand-Archive -LiteralPath ${quote(zipPath)} -DestinationPath ${quote(dest)} -Force`
            if (await runCmd("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps])) return
            throw new Error("Could not unpack the bundle (tar and PowerShell both failed)")
        }
        if (await runCmd("unzip", ["-o", "-q", zipPath, "-d", dest])) return
        if (await runCmd("tar", ["-xf", zipPath, "-C", dest])) return
        throw new Error("Could not unpack the bundle (unzip and tar both failed)")
    }

    function sha256Of(buf) {
        return require("crypto").createHash("sha256").update(buf).digest("hex")
    }

    // Builds the new frontend in `dest` from the manifest's file list: files the installed
    // frontend (live, else bundled) already has with the same hash are copied, the rest are
    // downloaded at the branch commit. Returns false when one zip download is the better deal.
    async function installDelta(ref, manifest, dest) {
        const entries = Object.entries(manifest.files)
        const sources = [getLiveWebDir(app), getBundledWebDir()].filter(d => d && fs.existsSync(path.join(d, "index.html")))
        const localCopy = (rel, want) => {
            for (const dir of sources) {
                const file = path.join(dir, ...rel.split("/"))
                try {
                    const st = fs.statSync(file)
                    if (st.isFile() && st.size === want.size && sha256Of(fs.readFileSync(file)) === want.sha256) return file
                } catch { /* not there */ }
            }
            return null
        }

        const toFetch = []
        let totalBytes = 0, fetchBytes = 0
        for (const [rel, want] of entries) {
            if (rel.split("/").includes("..") || path.isAbsolute(rel)) throw new Error(`Bad path in the manifest: ${rel}`)
            totalBytes += want.size
            const target = path.join(dest, ...rel.split("/"))
            const local = localCopy(rel, want)
            if (local) {
                fs.mkdirSync(path.dirname(target), { recursive: true })
                fs.copyFileSync(local, target)
            } else {
                toFetch.push([rel, want, target])
                fetchBytes += want.size
            }
        }
        const kb = Math.round(fetchBytes / 1024)
        if (totalBytes > 0 && fetchBytes / totalBytes > DELTA_MAX_SHARE) {
            log.info(`[FrontendLive] ${toFetch.length} of ${entries.length} files changed (${kb} KB); using the zip`)
            return false
        }

        emitStep(25, `Downloading ${toFetch.length} changed file${toFetch.length === 1 ? "" : "s"} (${kb} KB) of ${label(manifest)}`)
        const dir = manifest.filesDir || "files"
        let next = 0
        const worker = async () => {
            while (next < toFetch.length) {
                const [rel, want, target] = toFetch[next++]
                const url = rawUrl(ref, `${dir}/${rel.split("/").map(encodeURIComponent).join("/")}`)
                const res = await withTimeout(DOWNLOAD_TIMEOUT_MS, net.fetch(url, { headers: HEADERS, cache: "no-store" }), `Downloading ${rel}`)
                if (!res.ok) throw new Error(`Download of ${rel} failed (HTTP ${res.status})`)
                const buf = Buffer.from(await res.arrayBuffer())
                if (sha256Of(buf) !== want.sha256) throw new Error(`${rel} does not match its manifest`)
                fs.mkdirSync(path.dirname(target), { recursive: true })
                fs.writeFileSync(target, buf)
            }
        }
        await Promise.all(Array.from({ length: Math.min(DELTA_CONCURRENCY, toFetch.length) }, worker))
        log.info(`[FrontendLive] Fetched ${toFetch.length} of ${entries.length} files (${kb} KB); copied the rest`)
        return true
    }

    async function installZip(ref, manifest, staging, zipPath) {
        emitStep(15, `Downloading ${label(manifest)}`)
        const res = await withTimeout(DOWNLOAD_TIMEOUT_MS, net.fetch(rawUrl(ref, manifest.asset), { headers: HEADERS, cache: "no-store" }), "Downloading the frontend bundle")
        if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 1024) throw new Error("The downloaded file is too small to be a frontend bundle")
        // The branch moved between reading the manifest and the zip (only possible on the
        // branch-URL fallback); the next check picks up the newer one.
        if (manifest.sha256 && sha256Of(buf) !== manifest.sha256) throw new Error("The bundle does not match its manifest; will retry")
        fs.writeFileSync(zipPath, buf)

        emitStep(55, "Unpacking the frontend bundle")
        await extractZip(zipPath, staging)
    }

    function resolveWebRoot(dir) {
        if (fs.existsSync(path.join(dir, "index.html"))) return dir
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())
        } catch {
            return null
        }
        if (entries.length === 1 && fs.existsSync(path.join(dir, entries[0].name, "index.html"))) {
            return path.join(dir, entries[0].name)
        }
        return null
    }

    // Swaps the staged build in. The theme wallpapers aren't in a live bundle, so the ones the
    // current live frontend has move across (a rename, instant); a frontend without them falls
    // back to the bundled copy (see setupAppProtocol in main.js).
    function swapIn(webRoot) {
        const liveWeb = getLiveWebDir(app)
        const oldWeb = liveWeb + ".old"
        fs.mkdirSync(path.dirname(liveWeb), { recursive: true })
        fs.rmSync(oldWeb, { recursive: true, force: true })
        const hadLive = fs.existsSync(liveWeb)
        if (hadLive) {
            const oldThemes = path.join(liveWeb, "themes")
            const newThemes = path.join(webRoot, "themes")
            if (fs.existsSync(oldThemes) && !fs.existsSync(newThemes)) {
                try { fs.renameSync(oldThemes, newThemes) } catch (err) { log.warn("[FrontendLive] Could not carry the themes over:", err) }
            }
            fs.renameSync(liveWeb, oldWeb)
        }
        try {
            fs.renameSync(webRoot, liveWeb)
        } catch (err) {
            if (hadLive) {
                try { fs.renameSync(oldWeb, liveWeb) } catch { /* leave the swap visible in the error */ }
            }
            throw err
        }
        fs.rmSync(oldWeb, { recursive: true, force: true })
    }

    // Reloads now, or, while anything is playing, as soon as it stops: an update never cuts
    // into an episode. The new files are only swapped in right before the reload, so the page
    // still running never asks for a chunk that has gone.
    async function activateWhenIdle(stagedRoot, staging, manifest) {
        const tryActivate = async () => {
            let playing = false
            try { playing = !!(await isMediaPlaying?.()) } catch { /* treat as idle */ }
            if (playing) {
                if (!pendingReload) emitStep(90, "Ready; waiting for playback to stop before reloading")
                pendingReload = true
                setTimeout(tryActivate, PLAYING_RECHECK_MS)
                return
            }
            try {
                swapIn(stagedRoot)
                fs.writeFileSync(getMarkerPath(), JSON.stringify({
                    version: manifest.version,
                    commit: manifest.commit,
                    commitTime: manifest.commitTime ?? null,
                    builtAt: manifest.builtAt ?? null,
                    tag: String(manifest.commit).slice(0, 7),
                    asset: manifest.asset,
                    installedAt: new Date().toISOString(),
                }, null, 2))
                emitStep(100, "Frontend updated; reloading...")
                setTimeout(reloadWindows, 400)
            } catch (err) {
                emitFailure(err?.message ?? String(err))
            } finally {
                pendingReload = false
                fs.rmSync(staging, { recursive: true, force: true })
                busy = false
            }
        }
        await tryActivate()
    }

    async function update() {
        if (busy) return { ok: false, error: pendingReload ? "An update is ready and waits for playback to stop." : "Another update is already running." }
        if (isOtherUpdateRunning?.()) return { ok: false, error: "Another update is already running." }
        busy = true
        lastPercent = 0
        let handedOff = false
        const liveWeb = getLiveWebDir(app)
        const staging = path.join(path.dirname(liveWeb), `web-denshi.dl-${Date.now()}`)
        const zipPath = path.join(os.tmpdir(), `frontend-live-${Date.now()}.zip`)
        try {
            emitStep(5, "Looking up the latest frontend build")
            const { ref, manifest } = await fetchLatest()

            const freshStaging = () => {
                fs.rmSync(staging, { recursive: true, force: true })
                fs.mkdirSync(staging, { recursive: true })
            }
            freshStaging()

            // Only the changed files when the manifest lists them and that is the smaller
            // download; the zip otherwise, and whenever the file-by-file install fails.
            let installed = false
            if (manifest.files && typeof manifest.files === "object" && /^[0-9a-f]{40}$/.test(ref)) {
                try {
                    installed = await installDelta(ref, manifest, staging)
                } catch (err) {
                    log.warn(`[FrontendLive] File-by-file install failed, using the zip: ${err?.message ?? err}`)
                }
                if (!installed) freshStaging()
            }
            if (!installed) await installZip(ref, manifest, staging, zipPath)
            const webRoot = resolveWebRoot(staging)
            if (!webRoot) throw new Error("The bundle did not contain an index.html")

            emitStep(80, "Swapping in the new frontend")
            handedOff = true
            activateWhenIdle(webRoot, staging, manifest)
            return { ok: true, message: `Frontend updated to ${label(manifest)}.`, version: manifest.version }
        } catch (err) {
            const message = err?.message ?? String(err)
            emitFailure(message)
            return { ok: false, error: message }
        } finally {
            fs.rmSync(zipPath, { force: true })
            if (!handedOff) {
                fs.rmSync(staging, { recursive: true, force: true })
                busy = false
            }
        }
    }

    async function autoUpdate() {
        if (isDevelopment) return { ok: true, updated: false, skipped: "development build" }
        if (busy) return { ok: true, updated: false, skipped: pendingReload ? "waiting for playback to stop" : "update in progress" }
        if (isOtherUpdateRunning?.()) return { ok: true, updated: false, skipped: "another update is running" }
        const status = await check()
        if (!status.ok) return { ok: false, updated: false, error: status.error }
        if (!status.updateAvailable) return { ok: true, updated: false, skipped: "up to date" }
        const result = await update()
        return { ...result, updated: !!result.ok }
    }

    // Checks once a minute while `isEnabled()` holds; every five minutes after a rate limit.
    function startPolling(isEnabled) {
        if (isDevelopment || pollTimer) return
        const tick = async () => {
            let delay = POLL_INTERVAL_MS
            try {
                if (isEnabled()) {
                    const res = await autoUpdate()
                    if (res.updated) log.info(`[FrontendLive] Updated to ${res.version}`)
                    else if (!res.ok) {
                        log.warn(`[FrontendLive] Check failed: ${res.error}`)
                        if (/HTTP 403|HTTP 429/.test(res.error ?? "")) delay = RATE_LIMITED_INTERVAL_MS
                    }
                }
            } catch (err) {
                log.warn("[FrontendLive] Check crashed:", err)
            }
            pollTimer = setTimeout(tick, delay)
        }
        pollTimer = setTimeout(tick, 0)
    }

    function getInfo() {
        const current = currentInstall()
        return {
            busy,
            pendingReload,
            repo: GITHUB_REPO,
            branch: LIVE_BRANCH,
            version: current.version,
            commit: current.commit,
            source: current.source,
            installedAt: current.installedAt,
            marker: readMarker(),
        }
    }

    return { check, update, autoUpdate, startPolling, getInfo }
}

module.exports = { createGitHubFrontendUpdater }
