"use client"
import * as React from "react"
import { XP_BAR_SKIN_REWARDS, type XPBarSkinReward } from "@/lib/rewards/reward-definitions"

/**
 * Random-but-stable visual effects layered on top of "effects" tier XP bar skins.
 * Each effects-category skin id deterministically maps to one of these classes so
 * a given skin always shows the same flavor of effect.
 */
const RANDOM_FX_CLASSES = [
    "sea-xpbar-fx-cracks",
    "sea-xpbar-fx-shattered",
    "sea-xpbar-fx-glass-shimmer",
    "sea-xpbar-fx-energy-edges",
    "sea-xpbar-fx-scanlines",
    "sea-xpbar-fx-sparks",
    "sea-xpbar-fx-prism",
] as const

export function getXPBarFxClass(id: string): string {
    let h = 0
    for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) | 0
    return RANDOM_FX_CLASSES[Math.abs(h) % RANDOM_FX_CLASSES.length]
}

function resolveSkin(args: { skin?: XPBarSkinReward | null; skinId?: string; fillCss?: string }): XPBarSkinReward | null {
    if (args.skin) return args.skin
    if (args.skinId) return XP_BAR_SKIN_REWARDS.find(r => r.id === args.skinId) ?? null
    if (args.fillCss) {
        // Fallback: match by exact fillCss against effects-category skins only.
        // (Effects skins have unique fillCss values, so this is safe.)
        return XP_BAR_SKIN_REWARDS.find(r => r.category === "effects" && r.fillCss === args.fillCss) ?? null
    }
    return null
}

/**
 * Overlay that adds shining corners/edges (using the bar's own gradient) plus a
 * unique random effect (cracks, shattered glass, sparks, etc.) — but ONLY for
 * skins in the "effects" category. Renders nothing for any other category.
 *
 * Must be rendered inside a positioned (relative) container with overflow:hidden.
 */
export function XPBarFxOverlay(props: { skin?: XPBarSkinReward | null; skinId?: string; fillCss?: string }) {
    const skin = resolveSkin(props)
    if (!skin || skin.category !== "effects") return null
    const fxClass = getXPBarFxClass(skin.id)
    return (
        <div className="sea-xpbar-fx-wrap" aria-hidden>
            <div className="sea-xpbar-fx-corner-shine" style={{ background: skin.fillCss }} />
            <div className="sea-xpbar-fx-rune-glow" style={{ background: skin.fillCss }} />
            <div className={fxClass} />
        </div>
    )
}
