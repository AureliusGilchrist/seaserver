/**
 * The color of the wallpaper.
 *
 * The app's primary color is taken from the background image itself — the general highlight of the
 * picture rather than a color declared anywhere — so the UI always agrees with what is behind it.
 * A wallpaper of a sunlit field gives an amber interface; one of a night sky gives an indigo one;
 * and changing the wallpaper changes the interface at the same moment, because this is recomputed
 * from the image every time it changes.
 *
 * The extraction is deliberately cheap and deliberately conservative:
 *
 *   - The image is drawn at a thumbnail size and read back, which is a few thousand pixels rather
 *     than a few million — a wallpaper is megabytes and this runs on every change.
 *   - Pixels are bucketed by hue and weighted by how vivid and mid-toned they are, because the
 *     question is what the picture's *highlight* is. The dominant color of most artwork is its
 *     shadows: averaging everything gives mud, and a near-black brand ramp reads as "nothing
 *     happened". Near-black and near-white pixels are dropped outright.
 *   - The winning color is nudged into a usable range of saturation and lightness. A wallpaper can
 *     legitimately be almost any color, but a primary color has to carry text and borders, so the
 *     hue is kept exactly and the vividness is raised to a floor.
 */

const SAMPLE_SIZE = 64

/** `rgb()` components to HSL, each of h in degrees and s/l in 0..1. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h: number
    switch (max) {
        case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break
        case gn: h = ((bn - rn) / d + 2) / 6; break
        default: h = ((rn - gn) / d + 4) / 6
    }
    return [h * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
    const lN = l, sN = s
    const a = sN * Math.min(lN, 1 - lN)
    const f = (n: number) => {
        const k = (n + h / 30) % 12
        return Math.round(255 * (lN - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))).toString(16).padStart(2, "0")
    }
    return `#${f(0)}${f(8)}${f(4)}`
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        // Same-origin wallpapers (everything the app serves) read back fine. A remote image that
        // does not send CORS headers cannot be read at all, and is left to fail here rather than
        // tainting a canvas that other code draws on.
        if (!url.startsWith("/") && !url.startsWith(window.location.origin)) {
            img.crossOrigin = "anonymous"
        }
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error("wallpaper could not be loaded"))
        img.src = url
    })
}

/**
 * The general highlight of an image, as a hex color — or null when nothing usable can be read from
 * it (it failed to load, or it is all shadow and paper).
 */
export async function extractWallpaperAccent(url: string): Promise<string | null> {
    if (typeof document === "undefined" || !url) return null

    try {
        const img = await loadImage(url)
        if (!img.naturalWidth || !img.naturalHeight) return null

        const scale = Math.min(SAMPLE_SIZE / img.naturalWidth, SAMPLE_SIZE / img.naturalHeight, 1)
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))

        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return null
        ctx.drawImage(img, 0, 0, w, h)

        const { data } = ctx.getImageData(0, 0, w, h)

        // Hue buckets, each holding the weighted average of the pixels that fell into it.
        const buckets = new Map<number, { weight: number, r: number, g: number, b: number }>()

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3]! < 128) continue
            const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
            const [hue, sat, light] = rgbToHsl(r, g, b)
            // Shadows and paper: not a highlight, and averaging them in is what turns every
            // wallpaper's color into gray.
            if (light < 0.14 || light > 0.93) continue
            // Vivid, mid-toned pixels win; dull ones still count for a little, so a muted wallpaper
            // can still answer with its own color.
            const weight = Math.pow(sat, 1.4) * (1 - Math.min(1, Math.abs(light - 0.55) * 1.5))
            if (weight <= 0.001) continue

            const key = Math.round(hue / 15) % 24
            const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 }
            bucket.weight += weight
            bucket.r += r * weight
            bucket.g += g * weight
            bucket.b += b * weight
            buckets.set(key, bucket)
        }

        let best: { weight: number, r: number, g: number, b: number } | null = null
        for (const bucket of buckets.values()) {
            if (!best || bucket.weight > best.weight) best = bucket
        }
        if (!best || best.weight <= 0) return null

        const r = best.r / best.weight
        const g = best.g / best.weight
        const b = best.b / best.weight
        const [hue, sat, light] = rgbToHsl(r, g, b)

        // Keep the hue the wallpaper gave; make sure the color can carry text and borders.
        return hslToHex(hue, Math.max(sat, 0.45), Math.min(Math.max(light, 0.45), 0.6))
    } catch {
        return null
    }
}

/** A two-stop gradient of a color with itself darkened — what the exp bar uses for a theme color. */
export function accentGradient(hex: string): string {
    const [h, s, l] = (() => {
        const h6 = hex.replace("#", "")
        const r = parseInt(h6.slice(0, 2), 16) || 0
        const g = parseInt(h6.slice(2, 4), 16) || 0
        const b = parseInt(h6.slice(4, 6), 16) || 0
        return rgbToHsl(r, g, b)
    })()
    const darker = hslToHex(h, Math.min(1, s * 1.05), Math.max(0.18, l * 0.72))
    return `linear-gradient(90deg, ${darker} 0%, ${hex} 55%, ${hslToHex(h, Math.max(0, s * 0.85), Math.min(0.85, l * 1.25))} 100%)`
}
