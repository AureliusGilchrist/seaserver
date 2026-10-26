/**
 * clientSettings — per-profile app preferences.
 *
 * Sits on top of seaStorage: reads/writes the `sea-client-settings` localStorage key, which is
 * mirrored to the server under the current profile's client prefs. That gives each profile its
 * own copy of these settings — changing them never affects other profiles — while the server
 * copy makes them survive reinstalls and follow the profile to other devices.
 *
 * A key left undefined means "inherit the server-wide value" (the admin-set default), so the
 * effective value is client override ?? server value ?? built-in default. `usePersonalSettings`
 * implements that merge; the settings page writes explicit overrides.
 */

import { seaStorage } from "@/lib/sea-storage/sea-storage"
import { z } from "zod"
import React from "react"

export const CLIENT_SETTINGS_KEY = "sea-client-settings"

export const clientSettingsSchema = z.object({
    // Playback & progress
    autoUpdateProgress: z.boolean().optional(),
    enableWatchContinuity: z.boolean().optional(),
    autoPlayNextEpisode: z.boolean().optional(),
    stillWatchingChecksEnabled: z.boolean().optional(),
    stillWatchingEpisodes: z.number().optional(),
    // Hours of day (0–23) the still-watching check applies in; the window may cross midnight.
    stillWatchingStartHour: z.number().optional(),
    stillWatchingEndHour: z.number().optional(),
    // When the check applies: "night" (default 7 pm–10 am window), "always", or "custom" hours.
    stillWatchingTimingMode: z.enum(["night", "always", "custom"]).optional(),
    /** A pause or gap longer than this (minutes) starts a fresh viewing session: the episode count restarts. */
    stillWatchingSessionGapMinutes: z.number().optional(),
    // Mouse movement during playback counts as "someone's here" and postpones the check.
    stillWatchingMouseExtends: z.boolean().optional(),
    /** How much movement (in screen widths travelled) earns one extra episode. */
    stillWatchingMouseAmount: z.number().optional(),
    /** The most extra episodes movement can add before the question is asked anyway. */
    stillWatchingMouseMaxExtra: z.number().optional(),
    // News
    /** How many entries the full News page shows (the widget's "Show more" tab). */
    newsFeedShowMoreCount: z.number().optional(),
    /** Whether a new RSS entry raises a live notification + drawer entry for this profile. */
    newsNotifyNewEntries: z.boolean().optional(),
    /** Which new entries notify: every one, ones naming a Planning/Completed title, or keyword matches. */
    newsNotifyMode: z.enum(["all", "lists", "keywords"]).optional(),
    /** Comma-separated keywords for "keywords" mode; empty uses the built-in list. */
    newsNotifyKeywords: z.string().optional(),
    // Display
    hideAudienceScore: z.boolean().optional(),
    blurAdultContent: z.boolean().optional(),
    disableAnimeCardTrailers: z.boolean().optional(),
    // Manga
    mangaAutoUpdateProgress: z.boolean().optional(),
    // AniList
    autoPauseStaleWatchingDays: z.number().optional(),
    // Desktop player (MPV/IINA auto-skip)
    mpvAutoSkipOpening: z.boolean().optional(),
    mpvAutoSkipEnding: z.boolean().optional(),
    mpvAutoSkipFiller: z.boolean().optional(),
    // Discord rich presence
    enableRichPresence: z.boolean().optional(),
    enableAnimeRichPresence: z.boolean().optional(),
    enableMangaRichPresence: z.boolean().optional(),
    richPresenceHideSeanimeRepositoryButton: z.boolean().optional(),
    richPresenceShowAniListProfileButton: z.boolean().optional(),
})

export type ClientSettings = z.infer<typeof clientSettingsSchema>

function readClientSettings(): ClientSettings {
    if (typeof window === "undefined") return {}
    try {
        const raw = localStorage.getItem(CLIENT_SETTINGS_KEY)
        if (!raw) return {}
        const parsed = clientSettingsSchema.safeParse(JSON.parse(raw))
        return parsed.success ? parsed.data : {}
    } catch {
        return {}
    }
}

/** Writes client settings locally and queues the per-profile server sync. */
export function setClientSettings(next: ClientSettings | ((prev: ClientSettings) => ClientSettings)): ClientSettings {
    const prev = readClientSettings()
    const value = typeof next === "function" ? next(prev) : next
    seaStorage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(value))
    window.dispatchEvent(new Event("sea-client-settings-changed"))
    return value
}

/** Removes every client override, falling back to the server-wide values. */
export function resetClientSettings(): ClientSettings {
    return setClientSettings({})
}

/**
 * Reads the profile's client settings, re-reading whenever they change — including when
 * seaStorage hydrates them from the server at profile login.
 */
export function useClientSettings(): ClientSettings {
    const [settings, setSettings] = React.useState<ClientSettings>(() => readClientSettings())

    React.useEffect(() => {
        const update = () => setSettings(readClientSettings())
        window.addEventListener("sea-client-settings-changed", update)
        window.addEventListener("sea-client-prefs-hydrated", update)
        window.addEventListener("storage", update)
        return () => {
            window.removeEventListener("sea-client-settings-changed", update)
            window.removeEventListener("sea-client-prefs-hydrated", update)
            window.removeEventListener("storage", update)
        }
    }, [])

    return settings
}
