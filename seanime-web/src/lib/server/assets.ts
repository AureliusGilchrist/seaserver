import { getServerBaseUrl } from "@/api/client/server-url"
import { __isMobileShell__ } from "@/types/constants"

/**
 * Server-relative theme/wallpaper paths ("/themes/…", "/theme-bg/…",
 * "/api/…") made absolute for the Android client.
 *
 * The Android app serves its pages from http://localhost, so a relative path resolves to the app
 * itself — and its bundle leaves the 350 MB of theme images out. Themes had no wallpaper there, and
 * with no wallpaper there was nothing to take the accent color from. Everywhere else the page is
 * served alongside these paths, so they're returned unchanged.
 */
export function resolveServerAsset(url: string): string
export function resolveServerAsset(url: string | null | undefined): string | null | undefined
export function resolveServerAsset(url: string | null | undefined): string | null | undefined {
    if (!url || !__isMobileShell__) return url
    if (/^\/(themes|theme-bg|shared-themes|cursor-packs|sound-packs|cursor-library|marketplace[a-z-]*|api|assets)\//.test(url)) {
        return `${getServerBaseUrl()}${url}`
    }
    return url
}

// Must match cacheableImageHosts in internal/util/proxies/image_cache.go: the server refuses others.
const CACHEABLE_IMAGE_HOST = /^https?:\/\/(?:[^/]+\.)?(?:anilist\.co|kitsu\.io|kitsu\.app|thetvdb\.com|tmdb\.org|myanimelist\.net|mangadex\.org|compsci88\.com)(?::\d+)?\//i

/**
 * Artwork from the internet, sent through the server's cache: it loads faster the second time, and
 * still loads with no internet. Anything else comes back unchanged.
 */
export function cachedImageUrl(url: string): string
export function cachedImageUrl(url: string | null | undefined): string | null | undefined
export function cachedImageUrl(url: string | null | undefined): string | null | undefined {
    if (!url || !CACHEABLE_IMAGE_HOST.test(url)) return url
    return `${getServerBaseUrl()}/api/v1/image-cache?url=${encodeURIComponent(url)}`
}

export function getImageUrl(path: string) {
    if (path.startsWith("{{LOCAL_ASSETS}}")) {
        return `${getServerBaseUrl()}/${path.replace("{{LOCAL_ASSETS}}", "offline-assets")}`
    }

    return cachedImageUrl(path)
}

export function getAssetUrl(path: string) {
    let p = path.replaceAll("\\", "/")

    if (p.startsWith("/")) {
        p = p.substring(1)
    }

    p = encodeURIComponent(p).replace(/\(/g, "%28").replace(/\)/g, "%29")

    if (p.startsWith("{{LOCAL_ASSETS}}")) {
        return `${getServerBaseUrl()}/${p.replace("{{LOCAL_ASSETS}}", "offline-assets")}`
    }

    return `${getServerBaseUrl()}/assets/${p}`
}

export function legacy_getAssetUrl(path: string) {
    let p = path.replaceAll("\\", "/")

    if (p.startsWith("/")) {
        p = p.substring(1)
    }

    p = encodeURIComponent(p).replace(/\(/g, "%28").replace(/\)/g, "%29")

    return `${getServerBaseUrl()}/assets/${p}`
}
