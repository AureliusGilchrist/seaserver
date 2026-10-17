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
 * Run:  node sync-versions.js [--bump]
 * The script is also wired into the "predev" / "prebuild" hooks of each
 * package.json so it runs automatically before any dev or build command.
 *
 * --bump  Before propagating, auto-increment the trailing build number of the
 *         seaserver version ("5.0.0-0" → "5.0.0-1") in versions.json itself, so
 *         every build reports a version newer than the last. Build scripts pass
 *         this flag; dev runs must not, to keep the tree clean.
 */

import { readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname

// Serialize preserving the file's dominant line ending, so rewrites don't churn
// every line of a CRLF file into LF (or vice versa) in git diffs.
function serialize(obj, indent, absPath) {
    const original = readFileSync(absPath, "utf8")
    const eol = (original.match(/\r\n/g)?.length ?? 0) > (original.match(/(?<!\r)\n/g)?.length ?? 0) ? "\r\n" : "\n"
    return JSON.stringify(obj, null, indent).replace(/\n/g, eol) + eol
}

// ── 1. Load the manifest ────────────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(resolve(root, "versions.json"), "utf8"))

const BUMP = process.argv.includes("--bump")

// --bump: increment the trailing build number of the seaserver version
// ("5.0.0-0" → "5.0.0-1") and write the manifest back before propagating.
// Only the seaserver (server binary) version bumps — the web and denshi
// packages keep their own versions.
if (BUMP) {
    const seaserver = manifest["seaserver"]
    if (seaserver?.version) {
        const m = seaserver.version.match(/^(.*?)-(\d+)$/)
        if (m) {
            const old = seaserver.version
            seaserver.version = `${m[1]}-${Number(m[2]) + 1}`
            manifest["lastUpdated"] = new Date().toISOString().slice(0, 10)
            writeFileSync(resolve(root, "versions.json"),
                serialize(manifest, 4, resolve(root, "versions.json")))
            console.log(`  [bump]  seaserver version: ${old} → ${seaserver.version}`)
        } else {
            console.log(`  [bump]  seaserver version "${seaserver.version}" has no -N suffix; leaving it untouched`)
        }
    }
}

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
    // Preserve trailing newline, indentation and line endings used in each file
    const indent = relPath.includes("seanime-web") ? 4 : 2
    writeFileSync(absPath, serialize(pkg, indent, absPath))
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
