const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const { spawn } = require("child_process")

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Frontend build engine for Denshi Mobile
//
// The mobile shell never hosts a server, so its boot work is the frontend instead: on every
// launch it rebuilds the mobile build of seanime-web from the local source checkout — the same
// "live" model Denshi uses for its "Update frontend" button, but run automatically at startup so
// the app is always running the code on disk.
//
// Rebuilds are skipped when nothing changed: the source tree is hashed (relative paths, sizes
// and mtimes) and remembered alongside the staged build, so a launch where nothing was touched
// costs one hash walk instead of a full rsbuild.
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function getLiveDir(app) {
    return path.join(app.getPath("userData"), "live")
}

function getLiveWebDir(app) {
    return path.join(getLiveDir(app), "web-mobile")
}

const rememberFile = "mobile-source-root.txt"
const buildStateFile = "mobile-build-state.json"

function readRememberedRoot(app) {
    try {
        return fs.readFileSync(path.join(app.getPath("userData"), rememberFile), "utf8").trim()
    } catch {
        return ""
    }
}

function rememberRoot(app, root) {
    try {
        fs.writeFileSync(path.join(app.getPath("userData"), rememberFile), root, "utf8")
    } catch { /* best effort */ }
}

function isRepoRoot(dir) {
    return !!dir && fs.existsSync(path.join(dir, "seanime-web", "package.json"))
}

// Walk up from each start directory (and honor a user-configured path first) looking for the
// checkout that holds the frontend source.
function resolveRepoRoot(configured, starts) {
    const candidates = []
    if (configured) candidates.push(path.resolve(configured))
    for (const start of starts) {
        if (!start) continue
        let dir = path.resolve(start)
        for (let i = 0; i < 14 && dir; i++) {
            candidates.push(dir)
            const parent = path.dirname(dir)
            if (parent === dir) break
            dir = parent
        }
    }
    for (const candidate of candidates) {
        if (isRepoRoot(candidate)) return candidate
    }
    return null
}

// The build inputs: everything under src/, plus the config files rsbuild and the env file read.
// Skips dot-directories and node_modules; a missing optional file simply contributes nothing.
function hashSourceTree(webRoot) {
    const hash = crypto.createHash("sha1")
    const lines = []

    const walk = (dir, rel) => {
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            if (entry.name.startsWith(".")) continue
            const abs = path.join(dir, entry.name)
            const relPath = rel ? `${rel}/${entry.name}` : entry.name
            if (entry.isDirectory()) {
                walk(abs, relPath)
            } else if (entry.isFile()) {
                let st
                try {
                    st = fs.statSync(abs)
                } catch {
                    continue
                }
                lines.push(`${relPath}|${st.size}|${Math.floor(st.mtimeMs)}`)
            }
        }
    }

    walk(path.join(webRoot, "src"), "src")

    for (const name of [
        "rsbuild.config.ts",
        ".env.mobile",
        "package.json",
        "index.html",
        "tailwind.config.ts",
        "postcss.config.js",
        "tsconfig.json",
    ]) {
        try {
            const st = fs.statSync(path.join(webRoot, name))
            if (st.isFile()) lines.push(`${name}|${st.size}|${Math.floor(st.mtimeMs)}`)
        } catch { /* optional */ }
    }

    lines.sort()
    for (const line of lines) hash.update(line + "\n")
    return hash.digest("hex")
}

function readBuildState(app) {
    try {
        return JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), buildStateFile), "utf8"))
    } catch {
        return {}
    }
}

function writeBuildState(app, hash) {
    try {
        fs.writeFileSync(
            path.join(app.getPath("userData"), buildStateFile),
            JSON.stringify({ hash, at: new Date().toISOString() }, null, 2),
            "utf8",
        )
    } catch { /* best effort */ }
}

// One external command, streamed line by line to onProgress.
function run(cmd, args, opts, onLine) {
    return new Promise((resolve, reject) => {
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
                if (onLine) onLine(line)
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

/**
 * Build (or skip) the mobile frontend. Resolves with { skipped: true } when the source tree is
 * unchanged since the last successful build; rejects with an Error describing the failure.
 *
 * onProgress receives { percent, label, line? } updates for the splash screen.
 */
async function buildFrontend({ app, log, configuredRepoPath, onProgress, force }) {
    const step = (percent, label, line) => {
        if (onProgress) onProgress({ percent, label, line })
    }

    step(2, "Locating the frontend source")
    const starts = [__dirname, app.getAppPath(), process.cwd(), readRememberedRoot(app)]
    const root = resolveRepoRoot(configuredRepoPath, starts)
    if (!root) {
        throw new Error(
            "Frontend source not found. Start the app from inside the repository checkout, or set the repository path in the config.",
        )
    }
    rememberRoot(app, root)

    const webRoot = path.join(root, "seanime-web")
    if (!fs.existsSync(path.join(webRoot, "node_modules"))) {
        throw new Error("seanime-web/node_modules is missing. Install the frontend dependencies first (npm install in seanime-web).")
    }

    step(6, "Checking for changes since the last build")
    const hash = hashSourceTree(webRoot)
    const state = readBuildState(app)
    const hasLiveBuild = fs.existsSync(path.join(getLiveWebDir(app), "index.html"))
    if (!force && state.hash === hash && hasLiveBuild) {
        log.info("[MobileBuild] Source unchanged since the last build; skipping rebuild")
        step(100, "Frontend is up to date")
        return { skipped: true }
    }

    step(10, "Building the mobile frontend", "> npm run build:mobile")
    let outputLines = 0
    await run("npm", ["run", "build:mobile"], {
        cwd: webRoot,
        shell: process.platform === "win32",
        env: { ...process.env },
    }, (line) => {
        outputLines++
        // A gentle creep toward done — rsbuild's output is progress-shaped but not progress-numbered.
        step(Math.min(78, 12 + outputLines * 0.4), "Building the mobile frontend", line)
    })

    step(88, "Validating the build output")
    const outDir = path.join(webRoot, "out-mobile")
    if (!fs.existsSync(path.join(outDir, "index.html"))) {
        throw new Error("Frontend build output missing (out-mobile/index.html)")
    }

    step(93, "Staging the new frontend")
    const liveWeb = getLiveWebDir(app)
    const newWeb = liveWeb + ".new"
    const oldWeb = liveWeb + ".old"
    fs.mkdirSync(path.dirname(liveWeb), { recursive: true })
    fs.rmSync(newWeb, { recursive: true, force: true })
    fs.rmSync(oldWeb, { recursive: true, force: true })
    fs.cpSync(outDir, newWeb, { recursive: true })

    step(96, "Activating the new frontend")
    if (fs.existsSync(liveWeb)) fs.renameSync(liveWeb, oldWeb)
    fs.renameSync(newWeb, liveWeb)
    fs.rmSync(oldWeb, { recursive: true, force: true })

    writeBuildState(app, hash)
    step(100, "Frontend ready")
    return { skipped: false }
}

module.exports = { buildFrontend, getLiveWebDir, resolveRepoRoot, hashSourceTree }
