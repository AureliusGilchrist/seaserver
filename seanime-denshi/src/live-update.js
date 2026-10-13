const path = require("path")
const fs = require("fs")
const { spawn } = require("child_process")

// Updates are built from the source repo and stored outside the app bundle so they work for packaged installs
// (the bundle is read-only / locked while running). main.js prefers these over the bundled copies.
function getLiveDir(app) {
    return path.join(app.getPath("userData"), "live")
}

function getLiveWebDir(app) {
    return path.join(getLiveDir(app), "web-denshi")
}

function getLiveBinaryPath(app, binaryName) {
    return path.join(getLiveDir(app), "bin", binaryName)
}

function isRepoRoot(dir, webOnly) {
    return !!dir
        && fs.existsSync(path.join(dir, "seanime-web", "package.json"))
        && (webOnly || (fs.existsSync(path.join(dir, "go.mod")) && fs.existsSync(path.join(dir, ".git"))))
}

function resolveRepoRoot(configured, webOnly, extraStarts) {
    if (configured && isRepoRoot(configured, webOnly)) return configured
    const starts = [__dirname, ...(extraStarts || []), process.cwd(), path.dirname(process.execPath)]
    for (const start of starts) {
        let dir = start
        for (let i = 0; i < 14 && dir; i++) {
            if (isRepoRoot(dir, webOnly)) return dir
            const parent = path.dirname(dir)
            if (parent === dir) break
            dir = parent
        }
    }
    return null
}

