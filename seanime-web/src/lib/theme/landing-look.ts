import { getServerBaseUrl } from "@/api/client/server-url"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { getAssetUrl } from "@/lib/server/assets"
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
}

export const DEFAULT_LANDING_LOOK: LandingLook = {
    wallpaper: "",
    wallpaperOpacity: 100,
    wallpaperGlow: 0,
    banner: "",
    bannerPosition: "50% 50%",
    bannerOpacity: 100,
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
