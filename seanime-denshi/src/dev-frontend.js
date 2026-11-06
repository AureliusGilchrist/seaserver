const path = require("path")
const fs = require("fs")
const { spawn, spawnSync } = require("child_process")

// "Developer Frontend": runs the Denshi frontend build in watch mode against the local seanime-web
// sources (incremental rebuilds in seconds, no type-check, no release download) and serves that
// output in place of the installed frontend. Every finished rebuild reloads the app windows.
const OUT_DIR = "out-denshi"
const BUILT_RE = /built in|compiled .*successfully|ready\s+built/i
const MAX_LOG = 200

function createDevFrontend({ log, getWebRoot, reloadWindows, emit }) {
    let child = null
    let root = null
    let state = "stopped" // stopped | starting | building | ready | error
    let lastError = null
    let lastBuildAt = null
    let builds = 0
    let reloadTimer = null
    const tail = []

    function pushLine(line) {
        tail.push(line)
        if (tail.length > MAX_LOG) tail.shift()
        emit({ line })
    }

    function getStatus() {
        return { state, running: !!child, root, lastError, lastBuildAt, builds, tail: tail.slice(-60) }
    }

    function setState(next, error) {
        state = next
        lastError = error ?? null
        emit({ status: getStatus() })
    }

    // Directory the app:// protocol should serve while the watcher is active and has produced a build.
    function getActiveDir() {
        if (!child || !root || builds === 0) return null
        const dir = path.join(root, "seanime-web", OUT_DIR)
        return fs.existsSync(path.join(dir, "index.html")) ? dir : null
    }

    function scheduleReload() {
        clearTimeout(reloadTimer)
        // A rebuild writes many files; wait for the burst to finish before swapping.
        reloadTimer = setTimeout(() => {
            builds++
            lastBuildAt = new Date().toISOString()
            setState("ready")
            reloadWindows()
        }, 350)
    }

    function start() {
        if (child) return { ok: true, status: getStatus() }
        try {
            root = getWebRoot()
        } catch (err) {
            return { ok: false, error: err?.message ?? String(err) }
        }
        const webRoot = path.join(root, "seanime-web")
        if (!fs.existsSync(path.join(webRoot, "node_modules"))) {
            return { ok: false, error: "seanime-web/node_modules is missing. Install the frontend dependencies first." }
        }

        tail.length = 0
        builds = 0
        setState("starting")
        pushLine("Developer Frontend: starting the watch build (first build takes a while, later ones are incremental)")
        try {
            child = spawn("npm", ["run", "watch:denshi"], {
                cwd: webRoot,
                windowsHide: true,
                shell: process.platform === "win32",
            })
        } catch (err) {
            child = null
            setState("error", err?.message ?? String(err))
            return { ok: false, error: lastError }
        }

        const onData = (data) => {
            for (const raw of data.toString().split(/\r?\n/)) {
                const line = raw.replace(/\u001b\[[0-9;]*m/g, "").trim()
                if (!line) continue
                pushLine(line)
                if (/error/i.test(line) && !BUILT_RE.test(line)) {
                    lastError = line
                } else if (BUILT_RE.test(line)) {
                    scheduleReload()
                } else if (/start\s+build|building|compiling/i.test(line) && state === "ready") {
                    setState("building")
                }
            }
        }
        child.stdout.on("data", onData)
        child.stderr.on("data", onData)
        child.on("error", (err) => {
            child = null
            setState("error", `Failed to start: ${err.message}`)
        })
        child.on("close", (code) => {
            const wasRunning = !!child
            child = null
            clearTimeout(reloadTimer)
            if (!wasRunning) return
            pushLine(`Developer Frontend: watcher exited (code ${code})`)
            setState(code === 0 || state === "stopped" ? "stopped" : "error", code === 0 ? null : lastError ?? `Watcher exited with code ${code}`)
            // Back to the installed frontend.
            reloadWindows()
        })
        return { ok: true, status: getStatus() }
    }

    function stop() {
        const proc = child
        if (!proc) return { ok: true, status: getStatus() }
        child = null
        clearTimeout(reloadTimer)
        try {
            if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true })
            else proc.kill("SIGTERM")
        } catch (err) {
            log.warn("[DevFrontend] failed to stop the watcher:", err)
        }
        pushLine("Developer Frontend: stopped, using the installed frontend again")
        setState("stopped")
        reloadWindows()
        return { ok: true, status: getStatus() }
    }

    return { start, stop, getStatus, getActiveDir }
}

module.exports = { createDevFrontend }
