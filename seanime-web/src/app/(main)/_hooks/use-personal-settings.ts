import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { useClientSettings } from "@/lib/client-settings"
import React from "react"

export type StillWatchingTimingMode = "night" | "always" | "custom"

export type PersonalSettings = {
    autoUpdateProgress: boolean
    enableWatchContinuity: boolean
    autoPlayNextEpisode: boolean
    stillWatchingChecksEnabled: boolean
    stillWatchingEpisodes: number
    /** How the check's active hours are chosen: the default night window, all day, or custom hours. */
    stillWatchingTimingMode: StillWatchingTimingMode
    /** Hours of day (0–23) the still-watching check applies in; the window may cross midnight. */
    stillWatchingStartHour: number
    stillWatchingEndHour: number
    /** How many entries the full News page shows (the News widget's "Show more" tab). */
    newsFeedShowMoreCount: number
    /** Whether a new RSS entry raises a live notification + drawer entry for this profile. */
    newsNotifyNewEntries: boolean
    /** Which new entries notify (see internal/news/notify_filter.go). */
    newsNotifyMode: "all" | "lists" | "keywords"
    /** Comma-separated keywords for "keywords" mode; empty = built-in list. */
    newsNotifyKeywords: string
    hideAudienceScore: boolean
    blurAdultContent: boolean
    disableAnimeCardTrailers: boolean
    mangaAutoUpdateProgress: boolean
    autoPauseStaleWatchingDays: number
    mpvAutoSkipOpening: boolean
    mpvAutoSkipEnding: boolean
    mpvAutoSkipFiller: boolean
    enableRichPresence: boolean
    enableAnimeRichPresence: boolean
    enableMangaRichPresence: boolean
    richPresenceHideSeanimeRepositoryButton: boolean
    richPresenceShowAniListProfileButton: boolean
}

/**
 * Effective values for the per-profile app settings: the profile's client override when set,
 * otherwise the server-wide (admin) value, otherwise the built-in default.
 *
 * Feature consumers read these instead of `serverStatus.settings` so that one profile's
 * preferences apply only to that profile.
 */
export function usePersonalSettings(): PersonalSettings {
    const serverStatus = useServerStatus()
    const clientSettings = useClientSettings()

    return React.useMemo<PersonalSettings>(() => ({
        autoUpdateProgress: clientSettings.autoUpdateProgress ?? serverStatus?.settings?.library?.autoUpdateProgress ?? false,
        enableWatchContinuity: clientSettings.enableWatchContinuity ?? serverStatus?.settings?.library?.enableWatchContinuity ?? false,
        autoPlayNextEpisode: clientSettings.autoPlayNextEpisode ?? serverStatus?.settings?.library?.autoPlayNextEpisode ?? false,
        stillWatchingChecksEnabled: clientSettings.stillWatchingChecksEnabled ?? serverStatus?.settings?.mediaPlayer?.stillWatchingChecksEnabled ?? true,
        stillWatchingEpisodes: clientSettings.stillWatchingEpisodes ?? serverStatus?.settings?.mediaPlayer?.stillWatchingEpisodes ?? 3,
        stillWatchingTimingMode: clientSettings.stillWatchingTimingMode ?? "night",
        stillWatchingStartHour: clientSettings.stillWatchingStartHour ?? 19,
        stillWatchingEndHour: clientSettings.stillWatchingEndHour ?? 10,
        newsFeedShowMoreCount: clientSettings.newsFeedShowMoreCount ?? 40,
        newsNotifyNewEntries: clientSettings.newsNotifyNewEntries ?? true,
        newsNotifyMode: clientSettings.newsNotifyMode ?? "keywords",
        newsNotifyKeywords: clientSettings.newsNotifyKeywords ?? "",
        hideAudienceScore: clientSettings.hideAudienceScore ?? serverStatus?.settings?.anilist?.hideAudienceScore ?? false,
        blurAdultContent: clientSettings.blurAdultContent ?? serverStatus?.settings?.anilist?.blurAdultContent ?? false,
        disableAnimeCardTrailers: clientSettings.disableAnimeCardTrailers ?? serverStatus?.settings?.library?.disableAnimeCardTrailers ?? false,
        mangaAutoUpdateProgress: clientSettings.mangaAutoUpdateProgress ?? serverStatus?.settings?.manga?.mangaAutoUpdateProgress ?? false,
        autoPauseStaleWatchingDays: clientSettings.autoPauseStaleWatchingDays ?? serverStatus?.settings?.anilist?.autoPauseStaleWatchingDays ?? 7,
        mpvAutoSkipOpening: clientSettings.mpvAutoSkipOpening ?? serverStatus?.settings?.mediaPlayer?.mpvAutoSkipOpening ?? false,
        mpvAutoSkipEnding: clientSettings.mpvAutoSkipEnding ?? serverStatus?.settings?.mediaPlayer?.mpvAutoSkipEnding ?? false,
        mpvAutoSkipFiller: clientSettings.mpvAutoSkipFiller ?? serverStatus?.settings?.mediaPlayer?.mpvAutoSkipFiller ?? false,
        enableRichPresence: clientSettings.enableRichPresence ?? serverStatus?.settings?.discord?.enableRichPresence ?? false,
        enableAnimeRichPresence: clientSettings.enableAnimeRichPresence ?? serverStatus?.settings?.discord?.enableAnimeRichPresence ?? false,
        enableMangaRichPresence: clientSettings.enableMangaRichPresence ?? serverStatus?.settings?.discord?.enableMangaRichPresence ?? false,
        richPresenceHideSeanimeRepositoryButton: clientSettings.richPresenceHideSeanimeRepositoryButton ?? serverStatus?.settings?.discord?.richPresenceHideSeanimeRepositoryButton ?? false,
        richPresenceShowAniListProfileButton: clientSettings.richPresenceShowAniListProfileButton ?? serverStatus?.settings?.discord?.richPresenceShowAniListProfileButton ?? false,
    }), [
        clientSettings,
        serverStatus?.settings?.library?.autoUpdateProgress,
        serverStatus?.settings?.library?.enableWatchContinuity,
        serverStatus?.settings?.library?.autoPlayNextEpisode,
        serverStatus?.settings?.library?.disableAnimeCardTrailers,
        serverStatus?.settings?.mediaPlayer?.stillWatchingChecksEnabled,
        serverStatus?.settings?.mediaPlayer?.stillWatchingEpisodes,
        serverStatus?.settings?.anilist?.hideAudienceScore,
        serverStatus?.settings?.anilist?.blurAdultContent,
        serverStatus?.settings?.manga?.mangaAutoUpdateProgress,
        serverStatus?.settings?.anilist?.autoPauseStaleWatchingDays,
        serverStatus?.settings?.mediaPlayer?.mpvAutoSkipOpening,
        serverStatus?.settings?.mediaPlayer?.mpvAutoSkipEnding,
        serverStatus?.settings?.mediaPlayer?.mpvAutoSkipFiller,
        serverStatus?.settings?.discord?.enableRichPresence,
        serverStatus?.settings?.discord?.enableAnimeRichPresence,
        serverStatus?.settings?.discord?.enableMangaRichPresence,
        serverStatus?.settings?.discord?.richPresenceHideSeanimeRepositoryButton,
        serverStatus?.settings?.discord?.richPresenceShowAniListProfileButton,
    ])
}
