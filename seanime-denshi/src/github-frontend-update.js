const path = require("path")
const fs = require("fs")
const os = require("os")
const { spawn } = require("child_process")
const { net } = require("electron")
const { getLiveWebDir } = require("./live-update")

// The frontend is published as a "denshi-frontend-<version>.zip" asset on every automated
// release of the seaserver repo (see .github/workflows/auto-release.yml). Public GitHub
// assets can be fetched without any account or token, so a machine with neither git nor
// Node installed can still pull the latest frontend from here.
const GITHUB_REPO = "AureliusGilchrist/seaserver"
const LATEST_ASSET_RE = /^denshi-frontend-.*\.zip$/i
const API_TIMEOUT_MS = 30_000
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000

function createGitHubFrontendUpdater({ app, log, isDevelopment, emitProgress, reloadWindows, isOtherUpdateRunning }) {
    let busy = false
    let lastPercent = 0

    function emitStep(percent, step) {
        lastPercent = percent
        log.info(`[GitHubFrontendUpdate] [${percent}%] ${step}`)
        emitProgress({ target: "frontend", line: `Frontend update: [${String(percent).padStart(2, "0")}%] ${step}` })
    }

    function emitFailure(message) {
        log.error(`[GitHubFrontendUpdate] Failed: ${message}`)
        emitProgress({
            target: "frontend",
            line: `Frontend update: [${String(lastPercent).padStart(2, "0")}%] Failed - ${message}`,
        })
    }

    // The live dir remembers what the current frontend is and where it came from. Written
    // only by this updater; a live frontend built from source has no marker and is never
    // touched automatically.
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

    // What is currently being served: a GitHub-installed live frontend (version known), a
    // locally built live frontend (version unknowable — it may be ahead of any release), or
    // the frontend bundled with the app (version is the app version, which release builds
    // keep in sync with the release tag).
    function currentInstall() {
        const marker = readMarker()
        if (marker) return { version: String(marker.version), source: "github", installedAt: marker.installedAt }
        if (fs.existsSync(path.join(getLiveWebDir(app), "index.html"))) return { version: null, source: "local", installedAt: null }
        return { version: app.getVersion(), source: "bundled", installedAt: null }
    }

    function withTimeout(ms, promise, what) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms)),
        ])
    }

    // Newest release that carries a frontend bundle. The releases endpoint lists prereleases
    // too (the workflow publishes them as prereleases), newest first.
    async function fetchLatestRelease() {
        const res = await withTimeout(API_TIMEOUT_MS, net.fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
            headers: { "User-Agent": "seanime-denshi", "Accept": "application/vnd.github+json" },
        }), "Looking up the latest release")
        if (!res.ok) throw new Error(`GitHub API returned HTTP ${res.status}`)
        const releases = await res.json()
        for (const release of Array.isArray(releases) ? releases : []) {
            const asset = (release.assets ?? []).find(a => LATEST_ASSET_RE.test(a.name))
            if (asset) {
                return {
                    tag: release.tag_name,
                    version: String(release.tag_name).replace(/^v/, ""),
                    assetName: asset.name,
                    assetSize: asset.size,
                    releaseUrl: release.html_url,
                    publishedAt: release.published_at,
                }
            }
        }
        return null
    }

    // Compares dotted versions like "5.0.6-1" and "5.0.6-1.auto.42.1" segment by segment;
    // numeric segments compare as numbers, and a shorter version loses as a prefix.
    function compareVersions(a, b) {
        const pa = String(a).toLowerCase().split(/[.\-_+]/)
        const pb = String(b).toLowerCase().split(/[.\-_+]/)
        const n = Math.max(pa.length, pb.length)
        for (let i = 0; i < n; i++) {
            const x = pa[i], y = pb[i]
            if (x === undefined) return -1
            if (y === undefined) return 1
            const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y)
            if (nx && ny) {
                const d = Number(x) - Number(y)
                if (d !== 0) return d < 0 ? -1 : 1
            } else if (nx !== ny) {
                return nx ? -1 : 1
            } else if (x !== y) {
                return x < y ? -1 : 1
            }
        }
        return 0
    }

    async function check() {
        try {
            const latest = await fetchLatestRelease()
            const current = currentInstall()
            const updateAvailable = !!latest && !!current.version && compareVersions(latest.version, current.version) > 0
            return {
                ok: true,
                current: current.version,
                currentSource: current.source,
                installedAt: current.installedAt,
                latest: latest?.version ?? null,
                tag: latest?.tag ?? null,
                assetName: latest?.assetName ?? null,
                releaseUrl: latest?.releaseUrl ?? null,
                // Only a GitHub-installed frontend is ever replaced automatically; the
                // install button is what carries a bundled or locally built one over.
                updateAvailable,
                canInstall: !!latest && (updateAvailable || current.source === "local"),
            }
        } catch (err) {
            const message = err?.message ?? String(err)
            emitFailure(message)
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
        if (await runCmd("unzip", ["-o", zipPath, "-d", dest])) return
        if (await runCmd("tar", ["-xf", zipPath, "-C", dest])) return
        throw new Error("Could not unpack the bundle (unzip and tar both failed)")
    }

    // Compress-Archive keeps a root layout, but if the zip ever nests everything under one
    // folder, treat that folder as the web root.
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

    async function update() {
        if (busy) return { ok: false, error: "Another update is already running." }
        if (isOtherUpdateRunning?.()) return { ok: false, error: "Another update is already running." }
        busy = true
        lastPercent = 0
        try {
            emitStep(5, "Looking up the latest release on GitHub")
            const latest = await fetchLatestRelease()
            if (!latest) throw new Error("No release on GitHub carries a frontend bundle (denshi-frontend-*.zip)")

            const liveWeb = getLiveWebDir(app)
            const staging = path.join(path.dirname(liveWeb), `web-denshi.dl-${Date.now()}`)
            fs.rmSync(staging, { recursive: true, force: true })
            fs.mkdirSync(staging, { recursive: true })

            const zipPath = path.join(os.tmpdir(), `denshi-frontend-${Date.now()}.zip`)
            try {
                emitStep(15, `Downloading ${latest.assetName}`)
                const res = await withTimeout(DOWNLOAD_TIMEOUT_MS, net.fetch(
                    `https://github.com/${GITHUB_REPO}/releases/download/${encodeURIComponent(latest.tag)}/${encodeURIComponent(latest.assetName)}`,
                    { headers: { "User-Agent": "seanime-denshi" } },
                ), "Downloading the frontend bundle")
                if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`)
                const buf = Buffer.from(await res.arrayBuffer())
                if (buf.length < 1024) throw new Error("The downloaded file is too small to be a frontend bundle")
                fs.writeFileSync(zipPath, buf)

                emitStep(55, "Unpacking the frontend bundle")
                await extractZip(zipPath, staging)
                const webRoot = resolveWebRoot(staging)
                if (!webRoot) throw new Error("The bundle did not contain an index.html")

                emitStep(80, "Swapping in the new frontend")
                const oldWeb = liveWeb + ".old"
                fs.rmSync(oldWeb, { recursive: true, force: true })
                const hadLive = fs.existsSync(liveWeb)
                if (hadLive) fs.renameSync(liveWeb, oldWeb)
                try {
                    fs.renameSync(webRoot, liveWeb)
                } catch (err) {
                    if (hadLive) {
                        try { fs.renameSync(oldWeb, liveWeb) } catch { /* leave the swap visible in the error */ }
                    }
                    throw err
                }
                fs.rmSync(oldWeb, { recursive: true, force: true })

                fs.writeFileSync(getMarkerPath(), JSON.stringify({
                    version: latest.version,
                    tag: latest.tag,
                    asset: latest.assetName,
                    installedAt: new Date().toISOString(),
                }, null, 2))
            } finally {
                fs.rmSync(staging, { recursive: true, force: true })
                fs.rmSync(zipPath, { force: true })
            }

            emitStep(100, "Frontend updated; reloading...")
            setTimeout(reloadWindows, 400)
            return { ok: true, message: `Frontend updated to ${latest.version}.`, version: latest.version }
        } catch (err) {
            const message = err?.message ?? String(err)
            emitFailure(message)
            return { ok: false, error: message }
        } finally {
            busy = false
        }
    }

    // Startup hook. Only a frontend this updater installed before is ever replaced on its
    // own, so a locally built or freshly bundled frontend is never silently overwritten;
    // one manual install switches a machine over to the automatic flow from then on.
    async function autoUpdate() {
        if (isDevelopment) return { ok: true, updated: false, skipped: "development build" }
        const current = currentInstall()
        if (current.source !== "github") return { ok: true, updated: false, skipped: `current frontend is ${current.source}, not GitHub-installed` }
        if (isOtherUpdateRunning?.()) return { ok: true, updated: false, skipped: "another update is running" }
        const status = await check()
        if (!status.ok) return { ok: false, updated: false, error: status.error }
        if (!status.updateAvailable) return { ok: true, updated: false, skipped: "up to date" }
        const result = await update()
        return { ...result, updated: !!result.ok }
    }

    function getInfo() {
        const current = currentInstall()
        return {
            busy,
            repo: GITHUB_REPO,
            version: current.version,
            source: current.source,
            installedAt: current.installedAt,
            marker: readMarker(),
        }
    }

    return { check, update, autoUpdate, getInfo }
}

module.exports = { createGitHubFrontendUpdater }
