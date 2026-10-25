import type React from "react"
import type { BackgroundReward, BorderReward } from "./reward-definitions"

/**
 * How a profile's equipped Reward Shop cosmetics are drawn, shared by your own profile page and the
 * page other people see, so both render the same thing from the same ids.
 */

const DEFAULT_NAME_COLOR = "#ffffff"

function textFill(fill: string): React.CSSProperties {
    return fill.includes("gradient")
        ? { backgroundImage: fill, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
        : { color: fill }
}

/**
 * The name's color. An equipped name color wins; without one the name follows the XP bar fill.
 * (It used to be the other way round, and since every skin has a fill, an equipped name color was
 * never visible anywhere.)
 */
export function profileNameStyle(opts: {
    nameColor?: string | null
    nameGradient?: string | null
    xpBarFill?: string | null
}): React.CSSProperties {
    if (opts.nameGradient) return textFill(opts.nameGradient)
    if (opts.nameColor && opts.nameColor.toLowerCase() !== DEFAULT_NAME_COLOR) return textFill(opts.nameColor)
    if (opts.xpBarFill) return textFill(opts.xpBarFill)
    return {}
}

/** Ring around the avatar for an equipped border. */
export function profileAvatarBorderStyle(border: BorderReward | null | undefined): React.CSSProperties {
    if (!border || border.borderCss === "none") return {}
    return { outline: border.borderCss, outlineOffset: "3px", boxShadow: border.glowCss ?? "none" }
}

/** Backdrop behind the profile header for an equipped background. */
export function profileHeaderBackgroundStyle(bg: BackgroundReward | null | undefined): React.CSSProperties {
    if (!bg || !bg.backgroundCss || bg.backgroundCss === "transparent") return {}
    return { background: bg.backgroundCss }
}
