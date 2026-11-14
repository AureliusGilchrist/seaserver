"use client"
import { useClientSettings } from "@/lib/client-settings"
import { DEFAULT_DARK_START_HOUR, DEFAULT_LIGHT_START_HOUR, inHourWindow, useLocalHour } from "@/lib/theme/time-schedule"
import React from "react"

/**
 * Personal -> Display -> Glass. Three optional values that reshape every translucent surface
 * (cards, panels, modals, popovers, menus, the sidebar, the top bar, toasts and anything else drawn
 * over a blur). Each one left unset keeps the theme's own glass for that property.
 *
 * They reach the CSS as variables on :root plus a data attribute per property that is set, so each
 * override rule in globals.css ("Personal glass overrides") applies only when its value is chosen.
 */

export const GLASS_TINT_DEFAULT = 60
export const GLASS_OPACITY_DEFAULT = 45
export const GLASS_BLUR_DEFAULT = 28
export const GLASS_BLUR_MAX = 64

export function clampGlassPercent(v: number) {
    return Math.min(100, Math.max(0, Math.round(v)))
}

export function clampGlassBlur(v: number) {
    return Math.min(GLASS_BLUR_MAX, Math.max(0, Math.round(v)))
}

/** A point on a glass surface, 0–100 on each axis from the top-left corner. */
export type GlassPoint = { x: number, y: number }
export type GlassGradient = { from: string, to: string, start: GlassPoint, end: GlassPoint }

/** Where the Recommended tint starts and ends: lit at the top-left, deepest at the bottom-right. */
export const RECOMMENDED_TINT_START: GlassPoint = { x: 15, y: 5 }
export const RECOMMENDED_TINT_END: GlassPoint = { x: 85, y: 95 }

export const GLASS_TINT_PRESETS: { id: string, label: string, from: string, to: string }[] = [
    { id: "aurora", label: "Aurora", from: "#34d399", to: "#6366f1" },
    { id: "sunset", label: "Sunset", from: "#fb923c", to: "#db2777" },
    { id: "sakura", label: "Sakura", from: "#f9a8d4", to: "#8b5cf6" },
    { id: "ocean", label: "Ocean", from: "#22d3ee", to: "#1e3a8a" },
    { id: "ember", label: "Ember", from: "#fbbf24", to: "#b91c1c" },
    { id: "mono", label: "Mono", from: "#e5e7eb", to: "#374151" },
]

const clamp01 = (v: number) => Math.min(100, Math.max(0, v))

/**
 * The CSS linear-gradient that runs from `start` to `end` on a surface: its angle, and where along
 * the gradient line (0–100 %) the start and end colours sit. Exact for a square, close for the
 * wider panels.
 */
export function gradientGeometry(start: GlassPoint, end: GlassPoint) {
    const dx = (end.x - start.x) / 100
    const dy = (end.y - start.y) / 100
    if (Math.hypot(dx, dy) < 0.02) return { angle: 150, fromPos: 0, toPos: 100 }
    const rad = Math.atan2(dx, -dy)
    const ux = Math.sin(rad), uy = -Math.cos(rad)
    const length = Math.abs(ux) + Math.abs(uy)
    const along = (p: GlassPoint) => 50 + ((clamp01(p.x) / 100 - 0.5) * ux + (clamp01(p.y) / 100 - 0.5) * uy) / length * 100
    const round = (v: number) => Math.round(v * 10) / 10
    return { angle: round(((rad * 180) / Math.PI + 360) % 360), fromPos: round(along(start)), toPos: round(along(end)) }
}

export function hexToTriplet(hex: string): string | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return null
    const n = parseInt(m[1], 16)
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export function tripletToHex(triplet: string): string | null {
    const parts = triplet.match(/\d+(\.\d+)?/g)
    if (!parts || parts.length < 3) return null
    return "#" + parts.slice(0, 3).map(p => Math.min(255, Math.round(Number(p))).toString(16).padStart(2, "0")).join("")
}

