"use client"

import { cn } from "@/components/ui/core/styling"
import * as React from "react"

/**
 * XPBarFill renders an XP progress fill that:
 *   1. Always shows a clearly-visible BASE colour at the user's actual XP width
 *      (so the user can see exactly where their progress is at, even with
 *      moving / shimmer animations enabled).
 *   2. Overlays a moving SHEEN gradient (with the existing animation class)
 *      on top of that base, at reduced opacity, preserving the "general effect"
 *      of moving / shimmering / aurora / lightning bars.
 *
 * Without this two-layer approach, moving-gradient skins use a 300% wide
 * background that slides through — at low XP percentages, only a small slice
 * of the gradient is visible, often cycling through near-transparent or dark
 * colour stops, which hides the user's actual progress.
 *
 * Layered structure:
 *   <track (rounded, overflow-hidden)>
 *     <fill width=xp%>
 *       <baseLayer (solid/derived gradient at full opacity)/>
 *       <sheenLayer (moving gradient, animClass, ~55% opacity)/>
 *     </fill>
 *   </track>
 */
export type XPBarFillProps = {
    /** 0-100 progress percentage. */
    percent: number
    /** Optional CSS background for the moving sheen (linear-gradient or colour). */
    fillCss?: string | null
    /** Optional animation class name (e.g. "sea-xpbar-shimmer"). */
    animClass?: string | null
    /** Optional CSS background for the track (the empty groove). */
    trackCss?: string | null
    /** Optional fallback colour when fillCss is empty (e.g. tier ring colour). */
    fallbackBgClass?: string
    /** Bar height (e.g. "h-2", "h-1.5"). */
    heightClass?: string
    /** Extra class names on the outer track. */
    className?: string
}

/**
 * Extract a representative solid colour from a fillCss value to use as the
 * base layer. For linear-gradient strings, picks the BRIGHTEST-looking colour
 * stop (highest sum of channels) so the base layer reads as "filled". Falls
 * back to the raw value when it's already a solid colour.
 */
function deriveBaseColor(fillCss?: string | null): string | null {
    if (!fillCss) return null
    const trimmed = fillCss.trim()
    if (!trimmed.startsWith("linear-gradient") && !trimmed.startsWith("radial-gradient")) {
        return trimmed
    }
    // Match #hex, rgba(), rgb(), hsl(), hsla()
    const matches = trimmed.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)/g)
    if (!matches || matches.length === 0) return null
    // Prefer a mid-bright stop (skip extremes that may be the dark "edges" of a moving cycle)
    let best = matches[0]!
    let bestScore = -1
    for (const c of matches) {
        const score = colorBrightness(c)
        // Prefer brighter colours — they read as "filled".
        if (score > bestScore) {
            bestScore = score
            best = c
        }
    }
    return best
}

function colorBrightness(c: string): number {
    if (c.startsWith("#")) {
        let hex = c.slice(1)
        if (hex.length === 3) hex = hex.split("").map(ch => ch + ch).join("")
        if (hex.length === 4) hex = hex.slice(0, 3).split("").map(ch => ch + ch).join("")
        if (hex.length === 8) hex = hex.slice(0, 6)
        const r = parseInt(hex.slice(0, 2), 16) || 0
        const g = parseInt(hex.slice(2, 4), 16) || 0
        const b = parseInt(hex.slice(4, 6), 16) || 0
        return r + g + b
    }
    const m = c.match(/(\d+(?:\.\d+)?)/g)
    if (!m || m.length < 3) return 0
    return (parseFloat(m[0]!) || 0) + (parseFloat(m[1]!) || 0) + (parseFloat(m[2]!) || 0)
}

export function XPBarFill({
    percent,
    fillCss,
    animClass,
    trackCss,
    fallbackBgClass,
    heightClass = "h-2",
    className,
}: XPBarFillProps) {
    const clamped = Math.max(0, Math.min(100, percent))
    const baseColor = React.useMemo(() => deriveBaseColor(fillCss), [fillCss])
    const hasAnim = !!animClass

    // When the bar is animated ("Moving"), tint the empty track with the
    // same fill colour at low opacity so it looks like waves of colour are
    // continuously flowing through the whole bar (rather than a discrete
    // overlay bar sliding inside the track).
    const trackBackground = trackCss
        ?? (hasAnim && baseColor
            ? `color-mix(in srgb, ${baseColor} 22%, rgba(255,255,255,0.08))`
            : "rgba(255,255,255,0.1)")

    return (
        <div
            className={cn("rounded-full overflow-hidden relative", heightClass, className)}
            style={{ background: trackBackground }}
        >
            <div
                className={cn(
                    "h-full rounded-full relative overflow-hidden",
                    // Only animate width when there's no moving fill animation,
                    // so width changes don't fight the keyframe animation.
                    hasAnim ? "" : "transition-[width] duration-500",
                    !fillCss && fallbackBgClass,
                    // For animated variants, put the animation class directly on
                    // the fill so the gradient flows through the actual progress.
                    hasAnim && animClass,
                )}
                style={{
                    width: `${clamped}%`,
                    // When animated, the fill IS the gradient (flowing via
                    // background-position keyframes). When not, use derived base.
                    background: hasAnim ? (fillCss ?? undefined) : (baseColor ?? undefined),
                    backgroundSize: hasAnim ? "200% 100%" : undefined,
                }}
            />
        </div>
    )
}
