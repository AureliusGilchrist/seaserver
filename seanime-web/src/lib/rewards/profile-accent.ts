import { colord } from "colord"
import * as React from "react"

const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g

/**
 * The one color that stands for an XP bar fill. A gradient has no single color, so the most vivid
 * stop wins: saturated and mid-light, never the near-black or near-white ends a skin fades through.
 */
export function representativeFillColor(fill: string | null | undefined): string | null {
    if (!fill) return null
    let best: string | null = null
    let bestScore = -1
    for (const token of fill.match(COLOR_TOKEN) ?? [fill.trim()]) {
        const color = colord(token)
        if (!color.isValid()) continue
        const { s, l } = color.toHsl()
        const score = s * (1 - Math.abs(l - 55) / 55)
        if (score > bestScore) {
            bestScore = score
            best = color.alpha(1).toHex()
        }
    }
    return best
}

/** Scoped `--color-brand-*` variables, in the `r g b` form Tailwind reads them in. */
export function profileAccentStyle(fill: string | null | undefined): React.CSSProperties {
    const hex = representativeFillColor(fill)
    if (!hex) return {}
    const base = colord(hex)
    const { h, s } = base.toHsl()
    const ramp: Record<string, number> = { "200": 88, "300": 75, "400": 65, "500": 52, "600": 45, "700": 35, "800": 27, "900": 20, "950": 12 }
    const vars: Record<string, string> = {}
    const rgbOf: Record<string, string> = {}
    for (const [step, l] of Object.entries(ramp)) {
        const c = step === "500" ? base : colord({ h, s, l })
        const { r, g, b } = c.toRgb()
        vars[`--color-brand-${step}`] = `${r} ${g} ${b}`
        rgbOf[step] = `${r} ${g} ${b}`
    }
    // These are resolved where they are declared (the app root), so a scoped ramp alone leaves them
    // on the wallpaper's color. They are restated here from the new ramp.
    vars["--brand"] = `rgb(${rgbOf["500"]})`
    vars["--ring"] = `rgb(${rgbOf["500"]})`
    vars["--accent-1"] = `rgb(${rgbOf["200"]} / 0.82)`
    vars["--accent-2"] = `rgb(${rgbOf["400"]} / 0.78)`
    vars["--accent-3"] = `rgb(${rgbOf["500"]} / 0.75)`
    vars["--accent-4"] = `rgb(${rgbOf["300"]} / 0.7)`
    vars["--halo-1"] = `radial-gradient(60% 60% at 20% 18%, rgb(${rgbOf["400"]} / 0.24), transparent 60%)`
    return vars as React.CSSProperties
}

/**
 * Puts a profile's palette on the app root for as long as the profile is open, so the chrome around
 * it (sidebar, glows, page background) matches the page instead of staying the wallpaper's color.
 * The previous values are put back on leaving.
 */
export function useProfileAccentOnRoot(fill: string | null | undefined) {
    const vars = React.useMemo(() => profileAccentStyle(fill) as Record<string, string>, [fill])
    React.useEffect(() => {
        const entries = Object.entries(vars)
        if (!entries.length) return
        const root = document.documentElement
        const previous = entries.map(([k]) => [k, root.style.getPropertyValue(k)] as const)
        entries.forEach(([k, v]) => root.style.setProperty(k, v))
        return () => {
            previous.forEach(([k, v]) => (v ? root.style.setProperty(k, v) : root.style.removeProperty(k)))
        }
    }, [vars])
}
