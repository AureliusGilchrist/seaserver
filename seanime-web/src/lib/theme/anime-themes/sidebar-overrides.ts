import type React from "react"
import {
    LuAnchor, LuCrown, LuDiamond, LuFeather, LuFlame, LuGem, LuHeart, LuHexagon, LuKey, LuLeaf, LuLightbulb, LuMoon,
    LuMountain, LuMusic, LuOrbit, LuPuzzle, LuRocket, LuShapes, LuSnowflake, LuSparkles, LuSprout, LuStar, LuSun,
    LuTarget, LuTreePine, LuWand, LuWaves, LuZap,
} from "react-icons/lu"
import type { SidebarItemOverride } from "./types"

/**
 * Sidebar entries whose icon is live state (Online / Offline), so a repeat elsewhere gives way to
 * them rather than the other way round.
 */
export const LOCKED_ICON_SIDEBAR_IDS: ReadonlySet<string> = new Set(["sync"])

/**
 * Stand-ins for an entry whose icon is already on the sidebar. None of these is a default sidebar
 * icon; any a theme has put on the sidebar are skipped too.
 */
export const SIDEBAR_FALLBACK_ICONS: readonly React.ElementType[] = [
    LuSparkles, LuStar, LuGem, LuZap, LuFeather, LuLeaf, LuMoon, LuSun, LuFlame, LuRocket, LuMusic, LuHeart, LuCrown,
    LuSnowflake, LuMountain, LuWaves, LuTreePine, LuOrbit, LuHexagon, LuDiamond, LuAnchor, LuKey, LuLightbulb,
    LuPuzzle, LuShapes, LuSprout, LuTarget, LuWand,
]

/**
 * Claim icons for a run of sidebar entries, in the order they are drawn: the first entry to show an
 * icon keeps it, and any later entry with the same icon gets the next unused fallback. `used` is
 * shared across every list on the sidebar and grows as icons are claimed. Entries in
 * LOCKED_ICON_SIDEBAR_IDS keep their icon whatever came before (seed `used` with their icons up
 * front so earlier entries give way to them).
 */
export function dedupeSidebarIcons<T extends { id?: string, iconType?: unknown }>(items: readonly T[], used: Set<unknown>): T[] {
    return items.map(item => {
        const icon = item.iconType
        if (!icon) return item
        if (item.id && LOCKED_ICON_SIDEBAR_IDS.has(item.id)) {
            used.add(icon)
            return item
        }
        if (!used.has(icon)) {
            used.add(icon)
            return item
        }
        const fallback = SIDEBAR_FALLBACK_ICONS.find(f => !used.has(f))
        if (!fallback) return item
        used.add(fallback)
        return { ...item, iconType: fallback }
    })
}

/**
 * Sidebar entries whose label carries live state, so a theme may restyle their icon but never
 * rename them: "home" is the Anime ↔ Manga switch (its label names the library it goes to),
 * "sync" shows Online / Offline, "torrent-list" shows active torrent counts and
 * "refresh-anilist" shows when a refresh is running.
 */
export const LIVE_LABEL_SIDEBAR_IDS: ReadonlySet<string> = new Set(["home", "sync", "torrent-list", "refresh-anilist"])

/** Apply a theme's sidebar override (icon + label) to one menu item. */
export function applySidebarOverride<T extends { id?: string, iconType?: unknown, name?: unknown }>(
    item: T,
    overrides: Record<string, SidebarItemOverride> | undefined,
): T {
    const ov = item.id ? overrides?.[item.id] : undefined
    if (!ov) return item
    const keepLabel = LIVE_LABEL_SIDEBAR_IDS.has(item.id!)
    return {
        ...item,
        iconType: ov.icon ?? item.iconType,
        name: (!keepLabel && ov.label) ? ov.label : item.name,
    }
}
