"use client"

import { useAtomValue } from "jotai"
import { colord } from "colord"
import * as React from "react"
import { serverStatusAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { THEME_DEFAULT_VALUES } from "@/lib/theme/hooks"
import type { XPBarSkinReward } from "@/lib/rewards/reward-definitions"

/**
 * Every XP bar skin is drawn in the accent color from Settings > Color scheme.
 *
 * The accent is the one color the user has already told the app to be, and the XP bar is the most
 * prominent thing on the profile — a bar in an unrelated color is the single loudest thing fighting
 * the theme. So the accent wins, on whichever skin is worn.
 *
 * What is *not* taken away is the skin itself. A skin is a shape as much as a color: how many stops
 * its gradient has, where the bright band sits, whether it drifts or flickers or breathes. Replacing
 * every skin with one flat accent bar would collapse two hundred rewards into one. So each color in
 * the skin is turned to the accent's hue while keeping its own lightness, saturation and alpha — the
 * gradient keeps its structure, its animation keeps running, and the whole thing arrives in the
 * user's color. Grays and near-blacks stay as they are: they have no hue to move, and forcing one
 * into them would tint the dark ends of a skin that was designed to fall away.
 */

/** Colors as they appear inside a CSS value: #hex, rgb(), rgba(), hsl(), hsla(). */
const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g

/**
 * Below this saturation a color is a gray, and a gray has no hue worth replacing. Bars use these at
 * their dark ends and for tracks; tinting them would push the accent somewhere it does not belong.
 */
const GRAY_SATURATION_CUTOFF = 8

/** Keeps a percentage inside the range where a color is still a color. */
function clampPercent(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/**
 * Recolors every color in a CSS value — a gradient, a shadow, a plain color — to the accent.
 * Structure, stop positions, angles and keywords are untouched, because only the color tokens are
 * matched.
 *
 * The hue is replaced outright. Lightness and saturation are *shifted*, by however much it takes to
 * bring the value's average onto the accent's, rather than being kept as they were. That difference
 * matters: keeping them made a one-color skin land near the accent instead of on it — the shop chip
 * and the bar were visibly different colors — while shifting them puts a plain skin exactly on the
 * accent and leaves a six-stop gradient its own light and dark bands, now centred on the accent
 * instead of on whatever it was designed around.
 */
export function recolorCssToAccent(css: string | null | undefined, accent: string | null | undefined): string | null {
    if (!css) return css ?? null
    if (!accent) return css
    const accentColor = colord(accent)
    if (!accentColor.isValid()) return css

    const accentHsl = accentColor.toHsl()

    // First pass: what the value's colors currently average, ignoring the grays that are staying put.
    const tokens = css.match(COLOR_TOKEN) ?? []
    let count = 0
    let sumL = 0
    let sumS = 0
    for (const token of tokens) {
        const color = colord(token)
        if (!color.isValid()) continue
        const hsl = color.toHsl()
        if (hsl.s <= GRAY_SATURATION_CUTOFF) continue
        count++
        sumL += hsl.l
        sumS += hsl.s
    }
    if (count === 0) return css

    const lightnessShift = accentHsl.l - sumL / count
    const saturationShift = accentHsl.s - sumS / count

    return css.replace(COLOR_TOKEN, token => {
        const color = colord(token)
        if (!color.isValid()) return token
        const hsl = color.toHsl()
        if (hsl.s <= GRAY_SATURATION_CUTOFF) return token
        const next = colord({
            h: accentHsl.h,
            // Never all the way to 0 or 100: a stop pushed to pure black or pure white stops being
            // part of the gradient and becomes a hole in it.
            s: clampPercent(hsl.s + saturationShift, 6, 100),
            l: clampPercent(hsl.l + lightnessShift, 6, 94),
            a: hsl.a,
        })
        return hsl.a < 1 ? next.toRgbString() : next.toHex()
    })
}

/** The accent color currently set in Settings > Color scheme. */
export function useAccentColor(): string {
    const themeSettings = useAtomValue(serverStatusAtom)?.themeSettings
    return themeSettings?.accentColor || THEME_DEFAULT_VALUES.accentColor
}

/**
 * Returns a function that puts any skin into the accent color — fill, track, and the page-level
 * effect variables the top-tier skins bleed into the surrounding UI.
 *
 * Memoized on the accent alone, so a change in Settings moves every bar on screen at once and
 * nothing else re-renders for it.
 */
export function useAccentSkin(): (skin: XPBarSkinReward | null | undefined) => XPBarSkinReward | null {
    const accent = useAccentColor()

    return React.useCallback((skin: XPBarSkinReward | null | undefined) => {
        if (!skin) return null
        return accentSkin(skin, accent)
    }, [accent])
}

/** The non-hook form, for callers that already hold the accent. */
export function accentSkin(skin: XPBarSkinReward, accent: string | null | undefined): XPBarSkinReward {
    if (!accent) return skin

    const fillCss = recolorCssToAccent(skin.fillCss, accent) ?? skin.fillCss
    const trackCss = skin.trackCss ? recolorCssToAccent(skin.trackCss, accent) ?? skin.trackCss : skin.trackCss

    let pageEffectVars = skin.pageEffectVars
    if (pageEffectVars) {
        pageEffectVars = Object.fromEntries(
            Object.entries(pageEffectVars).map(([key, value]) => [key, recolorCssToAccent(value, accent) ?? value]),
        )
    }

    return { ...skin, fillCss, trackCss, pageEffectVars }
}
