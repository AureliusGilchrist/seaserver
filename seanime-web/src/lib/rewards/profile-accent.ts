import { colord } from "colord"
import type * as React from "react"

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
    for (const [step, l] of Object.entries(ramp)) {
        const c = step === "500" ? base : colord({ h, s, l })
        const { r, g, b } = c.toRgb()
        vars[`--color-brand-${step}`] = `${r} ${g} ${b}`
    }
    vars["--brand"] = vars["--color-brand-500"]!
    return vars as React.CSSProperties
}
