#!/usr/bin/env node
/**
 * sync-versions.js
 * Reads versions.json (single source of truth) and propagates every version
 * number into the files listed in the manifest's "source" fields:
 *
 *   • seanime-web/package.json        ← versions["seanime-web"].version
 *   • seanime-denshi/package.json     ← versions["seanime-denshi"].version
 *   • internal/constants/constants.go ← versions["seaserver"].version + codename
 *                                        versions["rooms"].version
 *
 * Run:  node sync-versions.js
 * The script is also wired into the "predev" / "prebuild" hooks of each
 * package.json so it runs automatically before any dev or build command.
 */

import { readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname

// ── 1. Load the manifest ────────────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(resolve(root, "versions.json"), "utf8"))

const webVersion    = manifest["seanime-web"]?.version
const denshiVersion = manifest["seanime-denshi"]?.version
const serverVersion = manifest["seaserver"]?.version
const serverName    = manifest["seaserver"]?.codename
const roomsVersion  = manifest["rooms"]?.version

// ── 2. Helper: patch "version" field in a package.json ──────────────────────
function patchPackageJson(relPath, newVersion) {
    const absPath = resolve(root, relPath)
    const pkg = JSON.parse(readFileSync(absPath, "utf8"))
    if (pkg.version === newVersion) {
        console.log(`  [skip]  ${relPath} already at ${newVersion}`)
        return
    }
    const old = pkg.version
    pkg.version = newVersion
    // Preserve trailing newline and 2-space indent used in each file
    const indent = relPath.includes("seanime-web") ? 4 : 2
    writeFileSync(absPath, JSON.stringify(pkg, null, indent) + "\n")
    console.log(`  [patch] ${relPath}: ${old} → ${newVersion}`)
}

// ── 3. Helper: patch Go constants fallback defaults ─────────────────────────
function patchGoConstants(relPath, version, codename, roomsVer) {
    const absPath = resolve(root, relPath)
    let src = readFileSync(absPath, "utf8")
    let changed = false

    // Match: Version = "x.y.z"
    src = src.replace(/(Version\s*=\s*)"[^"]+"/, (m, prefix) => {
        const replacement = `${prefix}"${version}"`
        if (m !== replacement) changed = true
        return replacement
    })
    // Match: VersionName = "..."
    src = src.replace(/(VersionName\s*=\s*)"[^"]+"/, (m, prefix) => {
        const replacement = `${prefix}"${codename}"`
        if (m !== replacement) changed = true
        return replacement
    })
    // Match: SeanimeRoomsVersion = "x.y.z"
    src = src.replace(/(SeanimeRoomsVersion\s*=\s*)"[^"]+"/, (m, prefix) => {
        const replacement = `${prefix}"${roomsVer}"`
        if (m !== replacement) changed = true
        return replacement
    })

    if (!changed) {
        console.log(`  [skip]  ${relPath} already up to date`)
        return
    }
    writeFileSync(absPath, src)
    console.log(`  [patch] ${relPath}: Version=${version}, VersionName=${codename}, Rooms=${roomsVer}`)
}

// ── 4. Apply ─────────────────────────────────────────────────────────────────
console.log("sync-versions: propagating versions.json →")

if (webVersion)    patchPackageJson("seanime-web/package.json",    webVersion)
if (denshiVersion) patchPackageJson("seanime-denshi/package.json", denshiVersion)
if (serverVersion && serverName && roomsVersion)
    patchGoConstants("internal/constants/constants.go", serverVersion, serverName, roomsVersion)

console.log("sync-versions: done")
