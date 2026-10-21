// Builds a mobile frontend bundle from a built out-mobile and publishes it to the server.
//
//   node scripts/publish-frontend.mjs [--source <out-mobile>] [--out <dir>]
//   node scripts/publish-frontend.mjs --upload <serverUrl> --password <serverPassword>
//
// The bundle is a zip of the frontend's CONTENTS (index.html at the zip root) plus the shell
// layer at shell/update-manager.js, with the shell <script> injected into index.html. The zip's
// sha256 doubles as the version — any change to the frontend is a new version.
//
// Publishing can be done two ways:
//   --upload   POSTs the zip to /api/v1/mobile-frontend/publish (token = sha256 of the server
//              password, the same X-Seanime-Token every client sends).
//   by hand    copy publish/bundle.zip and publish/manifest.json into the server data dir's
//              mobile-frontend/ folder and restart nothing — the endpoints read them per-request.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { join, resolve, dirname, relative } from "node:path"
import { deflateRawSync } from "node:zlib"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, "..")
const defaultSource = resolve(rootDir, "..", "seanime-web", "out-mobile")
const shellScript = readFileSync(join(rootDir, "src", "update-manager.js"))
const shellTag = `<script src="/shell/update-manager.js"></script>`

const args = process.argv.slice(2)
function argValue(name) {
    const i = args.indexOf(name)
    return i !== -1 && args[i + 1] ? args[i + 1] : null
}
const sourceDir = argValue("--source") ? resolve(argValue("--source")) : defaultSource
const outDir = argValue("--out") ? resolve(argValue("--out")) : join(rootDir, "publish")
const uploadUrl = argValue("--upload")
const password = argValue("--password")

if (!existsSync(join(sourceDir, "index.html"))) {
    console.error(`\n  No frontend build at ${sourceDir}\n  Build it first:  cd ../seanime-web && npm run build:mobile\n`)
    process.exit(1)
}

// -------------------------------------------------------------------------------------------
// Minimal zip writer — deflate entries with forward-slash names. Java's ZipInputStream (the
// native unzipper) is strict about separators, so nothing here may emit backslashes.
// -------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
    const table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c
    }
    return table
})()

function crc32(buf) {
    let crc = -1
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
    return (crc ^ -1) >>> 0
}

function dosDateTime(date) {
    const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f)
    const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f)
    return { time, day }
}

function buildZip(entries) {
    const now = dosDateTime(new Date())
    const localParts = []
    const centralParts = []
    let offset = 0

    for (const entry of entries) {
        const nameBuf = Buffer.from(entry.name, "utf8")
        const compressed = deflateRawSync(entry.data, { level: 9 })
        const crc = crc32(entry.data)

        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(20, 4) // version needed
        local.writeUInt16LE(0, 6) // flags
        local.writeUInt16LE(8, 8) // method: deflate
        local.writeUInt16LE(now.time, 10)
        local.writeUInt16LE(now.day, 12)
        local.writeUInt32LE(crc, 14)
        local.writeUInt32LE(compressed.length, 18)
        local.writeUInt32LE(entry.data.length, 22)
        local.writeUInt16LE(nameBuf.length, 26)
        local.writeUInt16LE(0, 28)
        localParts.push(local, nameBuf, compressed)

        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)
        central.writeUInt16LE(20, 4) // version made by
        central.writeUInt16LE(20, 6) // version needed
        central.writeUInt16LE(0, 8)
        central.writeUInt16LE(8, 10)
        central.writeUInt16LE(now.time, 12)
        central.writeUInt16LE(now.day, 14)
        central.writeUInt32LE(crc, 16)
        central.writeUInt32LE(compressed.length, 20)
        central.writeUInt32LE(entry.data.length, 24)
        central.writeUInt16LE(nameBuf.length, 28)
        central.writeUInt16LE(0, 30) // extra
        central.writeUInt16LE(0, 32) // comment
        central.writeUInt16LE(0, 34) // disk number
        central.writeUInt16LE(0, 36) // internal attrs
        central.writeUInt32LE(0, 38) // external attrs
        central.writeUInt32LE(offset, 42)
        centralParts.push(central, nameBuf)

        offset += 30 + nameBuf.length + compressed.length
    }

    const centralStart = offset
    const centralBuf = Buffer.concat(centralParts)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(entries.length, 8)
    eocd.writeUInt16LE(entries.length, 10)
    eocd.writeUInt32LE(centralBuf.length, 12)
    eocd.writeUInt32LE(centralStart, 16)
    eocd.writeUInt16LE(0, 20)

    return Buffer.concat([...localParts, centralBuf, eocd])
}