/** The colours Recommended uses right now: the wallpaper's grade, or the theme's brand colour. */
export function readRecommendedTint(): { from: string, to: string } {
    const fallback = { from: "#9f92ff", to: "#4c3fb0" }
    if (typeof document === "undefined") return fallback
    const root = document.documentElement
    const cs = getComputedStyle(root)
    const wallpaper = root.dataset.seaWallpaperTone !== undefined
    const from = tripletToHex(cs.getPropertyValue(wallpaper ? "--sea-grade-glow" : "--color-brand-400"))
    const to = tripletToHex(cs.getPropertyValue(wallpaper ? "--sea-grade-mid" : "--color-brand-800"))
    return { from: from ?? fallback.from, to: to ?? fallback.to }
}

/** Recommended colours, kept current as the wallpaper or theme changes. */
export function useRecommendedTint() {
    const [tint, setTint] = React.useState(readRecommendedTint)
    React.useEffect(() => {
        const update = () => setTint(prev => {
            const next = readRecommendedTint()
            return next.from === prev.from && next.to === prev.to ? prev : next
        })
        update()
        const observer = new MutationObserver(update)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-sea-wallpaper-tone", "class"] })
        return () => observer.disconnect()
    }, [])
    return tint
}

export function useGlassVariables() {
    const { glassTint, glassOpacity, glassBlur, glassTintMode, glassGradient } = useClientSettings()

    // The one tint gradient (globals.css, "One tint for every glass surface"). Recommended leaves the
    // colours to the CSS, which follows the wallpaper or the theme.
    const custom = glassTintMode === "custom" && glassGradient ? glassGradient : null
    const from = custom ? hexToTriplet(custom.from) : null
    const to = custom ? hexToTriplet(custom.to) : null
    const geometry = gradientGeometry(custom?.start ?? RECOMMENDED_TINT_START, custom?.end ?? RECOMMENDED_TINT_END)
    React.useEffect(() => {
        const root = document.documentElement
        const set = (name: string, value: string | null) => value === null ? root.style.removeProperty(name) : root.style.setProperty(name, value)
        set("--sea-tint-from", from)
        set("--sea-tint-to", to)
        set("--sea-tint-angle", `${geometry.angle}deg`)
        set("--sea-tint-from-pos", `${geometry.fromPos}%`)
        set("--sea-tint-to-pos", `${geometry.toPos}%`)
    }, [from, to, geometry.angle, geometry.fromPos, geometry.toPos])

    React.useEffect(() => {
        const root = document.documentElement
        const apply = (attr: string, cssVar: string, value: string | null) => {
            if (value === null) {
                delete root.dataset[attr]
                root.style.removeProperty(cssVar)
            } else {
                root.dataset[attr] = ""
                root.style.setProperty(cssVar, value)
            }
        }
        apply("seaGlassTint", "--sea-user-glass-tint", typeof glassTint === "number" ? String(clampGlassPercent(glassTint) / 100) : null)
        apply("seaGlassOpacity", "--sea-user-glass-opacity", typeof glassOpacity === "number" ? String(clampGlassPercent(glassOpacity) / 100) : null)
        apply("seaGlassBlur", "--sea-user-glass-blur", typeof glassBlur === "number" ? `${clampGlassBlur(glassBlur)}px` : null)
    }, [glassTint, glassOpacity, glassBlur])
}

/**
 * Personal -> Display -> Appearance: dark (the default), light, or switching between the two by the
 * clock. Light mode is html[data-sea-light]; the palette swap is in globals.css ("Light mode").
 */
export function useIsLightMode(): boolean {
    const { appearanceMode, lightModeStartHour, darkModeStartHour } = useClientSettings()
    const hour = useLocalHour()
    if (appearanceMode === "light") return true
    if (appearanceMode !== "schedule") return false
    return inHourWindow(hour, lightModeStartHour ?? DEFAULT_LIGHT_START_HOUR, darkModeStartHour ?? DEFAULT_DARK_START_HOUR)
}

export function useAppearanceMode() {
    const light = useIsLightMode()
    React.useEffect(() => {
        const root = document.documentElement
        if (light) {
            root.dataset.seaLight = ""
            root.style.colorScheme = "light"
        } else {
            delete root.dataset.seaLight
            root.style.colorScheme = ""
        }
    }, [light])
}