function createLiveUpdater({ app, log, getSettings, getBinaryName, isRemoteMode, stopServer, startServer, reloadWindows, emitProgress }) {
    let busy = false

    function emitUpdateStep(target, percent, step) {
        const label = target === "backend" ? "Backend" : "Frontend"
        emitProgress({
            target,
            line: `${label} update: [${String(percent).padStart(2, "0")}%] ${step}`,
        })
    }

    function emitBackendStep(percent, step) {
        emitUpdateStep("backend", percent, step)
    }

    function emitFrontendStep(percent, step) {
        emitUpdateStep("frontend", percent, step)
    }

    function run(target, cmd, args, opts) {
        return new Promise((resolve, reject) => {
            emitProgress({ target, line: `> ${cmd} ${args.join(" ")}` })
            let child
            try {
                child = spawn(cmd, args, { ...opts, windowsHide: true, shell: opts.shell ?? false })
            } catch (err) {
                return reject(err)
            }
            const tail = []
            const onData = (data) => {
                for (const line of data.toString().split(/\r?\n/)) {
                    if (!line.trim()) continue
                    tail.push(line)
                    if (tail.length > 40) tail.shift()
                    emitProgress({ target, line })
                }
            }
            child.stdout.on("data", onData)
            child.stderr.on("data", onData)
            child.on("error", (err) => reject(new Error(`${cmd} failed to start: ${err.message}`)))
            child.on("close", (code) => {
                if (code === 0) return resolve(tail.join("\n"))
                reject(new Error(`${cmd} ${args[0] ?? ""} exited with code ${code}\n${tail.slice(-15).join("\n")}`))
            })
        })
    }

    async function guarded(target, fn) {
        if (busy) return { ok: false, error: "Another update is already running." }
        busy = true
        const stats = { files: 0, insertions: 0, deletions: 0, lines: 0 }
        try {
            const message = await fn(stats)
            return { ok: true, message, stats }
        } catch (err) {
            log.error(`[LiveUpdate] ${target} update failed:`, err)
            return { ok: false, error: err?.message ?? String(err), stats }
        } finally {
            busy = false
        }
    }

    // Git with an optional environment; resolves "" on any failure.
    function git(root, args, env) {
        return new Promise((resolve) => {
            let out = ""
            try {
                const child = spawn("git", args, { cwd: root, windowsHide: true, env: env ?? process.env })
                child.stdout.on("data", (d) => { out += d.toString() })
                child.on("error", () => resolve(""))
                child.on("close", () => resolve(out.trim()))
            } catch {
                resolve("")
            }
        })
    }

    function parseNumstat(out) {
        const files = []
        for (const line of out.split(/\r?\n/)) {
            const m = /^(\S+)\t(\S+)\t(.+)$/.exec(line)
            if (!m) continue
            // Binary files report "-" for both counts.
            files.push({ path: m[3], insertions: Number(m[1]) || 0, deletions: Number(m[2]) || 0 })
        }
        return files
    }

    function toStats(files) {
        const insertions = files.reduce((n, f) => n + f.insertions, 0)
        const deletions = files.reduce((n, f) => n + f.deletions, 0)
        return { files: files.length, insertions, deletions, lines: insertions + deletions, changes: files }
    }

    // What the frontend looked like when it was last built is remembered as a git tree of seanime-web
    // (kept alive by a ref), so "what did I change since the last build" is a plain tree diff that
    // includes uncommitted and untracked work.
    const buildStateFile = path.join(app.getPath("userData"), "frontend-build.json")
    const BUILD_REF = "refs/seanime-denshi/frontend-build"
    const snapshotIndex = path.join(app.getPath("userData"), "frontend-snapshot.index")

    async function snapshotWebTree(root) {
        fs.rmSync(snapshotIndex, { force: true })
        const env = { ...process.env, GIT_INDEX_FILE: snapshotIndex }
        await git(root, ["add", "-A", "--", "seanime-web"], env)
        const tree = await git(root, ["write-tree"], env)
        fs.rmSync(snapshotIndex, { force: true })
        return /^[0-9a-f]{40,64}$/.test(tree) ? tree : ""
    }

    function readBuiltTree() {
        try { return JSON.parse(fs.readFileSync(buildStateFile, "utf8")).tree || "" } catch { return "" }
    }

    async function rememberBuiltTree(root, tree) {
        try { fs.writeFileSync(buildStateFile, JSON.stringify({ tree, at: new Date().toISOString() })) } catch {}
        const env = {
            ...process.env,
            GIT_AUTHOR_NAME: "denshi", GIT_AUTHOR_EMAIL: "denshi@localhost",
            GIT_COMMITTER_NAME: "denshi", GIT_COMMITTER_EMAIL: "denshi@localhost",
        }
        const commit = await git(root, ["commit-tree", tree, "-m", "frontend build snapshot"], env)
        if (commit) await git(root, ["update-ref", BUILD_REF, commit])
    }

    // The delta between the last built frontend and the files as they are now.
    async function frontendDelta(root) {
        const tree = await snapshotWebTree(root)
        if (!tree) return { tree: "", baseline: false, files: [], error: "Could not read the frontend files with git, so changes cannot be listed." }
        const last = readBuiltTree()
        if (!last || (await git(root, ["cat-file", "-t", last])) !== "tree") return { tree, baseline: false, files: [] }
        const files = parseNumstat(await git(root, ["diff", "--numstat", last, tree]))
        return { tree, baseline: true, files }
    }

    // Pulls and records how many lines the pull changed.
    async function pullWithStats(target, root, stats) {
        const before = await git(root, ["rev-parse", "HEAD"])
        const out = await run(target, "git", ["pull", "--ff-only"], { cwd: root })
        const after = await git(root, ["rev-parse", "HEAD"])
        if (before && after && before !== after) {
            const short = await git(root, ["diff", "--shortstat", before, after])
            stats.files = Number(/(\d+) files? changed/.exec(short)?.[1] ?? 0)
            stats.insertions = Number(/(\d+) insertions?\(\+\)/.exec(short)?.[1] ?? 0)
            stats.deletions = Number(/(\d+) deletions?\(-\)/.exec(short)?.[1] ?? 0)
            stats.lines = stats.insertions + stats.deletions
        }
        return out
    }

    const rememberFile = path.join(app.getPath("userData"), "source-root.txt")
    function extraStarts() {
        const starts = []
        try { starts.push(fs.readFileSync(rememberFile, "utf8").trim()) } catch {}
        try { starts.push(app.getAppPath()) } catch {}
        return starts.filter(Boolean)
    }

    const SKIP_DIRS = new Set(["node_modules", ".git", "windows", "program files", "program files (x86)", "programdata", "appdata", "$recycle.bin", "system volume information", "out", "out-denshi", "dist"])
    function scanForRoot(dir, depth, webOnly) {
        if (isRepoRoot(dir, webOnly)) return dir
        if (depth <= 0) return null
        let entries
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return null }
        for (const e of entries) {
            if (!e.isDirectory() || e.name.startsWith(".") || SKIP_DIRS.has(e.name.toLowerCase())) continue
            const found = scanForRoot(path.join(dir, e.name), depth - 1, webOnly)
            if (found) return found
        }
        return null
    }
    // Last resort when the app was not started from inside the checkout: look in the usual places once.
    function searchCommonLocations(webOnly) {
        const bases = []
        for (const n of ["home", "documents", "desktop", "downloads"]) {
            try { bases.push(app.getPath(n)) } catch {}
        }
        if (process.platform === "win32") {
            for (const l of "CDEFGH") bases.push(`${l}:\\`)
        }
        for (const base of bases) {
            const found = scanForRoot(base, 4, webOnly)
            if (found) return found
        }
        return null
    }

    function findRoot(webOnly, scan) {
        let root = resolveRepoRoot(getSettings().sourceRepoPath, webOnly, extraStarts())
        if (!root && scan) root = searchCommonLocations(webOnly)
        if (root) { try { fs.writeFileSync(rememberFile, root) } catch {} }
        return root
    }

    function requireRepo() {
        const root = findRoot(false, true)
        if (!root) {
            throw new Error("Source repository not found. Set the repository path (a git checkout containing go.mod and seanime-web).")
        }
        return root
    }

    function requireWebRoot() {
        const root = findRoot(true, true)
        if (!root) throw new Error("Local frontend source (seanime-web) not found in any usual location. Set the repository path in settings once and it will be remembered.")
        return root
    }

    function updateBackend() {
        return guarded("backend", async (stats) => {
            if (isRemoteMode()) throw new Error("The backend runs on a remote server; update it there.")
            const root = requireRepo()

            emitBackendStep(5, "Fetching the latest commits from origin")
            const pullOut = await pullWithStats("backend", root, stats)
            emitBackendStep(22, "Latest commits collected; preparing the build")

            const binaryName = getBinaryName()
            const livePath = getLiveBinaryPath(app, binaryName)
            const newPath = livePath + ".new"
            const bakPath = livePath + ".bak"
            fs.mkdirSync(path.dirname(livePath), { recursive: true })
            fs.rmSync(newPath, { force: true })

            // Build while the current server keeps running; nothing is touched unless this succeeds.
            emitBackendStep(40, "Building the updated backend")
            await run("backend", "go", ["build", "-trimpath", "-ldflags=-s -w", "-o", newPath, "."], {
                cwd: root,
                env: { ...process.env },
            })
            if (!fs.existsSync(newPath)) throw new Error("Build produced no binary")
            emitBackendStep(70, "Build complete; validating the binary")

            emitBackendStep(80, "Stopping the current backend")
            await stopServer()

            fs.rmSync(bakPath, { force: true })
            const hadLive = fs.existsSync(livePath)
            if (hadLive) fs.renameSync(livePath, bakPath)
            fs.renameSync(newPath, livePath)

            try {
                emitBackendStep(90, "Starting the updated backend")
                await startServer()
            } catch (err) {
                emitBackendStep(92, "Startup failed; restoring the previous backend")
                emitProgress({ target: "backend", line: `New backend failed to start (${err.message}); rolling back...` })
                await stopServer()
                fs.rmSync(livePath, { force: true })
                if (hadLive) fs.renameSync(bakPath, livePath)
                await startServer()
                throw new Error(`New backend failed to start; previous backend restored. ${err.message}`)
            }

            emitBackendStep(97, "Updated backend started; cleaning up the backup")
            fs.rmSync(bakPath, { force: true })
            const upToDate = /already up to date/i.test(pullOut)
            return upToDate ? "Backend rebuilt and restarted (no new commits)." : "Backend updated and restarted."
        })
    }

    function updateFrontend() {
        return guarded("frontend", async (stats) => {
            emitFrontendStep(0, "Preparing frontend update")
            const root = requireWebRoot()
            const webRoot = path.join(root, "seanime-web")
            if (!fs.existsSync(path.join(webRoot, "node_modules"))) {
                throw new Error("seanime-web/node_modules is missing. Install the frontend dependencies first.")
            }

            // Built from the local files as they are; nothing is pulled. The delta is what changed
            // since the last build, read before building.
            emitFrontendStep(8, "Checking changes since the last build")
            const delta = await frontendDelta(root)
            Object.assign(stats, toStats(delta.files))
            stats.baseline = delta.baseline
            emitProgress({
                target: "frontend",
                line: delta.baseline
                    ? `${delta.files.length} file(s) changed since the last build (+${stats.insertions} -${stats.deletions})`
                    : "No previous build recorded; this build becomes the baseline.",
            })
            for (const f of delta.files) emitProgress({ target: "frontend", line: `    ${f.path}  +${f.insertions} -${f.deletions}` })

            emitFrontendStep(18, "Building Denshi frontend")
            await run("frontend", "npm", ["run", "build:denshi"], { cwd: webRoot, shell: process.platform === "win32" })

            emitFrontendStep(72, "Validating frontend build output")
            const outDir = path.join(webRoot, "out-denshi")
            if (!fs.existsSync(path.join(outDir, "index.html"))) throw new Error("Frontend build output missing (out-denshi/index.html)")

            emitFrontendStep(82, "Staging the new frontend")
            const liveWeb = getLiveWebDir(app)
            const newWeb = liveWeb + ".new"
            const oldWeb = liveWeb + ".old"
            fs.mkdirSync(path.dirname(liveWeb), { recursive: true })
            fs.rmSync(newWeb, { recursive: true, force: true })
            fs.rmSync(oldWeb, { recursive: true, force: true })
            fs.cpSync(outDir, newWeb, { recursive: true })

            emitFrontendStep(92, "Activating the new frontend")
            if (fs.existsSync(liveWeb)) fs.renameSync(liveWeb, oldWeb)
            fs.renameSync(newWeb, liveWeb)
            fs.rmSync(oldWeb, { recursive: true, force: true })
            emitFrontendStep(97, "Recording the successful build")
            if (delta.tree) await rememberBuiltTree(root, delta.tree)

            emitFrontendStep(100, "Frontend updated; reloading...")
            setTimeout(reloadWindows, 400)
            return "Frontend updated; reloading."
        })
    }

    async function checkFrontend() {
        try {
            const root = requireWebRoot()
            const delta = await frontendDelta(root)
            if (delta.error) return { ok: false, error: delta.error }
            return { ok: true, baseline: delta.baseline, files: delta.files, stats: toStats(delta.files) }
        } catch (err) {
            return { ok: false, error: err?.message ?? String(err) }
        }
    }

    // Local backend: what pulling the fork's latest commits would change.
    async function checkBackend() {
        try {
            if (isRemoteMode()) throw new Error("The backend runs on a remote server; check it there.")
            const root = requireRepo()
            await run("backend", "git", ["fetch", "origin"], { cwd: root })
            const branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])) || "main"
            const ref = `origin/${branch === "HEAD" ? "main" : branch}`
            const behind = Number(await git(root, ["rev-list", "--count", `HEAD..${ref}`])) || 0
            const files = behind > 0 ? parseNumstat(await git(root, ["diff", "--numstat", "HEAD", ref])) : []
            return { ok: true, behind, files, stats: toStats(files) }
        } catch (err) {
            return { ok: false, error: err?.message ?? String(err) }
        }
    }

    function readOrigin(root) {
        try {
            const cfg = fs.readFileSync(path.join(root, ".git", "config"), "utf8")
            return /\[remote "origin"\][^\[]*?url\s*=\s*(\S+)/.exec(cfg)?.[1] ?? null
        } catch {
            return null
        }
    }

    function getInfo() {
        const root = findRoot(false)
        return {
            repoRoot: root,
            repoOrigin: root ? readOrigin(root) : null,
            remote: !!isRemoteMode(),
            busy,
            hasLiveBackend: fs.existsSync(getLiveBinaryPath(app, getBinaryName())),
            hasLiveFrontend: fs.existsSync(path.join(getLiveWebDir(app), "index.html")),
        }
    }

    return { updateBackend, updateFrontend, checkBackend, checkFrontend, getInfo }
}

module.exports = { createLiveUpdater, getLiveWebDir, getLiveBinaryPath }
