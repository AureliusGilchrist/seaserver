// Rasterizes the deus-ex-aeternae emblem into the app's launcher mipmaps and adaptive-icon
// layers. Run once after a clean checkout:  node scripts/make-icons.mjs
import sharp from "sharp"
import { readFileSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const resDir = join(rootDir, "android", "app", "src", "main", "res")
const emblem = join(rootDir, "..", "seanime-web", "out-mobile", "deus-ex-aeternae-emblem.svg")
const svg = readFileSync(emblem)

// The emblem has no background of its own; on the launcher it sits on the app's near-black.
const background = { r: 12, g: 12, b: 12, alpha: 1 }

const mipmapSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }

for (const [density, size] of Object.entries(mipmapSizes)) {
    const icon = await sharp(svg, { density: 512 })
        .resize(size, size)
        .flatten({ background })
        .png()
        .toBuffer()
    for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
        const out = join(resDir, `mipmap-${density}`, name)
        if (name.includes("round")) {
            // Circular mask via an alpha channel.
            await sharp(icon)
                .composite([{
                    input: Buffer.from(
                        `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`
                    ),
                    blend: "dest-in",
                }])
                .png()
                .toFile(out)
        } else {
            await sharp(icon).toFile(out)
        }
    }
}

// Adaptive icon layers (API 26+): the vector XML foreground is replaced by plain PNGs —
// foreground scaled so the emblem's safe area survives the 108/72 viewport crop.
const adaptiveSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
for (const [density, size] of Object.entries(adaptiveSizes)) {
    const foreground = await sharp(svg, { density: 512 })
        .resize(Math.round(size * 0.55), Math.round(size * 0.55))
        .png()
        .toBuffer()
    await sharp({
        create: { width: size, height: size, channels: 4, background },
    })
        .composite([{ input: foreground, gravity: "centre" }])
        .png()
        .toFile(join(resDir, `mipmap-${density}`, "ic_launcher_foreground.png"))
}

console.log("  launcher icons written")
