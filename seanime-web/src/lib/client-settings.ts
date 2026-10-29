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
    /** Desktop client: leaving the page while the local player is playing pops it out where it was. */
    autoPopoutOnLeave: z.boolean().optional(),
    /** Eased, gliding wheel scrolling for the page (see lib/smooth-scroll). */
    smoothScrolling: z.boolean().optional(),
    /** Sub or dub: Japanese audio with subtitles, or English audio. */
    audioPreference: z.enum(["sub", "dub"]).optional(),
    /** With dub: subtitles off, signs & songs only, or full. */
    dubSubtitles: z.enum(["off", "signs", "full"]).optional(),
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
    // The recap the still-watching prompt can show (see video-core-watching-checks.tsx).
    stillWatchingRecap: z.boolean().optional(),
    stillWatchingRecapCount: z.number().optional(),
    stillWatchingRecapDescriptions: z.enum(["full", "short", "hidden"]).optional(),
    stillWatchingSpoilerGuard: z.boolean().optional(),
    stillWatchingCountdown: z.number().optional(),
    stillWatchingReplayFrom: z.enum(["start", "afterOpening"]).optional(),
    stillWatchingFlagDozed: z.boolean().optional(),
    stillWatchingDozedFirst: z.boolean().optional(),
    stillWatchingDoneLeaves: z.boolean().optional(),
    // News
    /** How many entries the full News page shows (the widget's "Show more" tab). */
    newsFeedShowMoreCount: z.number().optional(),
    /** Whether a new RSS entry raises a live notification + drawer entry for this profile. */
    newsNotifyNewEntries: z.boolean().optional(),
    /** Which new entries notify: every one, ones naming a title on the chosen lists, or keyword matches. */
    newsNotifyMode: z.enum(["all", "lists", "keywords"]).optional(),
    /** Which lists "lists" mode reads (each on when unset). */
    newsNotifyListCurrent: z.boolean().optional(),
    newsNotifyListPlanning: z.boolean().optional(),
    newsNotifyListCompleted: z.boolean().optional(),
    /** Which media "lists" mode reads: anime (on when unset) and manga (off when unset). */
    newsNotifyListAnime: z.boolean().optional(),
    newsNotifyListManga: z.boolean().optional(),
    /** Comma-separated keywords for "keywords" mode; empty uses the built-in list. */
    newsNotifyKeywords: z.string().optional(),
    /** Whether the community timeline shows paced news cards. */
    communityShowNews: z.boolean().optional(),
    /** The device's IANA time zone, kept current automatically: achievements count "4 AM" and
     * "Christmas" on the user's clock, not the server's. Not a user-facing setting. */
    timeZone: z.string().optional(),
    // Display
    hideAudienceScore: z.boolean().optional(),
    blurAdultContent: z.boolean().optional(),
    disableAnimeCardTrailers: z.boolean().optional(),
    /** Netflix-style previews of an episode while its card is hovered (see episode-card-preview.tsx). */
    episodePreviewEnabled: z.boolean().optional(),
    episodePreviewSource: z.enum(["trailer", "episode"]).optional(),
    episodePreviewDelay: z.enum(["short", "normal", "long"]).optional(),
    episodePreviewStart: z.enum(["resume", "into"]).optional(),
    episodePreviewSound: z.boolean().optional(),
    episodePreviewVolume: z.number().optional(),
    episodePreviewScope: z.enum(["resume", "all"]).optional(),
    episodePreviewMaxSeconds: z.number().optional(),
    /** Whether the anime library shows the Completed list. */
    showCompletedInLibrary: z.boolean().optional(),
    /** Card widths in px, one for anime cards and one for manga cards. */
    animeCardWidth: z.number().optional(),
    mangaCardWidth: z.number().optional(),
    /** Franchise section on details pages: relation kinds and media kinds shown, and how many
     * before "Show more". See franchise-settings.ts. */
    franchiseRelations: z.array(z.string()).optional(),
    franchiseMediaKinds: z.array(z.string()).optional(),
    franchiseInitialCount: z.number().optional(),
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

/** Stores the device's time zone in this profile's settings when it differs (see `timeZone`). */
export function syncClientTimeZone() {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (!tz) return
        if (readClientSettings().timeZone === tz) return
        setClientSettings(prev => ({ ...prev, timeZone: tz }))
    }
    catch {
        // No Intl time zone support: the server's zone is used.
    }
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
