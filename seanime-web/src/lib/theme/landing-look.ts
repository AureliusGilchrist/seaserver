import { getServerBaseUrl } from "@/api/client/server-url"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { usePathname } from "@/lib/navigation"
import { getAssetUrl } from "@/lib/server/assets"
import { seaJotaiStorage } from "@/lib/sea-storage/sea-storage"
import { __isMobileShell__ } from "@/types/constants"
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
    /** Where the phone's wallpaper used to live; read until the phone saves a {@link MobileLook}. */
    mobileWallpaper: string
    mobileWallpaperOpacity: number
    mobileWallpaperGlow: number
}

/**
 * Denshi Mobile's own wallpaper, per profile: shown on every page, over every other wallpaper.
 * It has its own storage key because a client saves the whole landing look at once, so a phone
 * and a desktop sharing that key would overwrite each other's settings.
 */
export type MobileLook = {
    wallpaper: string
    wallpaperOpacity: number
    wallpaperGlow: number
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
const mobileLooksAtom = atomWithStorage<Record<string, MobileLook>>("sea-anime-mobile-look", {}, seaJotaiStorage, { getOnInit: true })

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

export function useMobileLook() {
    const profile = useAtomValue(currentProfileAtom)
    const key = String(profile?.id ?? "default")
    const [looks, setLooks] = useAtom(mobileLooksAtom)
    const { look: landingLook } = useLandingLook()

    const look = React.useMemo<MobileLook>(() => looks?.[key] ?? {
        wallpaper: landingLook.mobileWallpaper,
        wallpaperOpacity: landingLook.mobileWallpaperOpacity,
        wallpaperGlow: landingLook.mobileWallpaperGlow,
    }, [looks, key, landingLook])
    const updateLook = React.useCallback((patch: Partial<MobileLook>) => {
        setLooks(prev => ({ ...prev, [key]: { ...look, ...patch } }))
    }, [key, look, setLooks])

    return { look, updateLook }
}

/** The wallpaper standing in for the app-wide one here, if any: the phone's own, then the landing page's. */
export function useWallpaperOverride() {
    const { look } = useLandingLook()
    const { look: mobileLook } = useMobileLook()
    const pathname = usePathname()
    if (__isMobileShell__ && mobileLook.wallpaper) {
        return { image: mobileLook.wallpaper, opacity: mobileLook.wallpaperOpacity, glow: mobileLook.wallpaperGlow }
    }
    if (pathname === LANDING_PATH && look.wallpaper) {
        return { image: look.wallpaper, opacity: look.wallpaperOpacity, glow: look.wallpaperGlow }
    }
    return null
}
