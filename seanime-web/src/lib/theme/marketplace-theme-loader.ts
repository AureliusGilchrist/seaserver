/**
 * Lazy-loads marketplace theme metadata (milestoneNames, achievementNames, sidebarOverride labels)
 * for themes that aren't bundled in the app.
 *
 * Themes are fetched from /marketplace/themes/{id}/theme.json (served by the Go backend
 * when `marketplace.dir` is configured in the server config).
 */

import { getServerBaseUrl } from "@/api/client/server-url"

export interface MarketplaceThemeMeta {
    id: string
    displayName: string
    milestoneNames: Record<number, string>
    achievementNames: Record<string, string>
    sidebarLabels: Record<string, string>
    previewColors?: { bg: string; primary: string; secondary: string; accent: string }
    cssVars?: Record<string, string>
    fontFamily?: string
    fontHref?: string
}

// In-memory cache: themeId → MarketplaceThemeMeta | null (null = 404/unavailable)
const cache = new Map<string, MarketplaceThemeMeta | null>()
// Track in-flight fetches to prevent duplicate requests
const inflight = new Map<string, Promise<MarketplaceThemeMeta | null>>()

/**
 * Fetch and cache a marketplace theme's metadata.
 * Returns null if the theme isn't in the marketplace or the server isn't configured.
 */
export async function fetchMarketplaceThemeMeta(themeId: string): Promise<MarketplaceThemeMeta | null> {
    if (cache.has(themeId)) return cache.get(themeId) ?? null

    // Deduplicate concurrent requests for the same theme
    if (inflight.has(themeId)) return inflight.get(themeId)!

    const promise = (async () => {
        try {
            const url = `${getServerBaseUrl()}/marketplace/themes/${themeId}/theme.json`
            const res = await fetch(url, { cache: "force-cache" })
            if (!res.ok) { cache.set(themeId, null); return null }

            const raw = await res.json() as {
                id?: string
                displayName?: string
                milestoneNames?: Record<string | number, string>
                achievementNames?: Record<string, string>
                sidebarOverrides?: Record<string, { label?: string }>
                previewColors?: { bg: string; primary: string; secondary: string; accent: string }
                cssVars?: Record<string, string>
                fontFamily?: string
                fontHref?: string
            }

            // Convert milestoneNames keys from string (JSON) to number
            const milestoneNames: Record<number, string> = {}
            for (const [k, v] of Object.entries(raw.milestoneNames ?? {})) {
                milestoneNames[parseInt(k, 10)] = v
            }

            // Extract just labels from sidebarOverrides
            const sidebarLabels: Record<string, string> = {}
            for (const [k, v] of Object.entries(raw.sidebarOverrides ?? {})) {
                if (v?.label) sidebarLabels[k] = v.label
            }

            const meta: MarketplaceThemeMeta = {
                id: raw.id ?? themeId,
                displayName: raw.displayName ?? themeId,
                milestoneNames,
                achievementNames: raw.achievementNames ?? {},
                sidebarLabels,
                previewColors: raw.previewColors,
                cssVars: raw.cssVars,
                fontFamily: raw.fontFamily,
                fontHref: raw.fontHref,
            }

            cache.set(themeId, meta)
            return meta
        } catch {
            cache.set(themeId, null)
            return null
        } finally {
            inflight.delete(themeId)
        }
    })()

    inflight.set(themeId, promise)
    return promise
}

/** Synchronous cache read — only returns data if already fetched. */
export function getCachedMarketplaceThemeMeta(themeId: string): MarketplaceThemeMeta | null {
    return cache.get(themeId) ?? null
}

/** Warm the cache for a theme in the background (fire-and-forget). */
export function prefetchMarketplaceThemeMeta(themeId: string): void {
    if (!cache.has(themeId) && !inflight.has(themeId)) {
        void fetchMarketplaceThemeMeta(themeId)
    }
}
