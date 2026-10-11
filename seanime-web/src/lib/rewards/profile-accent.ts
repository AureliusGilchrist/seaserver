import { deriveBrandShades } from "@/lib/theme/anime-themes/anime-theme-provider"
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
    const color = representativeFillColor(fill)
    return color ? (deriveBrandShades(color) as React.CSSProperties) : {}
}
