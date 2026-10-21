// Assembles the Android app's web assets (www/) from a built mobile frontend.
//
//   node scripts/build-www.mjs [--source <path-to-out-mobile>]
//
// Copies seanime-web/out-mobile into www/, adds the shell layer (update-manager.js), and injects
// it into index.html as a synchronous script in <head> — synchronous head scripts always execute
// before deferred ones, so the shell can seed localStorage (server URL, connection mode) before
// the app's first status fetch. Run automatically by `npm run sync` before `cap sync`.

import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, "..")
const defaultSource = resolve(rootDir, "..", "seanime-web", "out-mobile")
const wwwDir = join(rootDir, "www")

const args = process.argv.slice(2)
const sourceIdx = args.indexOf("--source")
const sourceDir = sourceIdx !== -1 && args[sourceIdx + 1] ? resolve(args[sourceIdx + 1]) : defaultSource

if (!existsSync(join(sourceDir, "index.html"))) {
    console.error(`\n  No frontend build found at ${sourceDir}`)
    console.error(`  Build it first:  cd ../seanime-web && npm run build:mobile\n`)
    process.exit(1)
}

function copyDir(src, dest) {
    mkdirSync(dest, { recursive: true })
    for (const entry of readdirSync(src)) {
        // The desktop theme wallpapers are 350+ MB — a phone bundle ships the theme colors and
        // cursors without the backgrounds.
        if (entry === "themes") continue
        const s = join(src, entry)
        const d = join(dest, entry)
        if (statSync(s).isDirectory()) copyDir(s, d)
        else copyFileSync(s, d)
    }
}

// Fresh www each run — no stale assets from an older bundle.
rmSync(wwwDir, { recursive: true, force: true })
copyDir(sourceDir, wwwDir)

// The shell layer rides in every bundle: this copy goes into the APK, and the publish script
// puts the same file into every update bundle it makes, so the shell updates along with the app.
const shellDir = join(wwwDir, "shell")
mkdirSync(shellDir, { recursive: true })
copyFileSync(join(rootDir, "src", "update-manager.js"), join(shellDir, "update-manager.js"))

const shellTag = `<script src="/shell/update-manager.js"></script>`
const indexPath = join(wwwDir, "index.html")
let indexHtml = readFileSync(indexPath, "utf8")

if (!indexHtml.includes("shell/update-manager.js")) {
    // Insert ahead of the app's deferred scripts. As a plain (synchronous) script it executes
    // during parsing — before any deferred script runs — which is the whole point.
    const headClose = indexHtml.lastIndexOf("</head>")
    if (headClose === -1) {
        console.error("  index.html has no </head> — cannot inject the shell script")
        process.exit(1)
    }
    indexHtml = indexHtml.slice(0, headClose) + shellTag + indexHtml.slice(headClose)
    writeFileSync(indexPath, indexHtml)
}

console.log(`  www assembled from ${sourceDir}`)