// -------------------------------------------------------------------------------------------
// Collect the bundle
// -------------------------------------------------------------------------------------------

let entries = []

// The desktop theme wallpapers are 350+ MB; phone bundles ship without them (theme colors and
// cursors still apply). Pass --include-themes to publish them anyway.
const includeThemes = args.includes("--include-themes")

function collect(dir, prefix) {
    for (const name of readdirSync(dir)) {
        if (!includeThemes && name === "themes" && dir === sourceDir) continue
        const full = join(dir, name)
        const rel = prefix ? `${prefix}/${name}` : name
        if (statSync(full).isDirectory()) collect(full, rel)
        else entries.push({ name: rel, data: readFileSync(full) })
    }
}
collect(sourceDir, "")

// Inject the shell script tag into the bundled index.html (the out-mobile build on disk doesn't
// carry it — the APK's build-www writes its own copy, and here we write it into the zip only).
const indexEntry = entries.find((e) => e.name === "index.html")
if (!indexEntry) {
    console.error("  out-mobile has no index.html")
    process.exit(1)
}
let indexHtml = indexEntry.data.toString("utf8")
if (!indexHtml.includes("shell/update-manager.js")) {
    const headClose = indexHtml.lastIndexOf("</head>")
    if (headClose === -1) {
        console.error("  index.html has no </head> — cannot inject the shell script")
        process.exit(1)
    }
    indexHtml = indexHtml.slice(0, headClose) + shellTag + indexHtml.slice(headClose)
    indexEntry.data = Buffer.from(indexHtml, "utf8")
}

// The shell rides in every bundle, so a published update refreshes it too.
entries = entries.filter((e) => e.name !== "shell/update-manager.js")
entries.push({ name: "shell/update-manager.js", data: shellScript })

const zip = buildZip(entries)
const version = createHash("sha256").update(zip).digest("hex")
const manifest = {
    version,
    hash: version,
    size: zip.length,
    builtAt: new Date().toISOString(),
    filename: "bundle.zip",
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, "bundle.zip"), zip)
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2))

const fileCount = entries.length
console.log(`  bundle: ${outDir}\\bundle.zip`)
console.log(`  version: ${version.slice(0, 16)}…  (${fileCount} files, ${(zip.length / 1024 / 1024).toFixed(1)} MB)`)

if (uploadUrl) {
    if (!password) {
        console.error("  --upload needs --password <serverPassword>")
        process.exit(1)
    }
    const token = createHash("sha256").update(password, "utf8").digest("hex")
    const server = uploadUrl.replace(/\/+$/, "")

    const form = new FormData()
    form.append("bundle", new Blob([zip], { type: "application/zip" }), "bundle.zip")
    form.append("builtAt", manifest.builtAt)

    const res = await fetch(`${server}/api/v1/mobile-frontend/publish`, {
        method: "POST",
        headers: { "X-Seanime-Token": token },
        body: form,
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
        console.error(`  publish failed: ${res.status}`, body)
        process.exit(1)
    }
    if (body.unchanged) {
        console.log("  server already has this exact bundle — nothing to do")
    } else {
        console.log(`  published to ${server} (version ${body.manifest?.version?.slice(0, 16)}…)`)
    }
} else {
    console.log(`  not uploaded — run with --upload <serverUrl> --password <serverPassword>, or copy`)
    console.log(`  bundle.zip and manifest.json into the server's data dir under mobile-frontend/`)
}
