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
 *   - Pixels are bucketed by hue and weighted toward vivid, bright colors, because the question is
 *     what the picture's *highlight* is. The dominant color of most artwork is its shadows:
 *     averaging everything gives mud, and a near-black brand ramp reads as "nothing happened".
 *     Near-black and near-white pixels are dropped outright.
 *   - The winning color is nudged into a usable range of saturation and lightness. A wallpaper can
 *     legitimately be almost any color, but a primary color has to carry text and borders, so the
 *     hue is kept exactly and the vividness is raised to a floor.
 */

import { getServerBaseUrl } from "@/api/client/server-url"

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
        const imageOrigin = new URL(url, window.location.href).origin
        if (imageOrigin !== window.location.origin) {
            const serverOrigin = new URL(getServerBaseUrl(), window.location.href).origin
            // Uploaded wallpapers are served by the app and require the credentialed CORS
            // request when the web UI is hosted on a different origin (for example, Tauri).
            // Public remote wallpapers remain anonymous so they do not receive app credentials.
            // The image cache answers with "*", which browsers refuse for a credentialed request.
            img.crossOrigin = imageOrigin === serverOrigin && !url.includes("/api/v1/image-cache") ? "use-credentials" : "anonymous"
        }
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error("wallpaper could not be loaded"))
        img.src = url
    })
}

/** `#rrggbb` → `"r g b"`, the form the CSS variables take so they can be given an alpha. */
function hexToTriplet(hex: string): string {
    const h6 = hex.replace("#", "")
    return `${parseInt(h6.slice(0, 2), 16) || 0} ${parseInt(h6.slice(2, 4), 16) || 0} ${parseInt(h6.slice(4, 6), 16) || 0}`
}

/** sRGB channel (0..255) to linear light, for relative luminance. */
function toLinear(c: number): number {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/**
 * The deep, colour-graded glass used over a light wallpaper: three dark tones taken from the
 * wallpaper's own hues, as `"r g b"` triplets. The UI's text is white, so over a bright picture the
 * glass has to turn dark — and rather than a flat smoked gray it keeps the wallpaper's colours,
 * graded from its highlight hue into its second hue.
 */
export type WallpaperGrade = {
    /** The highlight hue, very dark — the body of the glass. */
    deep: string
    /** The second hue of the picture, darker still — where the gradient ends. */
    mid: string
    /** The highlight hue, lifted — the lit corner of the gradient. */
    glow: string
    /** A light tint of the highlight hue — borders and the top sheen. */
    edge: string
}

export type WallpaperAnalysis = {
    /** The general highlight, as a hex color — or null when the picture is all shadow and paper. */
    accent: string | null
    /** The median pixel's relative luminance, 0..1 — half the picture is brighter than this. */
    luminance: number
    /** 20 evenly spaced quantiles of the pixels' relative luminance, darkest first. */
    quantiles: number[]
    grade: WallpaperGrade
}

/**
 * Reads an image once: its general highlight (the app's primary color), how bright it is, and the
 * colour grade the glass takes when it is too bright for white text. Null when it cannot be read.
 */
export async function analyzeWallpaper(url: string): Promise<WallpaperAnalysis | null> {
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
        const luminances: number[] = []

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3]! < 128) continue
            const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!
            luminances.push(0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b))
            const [hue, sat, light] = rgbToHsl(r, g, b)
            // Shadows and paper: not a highlight, and averaging them in is what turns every
            // wallpaper's color into gray.
            if (light < 0.18 || light > 0.96) continue
            // Prefer bright, vivid pixels over dark saturated colors so the accent follows the
            // wallpaper's highlights rather than its deeper red/black midtones.
            const weight = Math.pow(sat, 1.25) * Math.pow(light, 2)
            if (weight <= 0.001) continue

            const key = Math.round(hue / 15) % 24
            const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 }
            bucket.weight += weight
            bucket.r += r * weight
            bucket.g += g * weight
            bucket.b += b * weight
            buckets.set(key, bucket)
        }
        if (!luminances.length) return null

        // The brightness spread of the picture, kept as 20 quantiles: enough to tell how much of it a
        // dim leaves too bright for white text (see `wallpaperGlassStrength`) without keeping pixels.
        luminances.sort((a, b) => a - b)
        const quantiles = Array.from({ length: 20 }, (_, i) => luminances[Math.floor((i + 0.5) / 20 * luminances.length)]!)
        const luminance = luminances[Math.floor(luminances.length / 2)]!

        const ranked = [...buckets.entries()].sort((a, b) => b[1].weight - a[1].weight)
        const best = ranked[0]?.[1]

        let accent: string | null = null
        // A colourless picture (paper, snow, grayscale art) grades into a cool slate.
        let gradeHue = 222, gradeSat = 0.2, secondHue = 250
        if (best && best.weight > 0) {
            const [hue, sat, light] = rgbToHsl(best.r / best.weight, best.g / best.weight, best.b / best.weight)
            // Keep the hue the wallpaper gave; make sure the color can carry text and borders.
            accent = hslToHex(hue, Math.max(sat, 0.45), Math.min(Math.max(light, 0.48), 0.65))
            gradeHue = hue
            gradeSat = Math.min(0.62, Math.max(0.32, sat))
            // The second hue is the next bucket that is actually a different colour (30°+ away);
            // a one-colour picture grades toward its neighbour on the wheel instead.
            const second = ranked.slice(1).find(([key]) => {
                const d = Math.abs(key * 15 - hue) % 360
                return Math.min(d, 360 - d) >= 30
            })?.[1]
            secondHue = second
                ? rgbToHsl(second.r / second.weight, second.g / second.weight, second.b / second.weight)[0]
                : (hue + 32) % 360
        }

        const grade: WallpaperGrade = {
            deep: hexToTriplet(hslToHex(gradeHue, gradeSat, 0.115)),
            mid: hexToTriplet(hslToHex(secondHue, Math.min(0.55, gradeSat + 0.05), 0.085)),
            glow: hexToTriplet(hslToHex(gradeHue, Math.min(0.7, gradeSat + 0.12), 0.2)),
            edge: hexToTriplet(hslToHex(gradeHue, Math.min(0.75, gradeSat + 0.15), 0.72)),
        }

        return { accent, luminance, quantiles, grade }
    } catch {
        return null
    }
}

