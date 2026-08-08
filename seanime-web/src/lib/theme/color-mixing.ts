import { colord, extend } from "colord"
import mixPlugin from "colord/plugins/mix"
import { atom } from "jotai"

extend([mixPlugin])

/**
 * CSS variables owned by the Settings > Color scheme section when `enableColorSettings` is on.
 *
 * An anime theme from the Theme Manager still contributes its wallpaper, particles, effects,
 * fonts, cursors and icons — but these colors come from the user's color scheme instead, with
 * the theme's own background mixed in as a tint (see `mixWithThemeTint`).
 */
export const SETTINGS_OWNED_COLOR_VARS = new Set([
    "--background",
    "--paper",
    "--media-card-popup-background",
    "--hover-from-background-color",
    "--color-gray-400",
    "--color-gray-500",
    "--color-gray-600",
    "--color-gray-700",
    "--color-gray-800",
    "--color-gray-900",
    "--color-gray-950",
    "--color-brand-200",
    "--color-brand-300",
    "--color-brand-400",
    "--color-brand-500",
    "--color-brand-600",
    "--color-brand-700",
    "--color-brand-800",
    "--color-brand-900",
    "--color-brand-950",
    "--brand",
])

/**
 * Background color of the active anime theme, published by `AnimeThemeProvider`.
 * `null` when no anime theme is active (or the default "seanime" theme is).
 */
export const animeThemeBaseColorAtom = atom<string | null>(null)

/**
 * Per-theme brand color explicitly picked by the user in the Theme Manager.
 * An explicit pick still wins over the settings accent color.
 */
export const animeThemeBrandOverrideAtom = atom<string | null>(null)

/** How much of the anime theme's background bleeds into the settings background color. */
export const THEME_TINT_RATIO = 0.35

/**
 * Themes may express colors either as hex (`#070200`) or as a bare RGB triplet (`7 2 0`),
 * since some vars are consumed through `rgb(var(--x))`.
 */
export function normalizeThemeColor(value: string | null | undefined): string | null {
    if (!value) return null
    const v = value.trim()
    if (v.startsWith("#") || v.startsWith("rgb")) return v
    const parts = v.split(/[\s,]+/).filter(Boolean)
    if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) return `rgb(${parts.join(" ")})`
    return null
}

/**
 * Mixes the user's settings background color with the active anime theme's background,
 * so the UI keeps the theme's character while the color scheme drives the base tone.
 */
export function mixWithThemeTint(settingsBg: string, themeBg: string | null): string {
    const normalized = normalizeThemeColor(themeBg)
    if (!normalized) return settingsBg
    try {
        const mixed = colord(settingsBg).mix(normalized, THEME_TINT_RATIO)
        return mixed.isValid() ? mixed.toHex() : settingsBg
    } catch {
        return settingsBg
    }
}
