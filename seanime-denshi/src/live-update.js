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

function isRepoRoot(dir) {
    return !!dir
        && fs.existsSync(path.join(dir, "go.mod"))
        && fs.existsSync(path.join(dir, "seanime-web", "package.json"))
        && fs.existsSync(path.join(dir, ".git"))
}

function resolveRepoRoot(configured) {
    if (configured && isRepoRoot(configured)) return configured
    let dir = __dirname
    for (let i = 0; i < 6; i++) {
        if (isRepoRoot(dir)) return dir
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    return null
}

function createLiveUpdater({ app, log, getSettings, getBinaryName, isRemoteMode, stopServer, startServer, reloadWindows, emitProgress }) {
    let busy = false

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
        try {
            const message = await fn()
            return { ok: true, message }
        } catch (err) {
            log.error(`[LiveUpdate] ${target} update failed:`, err)
            return { ok: false, error: err?.message ?? String(err) }
        } finally {
            busy = false
        }
    }

    function requireRepo() {
        const root = resolveRepoRoot(getSettings().sourceRepoPath)
        if (!root) {
            throw new Error("Source repository not found. Set the repository path (a git checkout containing go.mod and seanime-web).")
        }
        return root
    }

    function updateBackend() {
        return guarded("backend", async () => {
            if (isRemoteMode()) throw new Error("The backend runs on a remote server; update it there.")
            const root = requireRepo()

            const pullOut = await run("backend", "git", ["pull", "--ff-only"], { cwd: root })

            const binaryName = getBinaryName()
            const livePath = getLiveBinaryPath(app, binaryName)
            const newPath = livePath + ".new"
            const bakPath = livePath + ".bak"
            fs.mkdirSync(path.dirname(livePath), { recursive: true })
            fs.rmSync(newPath, { force: true })

            // Build while the current server keeps running; nothing is touched unless this succeeds.
            await run("backend", "go", ["build", "-trimpath", "-ldflags=-s -w", "-o", newPath, "."], {
                cwd: root,
                env: { ...process.env },
            })
            if (!fs.existsSync(newPath)) throw new Error("Build produced no binary")
            emitProgress({ target: "backend", line: "Build succeeded, swapping backend..." })

            await stopServer()

            fs.rmSync(bakPath, { force: true })
            const hadLive = fs.existsSync(livePath)
            if (hadLive) fs.renameSync(livePath, bakPath)
            fs.renameSync(newPath, livePath)

            try {
                await startServer()
            } catch (err) {
                emitProgress({ target: "backend", line: `New backend failed to start (${err.message}); rolling back...` })
                await stopServer()
                fs.rmSync(livePath, { force: true })
                if (hadLive) fs.renameSync(bakPath, livePath)
                await startServer()
                throw new Error(`New backend failed to start; previous backend restored. ${err.message}`)
            }

            fs.rmSync(bakPath, { force: true })
            const upToDate = /already up to date/i.test(pullOut)
            return upToDate ? "Backend rebuilt and restarted (no new commits)." : "Backend updated and restarted."
        })
    }

    function updateFrontend() {
        return guarded("frontend", async () => {
            const root = requireRepo()
            const webRoot = path.join(root, "seanime-web")
            if (!fs.existsSync(path.join(webRoot, "node_modules"))) {
                throw new Error("seanime-web/node_modules is missing. Install the frontend dependencies first.")
            }

            await run("frontend", "npm", ["run", "build:denshi"], { cwd: webRoot, shell: process.platform === "win32" })

            const outDir = path.join(webRoot, "out-denshi")
            if (!fs.existsSync(path.join(outDir, "index.html"))) throw new Error("Frontend build output missing (out-denshi/index.html)")

            const liveWeb = getLiveWebDir(app)
            const newWeb = liveWeb + ".new"
            const oldWeb = liveWeb + ".old"
            fs.mkdirSync(path.dirname(liveWeb), { recursive: true })
            fs.rmSync(newWeb, { recursive: true, force: true })
            fs.rmSync(oldWeb, { recursive: true, force: true })
            fs.cpSync(outDir, newWeb, { recursive: true })

            if (fs.existsSync(liveWeb)) fs.renameSync(liveWeb, oldWeb)
            fs.renameSync(newWeb, liveWeb)
            fs.rmSync(oldWeb, { recursive: true, force: true })

            emitProgress({ target: "frontend", line: "Frontend swapped, reloading..." })
            setTimeout(reloadWindows, 400)
            return "Frontend updated; reloading."
        })
    }

    function getInfo() {
        const root = resolveRepoRoot(getSettings().sourceRepoPath)
        return {
            repoRoot: root,
            busy,
            hasLiveBackend: fs.existsSync(getLiveBinaryPath(app, getBinaryName())),
            hasLiveFrontend: fs.existsSync(path.join(getLiveWebDir(app), "index.html")),
        }
    }

    return { updateBackend, updateFrontend, getInfo }
}

module.exports = { createLiveUpdater, getLiveWebDir, getLiveBinaryPath }
