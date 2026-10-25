import { getServerBaseUrl } from "@/api/client/server-url"
import { __isMobileShell__ } from "@/types/constants"

/**
 * Server-relative theme/wallpaper/music paths ("/themes/…", "/theme-bg/…", "/theme-music/…",
 * "/api/…") made absolute for the Android client.
 *
 * The Android app serves its pages from https://localhost, so a relative path resolves to the app
 * itself — and its bundle leaves the 350 MB of theme images out. Themes had no wallpaper there, and
 * with no wallpaper there was nothing to take the accent color from. Everywhere else the page is
 * served alongside these paths, so they're returned unchanged.
 */
export function resolveServerAsset(url: string): string
export function resolveServerAsset(url: string | null | undefined): string | null | undefined
export function resolveServerAsset(url: string | null | undefined): string | null | undefined {
    if (!url || !__isMobileShell__) return url
    if (/^\/(themes|theme-bg|theme-music|shared-themes|cursor-packs|sound-packs|cursor-library|marketplace[a-z-]*|api|assets)\//.test(url)) {
        return `${getServerBaseUrl()}${url}`
    }
    return url
}

export function getImageUrl(path: string) {
    if (path.startsWith("{{LOCAL_ASSETS}}")) {
        return `${getServerBaseUrl()}/${path.replace("{{LOCAL_ASSETS}}", "offline-assets")}`
    }

    return path
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
