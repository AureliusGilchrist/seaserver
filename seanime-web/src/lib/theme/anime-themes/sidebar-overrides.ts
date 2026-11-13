import type { SidebarItemOverride } from "./types"

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