/**
 * Relative luminance above which a pixel counts as light: CIE L* ≈ 55, the point where white text
 * over a lightly smoked glass stops being comfortably readable.
 */
export const LIGHT_PIXEL_LUMINANCE = 0.23

/**
 * How strongly the glass has to be graded over this wallpaper, as it is shown (after the app's dim,
 * `dim` being the share of black laid over it, 0..1): 0 for a picture dark all over, 1 when most of
 * it is light — or when enough of it is (a third), because text crosses the bright patches of a
 * mixed picture however dark the rest is. Every wallpaper gets the graded glass; this sets how deep.
 */
export function wallpaperGlassStrength(analysis: Pick<WallpaperAnalysis, "luminance" | "quantiles">, dim: number): number {
    const keep = 1 - Math.min(Math.max(dim, 0), 1)
    const brightShare = analysis.quantiles.filter(q => q * keep > LIGHT_PIXEL_LUMINANCE).length / analysis.quantiles.length
    const medianShown = analysis.luminance * keep
    return Math.min(1, Math.max(brightShare / 0.34, medianShown / LIGHT_PIXEL_LUMINANCE))
}

/** Whether the wallpaper, as shown, counts as light: its glass needs (nearly) the full grade. */
export function isLightWallpaper(analysis: Pick<WallpaperAnalysis, "luminance" | "quantiles">, dim: number): boolean {
    return wallpaperGlassStrength(analysis, dim) >= 0.6
}

/**
 * What the glass falls back to when the wallpaper cannot be read (it failed to load or to be
 * sampled): a neutral slate at full strength, since an unread picture may well be a bright one.
 */
export const UNREADABLE_WALLPAPER: WallpaperAnalysis = {
    accent: null,
    luminance: 1,
    quantiles: Array(20).fill(1),
    grade: { deep: "17 22 34", mid: "13 14 30", glow: "38 48 70", edge: "196 206 230" },
}

/**
 * The general highlight of an image, as a hex color — or null when nothing usable can be read from
 * it (it failed to load, or it is all shadow and paper).
 */
export async function extractWallpaperAccent(url: string): Promise<string | null> {
    return (await analyzeWallpaper(url))?.accent ?? null
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
