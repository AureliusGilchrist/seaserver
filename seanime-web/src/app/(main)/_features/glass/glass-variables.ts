"use client"
import { useClientSettings } from "@/lib/client-settings"
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

export function useGlassVariables() {
    const { glassTint, glassOpacity, glassBlur } = useClientSettings()

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
