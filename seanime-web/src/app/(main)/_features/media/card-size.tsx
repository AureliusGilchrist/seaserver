"use client"
import { CARD_WIDTH_DEFAULT, clampCardWidth, usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { setClientSettings, useClientSettings } from "@/lib/client-settings"
import React from "react"

/**
 * Card sizes are two CSS variables on :root, `--sea-card-w-anime` and `--sea-card-w-manga`, set
 * from the profile's Personal settings. Every card, carousel slot and card grid reads them through
 * the `.sea-card-*` utilities in globals.css, so one setting sizes the card everywhere it appears.
 * The variables are registered with @property and transition on :root, so a change animates every
 * card on screen at once instead of snapping.
 */
export function useCardSizeVariables() {
    const { animeCardWidth, mangaCardWidth } = usePersonalSettings()

    React.useEffect(() => {
        const root = document.documentElement
        root.style.setProperty("--sea-card-w-anime", `${animeCardWidth}px`)
        root.style.setProperty("--sea-card-w-manga", `${mangaCardWidth}px`)
    }, [animeCardWidth, mangaCardWidth])

    useMigrateLegacyCardSizes()
}

/** The old browser-only size multipliers (1 = default), carried into the synced settings once. */
function useMigrateLegacyCardSizes() {
    const clientSettings = useClientSettings()
    React.useEffect(() => {
        try {
            const read = (key: string) => {
                const raw = localStorage.getItem(key)
                if (raw === null) return undefined
                const n = Number(JSON.parse(raw))
                return Number.isFinite(n) && n !== 1 ? clampCardWidth(n * CARD_WIDTH_DEFAULT) : undefined
            }
            const anime = clientSettings.animeCardWidth === undefined ? read("sea-anime-card-size") : undefined
            const manga = clientSettings.mangaCardWidth === undefined ? read("sea-manga-card-size") : undefined
            localStorage.removeItem("sea-anime-card-size")
            localStorage.removeItem("sea-manga-card-size")
            if (anime === undefined && manga === undefined) return
            setClientSettings(prev => ({
                ...prev,
                ...(anime !== undefined && { animeCardWidth: anime }),
                ...(manga !== undefined && { mangaCardWidth: manga }),
            }))
        }
        catch {
        }
        // Once per mount: the keys are removed after the first run.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
}

/** The class that makes an element (and its children) read a media type's card width. */
export function cardTypeClass(type: "anime" | "manga" | undefined | null) {
    return type === "manga" ? "sea-card-manga" : "sea-card-anime"
}
