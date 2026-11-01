import { getServerBaseUrl } from "@/api/client/server-url"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { usePathname } from "@/lib/navigation"
import { getAssetUrl } from "@/lib/server/assets"
import { isMobile } from "@/lib/utils/browser-detection"
import { seaJotaiStorage } from "@/lib/sea-storage/sea-storage"
import { useAtom, useAtomValue } from "jotai"
import { atomWithStorage } from "jotai/utils"
import React from "react"

/**
 * The landing page's own wallpaper and banner, per profile. Either one left empty falls back to the
 * app-wide image, and everything that draws them treats them exactly like that image.
 */
export type LandingLook = {
    wallpaper: string
    wallpaperOpacity: number
    wallpaperGlow: number
    banner: string
    bannerPosition: string
    bannerOpacity: number
    /** Shown on phones only, on every page, over every other wallpaper. */
    mobileWallpaper: string
    mobileWallpaperOpacity: number
    mobileWallpaperGlow: number
}

export const DEFAULT_LANDING_LOOK: LandingLook = {
    wallpaper: "",
    wallpaperOpacity: 100,
    wallpaperGlow: 0,
    banner: "",
    bannerPosition: "50% 50%",
    bannerOpacity: 100,
    mobileWallpaper: "",
    mobileWallpaperOpacity: 100,
    mobileWallpaperGlow: 0,
}

const landingLooksAtom = atomWithStorage<Record<string, LandingLook>>("sea-landing-look", {}, seaJotaiStorage, { getOnInit: true })

export const LANDING_PATH = "/"

/** An uploaded image is a server path; anything else is an image in the assets folder, as in settings. */
export function resolveLandingImage(path: string) {
    if (/^https?:\/\//.test(path)) return path
    return path.startsWith("/api/") ? `${getServerBaseUrl()}${path}` : getAssetUrl(path)
}

export function useLandingLook() {
    const profile = useAtomValue(currentProfileAtom)
    const key = String(profile?.id ?? "default")
    const [looks, setLooks] = useAtom(landingLooksAtom)

    const look = React.useMemo(() => ({ ...DEFAULT_LANDING_LOOK, ...looks?.[key] }), [looks, key])
    const updateLook = React.useCallback((patch: Partial<LandingLook>) => {
        setLooks(prev => ({ ...prev, [key]: { ...DEFAULT_LANDING_LOOK, ...prev?.[key], ...patch } }))
    }, [key, setLooks])

    return { look, updateLook }
}

export function useIsPhone() {
    return React.useMemo(() => typeof window !== "undefined" && isMobile(), [])
}

/** The wallpaper standing in for the app-wide one here, if any: the phone's own, then the landing page's. */
export function useWallpaperOverride() {
    const { look } = useLandingLook()
    const pathname = usePathname()
    const isPhone = useIsPhone()
    if (isPhone && look.mobileWallpaper) {
        return { image: look.mobileWallpaper, opacity: look.mobileWallpaperOpacity, glow: look.mobileWallpaperGlow }
    }
    if (pathname === LANDING_PATH && look.wallpaper) {
        return { image: look.wallpaper, opacity: look.wallpaperOpacity, glow: look.wallpaperGlow }
    }
    return null
}
