#!/usr/bin/env node
/**
 * sync-versions.js
 * Reads versions.json (single source of truth) and propagates the ONE shared version into every
 * component:
 *
 *   • seanime-web/package.json
 *   • seanime-denshi/package.json
 *   • seanime-denshi-mobile/package.json (+ package-lock.json)
 *   • seanime-denshi-mobile-android/package.json
 *   • internal/constants/constants.go   (Version, FrontendVersion, VersionName; rooms stays its own)
 *
 * Run:  node sync-versions.js [--bump | --bump-test | --release-patch | --release-minor]
 * It is also wired into the "predev" / "prebuild" hooks of each package.json (no flag there, so
 * dev runs never change the version).
 *
 * Version scheme  X.Y.Z-N
 *   N         the test iteration of the change being worked on (-1, -2, -3 …, unbounded)
 *   --bump / --bump-test   X.Y.Z-N  → X.Y.Z-(N+1)       every test build of an update
 *   --release-patch        X.Y.Z-N  → X.Y.(Z+1)-0       a regular update confirmed working
 *   --release-minor        X.Y.Z-N  → X.(Y+1).0-0       a huge update confirmed working
 *   Carry: any of X, Y, Z that goes past 15 resets to 0 and adds 1 to the number before it
 *          (5.0.15 + patch → 5.1.0-0, 5.15.15 + patch → 6.0.0-0, 5.15.3 + minor → 6.0.0-0).
 *   The -N suffix is never carried.
 */

import { readFileSync, writeFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = __dirname

export const CARRY_LIMIT = 15

/** Parses "X.Y.Z" or "X.Y.Z-N". */
export function parseVersion(v) {
    const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/)
    if (!m) throw new Error(`unrecognised version "${v}" (expected X.Y.Z-N)`)
    return { major: +m[1], minor: +m[2], patch: +m[3], test: m[4] === undefined ? 0 : +m[4] }
}

export function formatVersion({ major, minor, patch, test }) {
    return `${major}.${minor}.${patch}-${test}`
}

/** Applies the carry rule from patch upward. */
function carry(v) {
    let { major, minor, patch } = v
    if (patch > CARRY_LIMIT) {
        minor += Math.floor(patch / (CARRY_LIMIT + 1))
        patch = patch % (CARRY_LIMIT + 1)
    }
    if (minor > CARRY_LIMIT) {
        major += Math.floor(minor / (CARRY_LIMIT + 1))
        minor = minor % (CARRY_LIMIT + 1)
    }
    return { ...v, major, minor, patch }
}

/** kind: "test" | "patch" | "minor" */
export function bumpVersion(version, kind) {
    const v = parseVersion(version)
    switch (kind) {
        case "test":
            return formatVersion({ ...v, test: v.test + 1 })
        case "patch":
            return formatVersion(carry({ ...v, patch: v.patch + 1, test: 0 }))
        case "minor":
            return formatVersion(carry({ ...v, minor: v.minor + 1, patch: 0, test: 0 }))
        default:
            throw new Error(`unknown bump kind "${kind}"`)
    }
}

// Serialize preserving the file's dominant line ending, so rewrites don't churn
// every line of a CRLF file into LF (or vice versa) in git diffs.
function serialize(obj, indent, absPath) {
    const original = readFileSync(absPath, "utf8")
    const eol = (original.match(/\r\n/g)?.length ?? 0) > (original.match(/(?<!\r)\n/g)?.length ?? 0) ? "\r\n" : "\n"
    return JSON.stringify(obj, null, indent).replace(/\n/g, eol) + eol
}

function patchPackageJson(relPath, newVersion, { lock = false } = {}) {
    const absPath = resolve(root, relPath)
    if (!existsSync(absPath)) {
        console.log(`  [miss]  ${relPath} not found`)
        return
    }
    const pkg = JSON.parse(readFileSync(absPath, "utf8"))
    let changed = false
    if (pkg.version !== newVersion) {
        pkg.version = newVersion
        changed = true
    }
    // package-lock.json carries the version twice: top level and packages[""].
    if (lock && pkg.packages?.[""] && pkg.packages[""].version !== newVersion) {
        pkg.packages[""].version = newVersion
        changed = true
    }
    if (!changed) {
        console.log(`  [skip]  ${relPath} already at ${newVersion}`)
        return
    }
    // Keep each file's own indentation (detected from its first indented line).
    const indent = readFileSync(absPath, "utf8").match(/\n( +)"/)?.[1]?.length ?? 2
    writeFileSync(absPath, serialize(pkg, indent, absPath))
    console.log(`  [patch] ${relPath} → ${newVersion}`)
}

function patchGoConstants(relPath, version, codename, roomsVer) {
    const absPath = resolve(root, relPath)
    let src = readFileSync(absPath, "utf8")
    const before = src
    // Anchored to line start so "FrontendVersion" / "SeanimeRoomsVersion" are not hit by the
    // plain "Version" pattern.
    src = src.replace(/^(\s*Version\s*=\s*)"[^"]+"/m, `$1"${version}"`)
    src = src.replace(/^(\s*VersionName\s*=\s*)"[^"]+"/m, `$1"${codename}"`)
    if (roomsVer) src = src.replace(/^(\s*SeanimeRoomsVersion\s*=\s*)"[^"]+"/m, `$1"${roomsVer}"`)
    src = src.replace(/^(\s*FrontendVersion\s*=\s*)"[^"]+"/m, `$1"${version}"`)
    if (src === before) {
        console.log(`  [skip]  ${relPath} already up to date`)
        return
    }
    writeFileSync(absPath, src)
    console.log(`  [patch] ${relPath}: Version=${version}, Frontend=${version}, VersionName=${codename}`)
}

function main() {
    const manifestPath = resolve(root, "versions.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))

    // Older manifests had per-component versions; the Denshi one is the version the user tracks.
    if (!manifest.version) {
        manifest.version = manifest["seanime-denshi"]?.version || manifest["seaserver"]?.version
    }

    const args = process.argv.slice(2)
    const kind = args.includes("--release-minor") ? "minor"
        : args.includes("--release-patch") ? "patch"
            : (args.includes("--bump") || args.includes("--bump-test")) ? "test"
                : null

    if (kind) {
        const old = manifest.version
        manifest.version = bumpVersion(old, kind)
        manifest.lastUpdated = new Date().toISOString().slice(0, 10)
        writeFileSync(manifestPath, serialize(manifest, 4, manifestPath))
        console.log(`  [bump]  ${kind}: ${old} → ${manifest.version}`)
    }

    const version = manifest.version
    const codename = manifest["seaserver"]?.codename ?? "Deus Ex Aeternae"
    const roomsVersion = manifest["rooms"]?.version

    console.log(`sync-versions: propagating ${version} →`)
    patchPackageJson("seanime-web/package.json", version)
    patchPackageJson("seanime-denshi/package.json", version)
    patchPackageJson("seanime-denshi-mobile/package.json", version)
    patchPackageJson("seanime-denshi-mobile/package-lock.json", version, { lock: true })
    patchPackageJson("seanime-denshi-mobile-android/package.json", version)
    patchGoConstants("internal/constants/constants.go", version, codename, roomsVersion)
    console.log("sync-versions: done")
}

// Run only when executed directly (the test script imports the helpers).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
}
