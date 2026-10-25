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
    description?: string
    author?: string
    milestoneNames: Record<number, string>
    milestoneCategoryNames: Record<string, string>
    achievementNames: Record<string, string>
    sidebarOverrides: Record<string, { icon?: string; label?: string }>
    playerIconOverrides: Record<string, string>
    previewColors?: { bg: string; primary: string; secondary: string; accent: string }
    backgroundImageUrl?: string
    /** Portrait wallpaper for phones. */
    mobileBackgroundImageUrl?: string
    cssVars?: Record<string, string>
    fontFamily?: string
    fontHref?: string
}

export interface SharedThemeInfo {
    id: string
    displayName: string
    url: string
    previewColors?: { bg: string; primary: string; secondary: string; accent: string }
    backgroundImageUrl?: string
    description?: string
    author?: string
}

// In-memory cache: themeId → MarketplaceThemeMeta | null (null = 404/unavailable)
const cache = new Map<string, MarketplaceThemeMeta | null>()
// Track in-flight fetches to prevent duplicate requests
const inflight = new Map<string, Promise<MarketplaceThemeMeta | null>>()
// Cache for shared themes list
let sharedThemesCache: SharedThemeInfo[] | null = null
let sharedThemesInflight: Promise<SharedThemeInfo[]> | null = null

/**
 * Fetch and cache a marketplace theme's metadata.
 * Returns null if the theme isn't in the marketplace or the server isn't configured.
 */
export async function fetchMarketplaceThemeMeta(themeId: string, opts?: { marketplaceFirst?: boolean }): Promise<MarketplaceThemeMeta | null> {
    themeId = themeId.trim()
    if (cache.has(themeId)) return cache.get(themeId) ?? null

    // Deduplicate concurrent requests for the same theme
    if (inflight.has(themeId)) return inflight.get(themeId)!

    const promise = (async () => {
        try {
            // Themes installed from the marketplace are copied to the shared themes directory, which
            // is always served; the marketplace directory only exists when `marketplace.dir` is
            // configured. Without this fallback an installed theme resolved to nothing and the app
            // quietly stayed on Deus Ex Aeternae.
            const base = getServerBaseUrl()
            const id = encodeURIComponent(themeId)
            const urls = [`${base}/shared-themes/${id}/theme.json`, `${base}/marketplace/themes/${id}/theme.json`]
            if (opts?.marketplaceFirst) urls.reverse()
            let res: Response | null = null
            for (const u of urls) {
                res = await fetch(u, { cache: "no-cache" }).catch(() => null)
                if (res?.ok) break
            }
            if (!res || !res.ok) { return null }

            const raw = await res.json() as {
                id?: string
                displayName?: string
                description?: string
                author?: string
                milestoneNames?: Record<string | number, string>
                milestoneCategoryNames?: Record<string, string>
                achievementNames?: Record<string, string>
                sidebarOverrides?: Record<string, { icon?: string; label?: string }>
                playerIconOverrides?: Record<string, string>
                previewColors?: { bg: string; primary: string; secondary: string; accent: string }
                backgroundImageUrl?: string
                cssVars?: Record<string, string>
                fontFamily?: string
                fontHref?: string
            }

            // Convert milestoneNames keys from string (JSON) to number
            const milestoneNames: Record<number, string> = {}
            for (const [k, v] of Object.entries(raw.milestoneNames ?? {})) {
                milestoneNames[parseInt(k, 10)] = v
            }

            const meta: MarketplaceThemeMeta = {
                id: raw.id ?? themeId,
                displayName: raw.displayName ?? themeId,
                description: raw.description,
                author: raw.author,
                milestoneNames,
                milestoneCategoryNames: raw.milestoneCategoryNames ?? {},
                achievementNames: raw.achievementNames ?? {},
                sidebarOverrides: raw.sidebarOverrides ?? {},
                playerIconOverrides: raw.playerIconOverrides ?? {},
                previewColors: raw.previewColors,
                backgroundImageUrl: raw.backgroundImageUrl,
                cssVars: raw.cssVars,
                fontFamily: raw.fontFamily,
                fontHref: raw.fontHref,
            }

            cache.set(themeId, meta)
            return meta
        } catch {
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
    return cache.get(themeId.trim()) ?? null
}

/** Warm the cache for a theme in the background (fire-and-forget). */
export function prefetchMarketplaceThemeMeta(themeId: string): void {
    themeId = themeId.trim()
    if (!cache.has(themeId) && !inflight.has(themeId)) {
        void fetchMarketplaceThemeMeta(themeId)
    }
}

/**
 * Fetch the list of shared downloaded themes.
 * These themes are available to all profiles.
 */
export async function fetchSharedThemesList(): Promise<SharedThemeInfo[]> {
    if (sharedThemesCache !== null) return sharedThemesCache
    if (sharedThemesInflight !== null) return sharedThemesInflight

    const promise = (async () => {
        try {
            const url = `${getServerBaseUrl()}/api/v1/shared-themes`
            const res = await fetch(url, { cache: "force-cache" })
            if (!res.ok) { sharedThemesCache = []; return [] }
            const json = await res.json() as any
            const unwrapped = json?.data ?? json
            const themes = Array.isArray(unwrapped) ? unwrapped as SharedThemeInfo[] : []
            sharedThemesCache = themes
            return themes
        } catch {
            sharedThemesCache = []
            return []
        } finally {
            sharedThemesInflight = null
        }
    })()

    sharedThemesInflight = promise
    return promise
}

/** Clear the shared themes cache (call after downloading or deleting a theme). */
export function clearSharedThemesCache(): void {
    sharedThemesCache = null
}

/**
 * Download a theme from the marketplace to the shared themes directory.
 * Returns the downloaded theme info on success.
 */
export async function downloadSharedTheme(themeId: string): Promise<SharedThemeInfo | null> {
    try {
        const url = `${getServerBaseUrl()}/api/v1/shared-themes/download`
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ themeId }),
        })
        if (!res.ok) return null
        const json = await res.json() as any
        const raw = json?.data ?? json
        const meta = cache.get(themeId) ?? null
        const result: SharedThemeInfo = {
            id: raw.id ?? themeId,
            displayName: raw.displayName ?? meta?.displayName ?? themeId,
            url: raw.url ?? "",
            previewColors: raw.previewColors ?? meta?.previewColors,
            backgroundImageUrl: raw.backgroundImageUrl ?? meta?.backgroundImageUrl,
            description: raw.description ?? meta?.description,
        }
        clearSharedThemesCache() // Clear cache so list refreshes
        return result
    } catch {
        return null
    }
}

/**
 * Delete a shared theme from the shared themes directory.
 */
export async function deleteSharedTheme(themeId: string): Promise<boolean> {
    try {
        const url = `${getServerBaseUrl()}/api/v1/shared-themes/${encodeURIComponent(themeId)}`
        const res = await fetch(url, { method: "DELETE" })
        if (res.ok) {
            clearSharedThemesCache() // Clear cache so list refreshes
            return true
        }
        return false
    } catch {
        return false
    }
}
