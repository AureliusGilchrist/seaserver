import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { useClientSettings } from "@/lib/client-settings"
import React from "react"

export type StillWatchingTimingMode = "night" | "always" | "custom"

export type PersonalSettings = {
    autoUpdateProgress: boolean
    enableWatchContinuity: boolean
    autoPlayNextEpisode: boolean
    /** Desktop client: leaving the page while the local player is playing pops it out where it was. */
    autoPopoutOnLeave: boolean
    stillWatchingChecksEnabled: boolean
    stillWatchingEpisodes: number
    /** How the check's active hours are chosen: the default night window, all day, or custom hours. */
    stillWatchingTimingMode: StillWatchingTimingMode
    /** Hours of day (0–23) the still-watching check applies in; the window may cross midnight. */
    stillWatchingStartHour: number
    stillWatchingEndHour: number
    /** A pause/gap longer than this (minutes) starts a fresh session for the episode count. */
    stillWatchingSessionGapMinutes: number
    /** Mouse movement during playback postpones the still-watching check. */
    stillWatchingMouseExtends: boolean
    /** Movement needed (screen widths travelled) to earn one extra episode. */
    stillWatchingMouseAmount: number
    /** Most extra episodes movement can add. */
    stillWatchingMouseMaxExtra: number
    /** How many entries the full News page shows (the News widget's "Show more" tab). */
    newsFeedShowMoreCount: number
    /** Whether a new RSS entry raises a live notification + drawer entry for this profile. */
    newsNotifyNewEntries: boolean
    /** Which new entries notify (see internal/news/notify_filter.go). */
    newsNotifyMode: "all" | "lists" | "keywords"
    /** Which lists "lists" mode reads. */
    newsNotifyListCurrent: boolean
    newsNotifyListPlanning: boolean
    newsNotifyListCompleted: boolean
    /** Comma-separated keywords for "keywords" mode; empty = built-in list. */
    newsNotifyKeywords: string
    /** Whether the community timeline shows paced news cards. */
    communityShowNews: boolean
    hideAudienceScore: boolean
    blurAdultContent: boolean
    disableAnimeCardTrailers: boolean
    /** Whether the anime library shows the Completed list. */
    showCompletedInLibrary: boolean
    /** Card widths in px (see CardSizeVariables). */
    animeCardWidth: number
    mangaCardWidth: number
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
        autoPopoutOnLeave: clientSettings.autoPopoutOnLeave ?? true,
        stillWatchingChecksEnabled: clientSettings.stillWatchingChecksEnabled ?? serverStatus?.settings?.mediaPlayer?.stillWatchingChecksEnabled ?? true,
        stillWatchingEpisodes: clientSettings.stillWatchingEpisodes ?? serverStatus?.settings?.mediaPlayer?.stillWatchingEpisodes ?? 3,
        stillWatchingTimingMode: clientSettings.stillWatchingTimingMode ?? "night",
        stillWatchingStartHour: clientSettings.stillWatchingStartHour ?? 19,
        stillWatchingEndHour: clientSettings.stillWatchingEndHour ?? 10,
        stillWatchingSessionGapMinutes: clientSettings.stillWatchingSessionGapMinutes ?? 30,
        stillWatchingMouseExtends: clientSettings.stillWatchingMouseExtends ?? false,
        stillWatchingMouseAmount: clientSettings.stillWatchingMouseAmount ?? 20,
        stillWatchingMouseMaxExtra: clientSettings.stillWatchingMouseMaxExtra ?? 2,
        newsFeedShowMoreCount: clientSettings.newsFeedShowMoreCount ?? 40,
        newsNotifyNewEntries: clientSettings.newsNotifyNewEntries ?? true,
        newsNotifyMode: clientSettings.newsNotifyMode ?? "keywords",
        newsNotifyListCurrent: clientSettings.newsNotifyListCurrent ?? true,
        newsNotifyListPlanning: clientSettings.newsNotifyListPlanning ?? true,
        newsNotifyListCompleted: clientSettings.newsNotifyListCompleted ?? true,
        newsNotifyKeywords: clientSettings.newsNotifyKeywords ?? "",
        communityShowNews: clientSettings.communityShowNews ?? true,
        hideAudienceScore: clientSettings.hideAudienceScore ?? serverStatus?.settings?.anilist?.hideAudienceScore ?? false,
        blurAdultContent: clientSettings.blurAdultContent ?? serverStatus?.settings?.anilist?.blurAdultContent ?? false,
        disableAnimeCardTrailers: clientSettings.disableAnimeCardTrailers ?? serverStatus?.settings?.library?.disableAnimeCardTrailers ?? false,
        showCompletedInLibrary: clientSettings.showCompletedInLibrary ?? true,
        animeCardWidth: clampCardWidth(clientSettings.animeCardWidth),
        mangaCardWidth: clampCardWidth(clientSettings.mangaCardWidth),
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

export const CARD_WIDTH_MIN = 140
export const CARD_WIDTH_MAX = 320
export const CARD_WIDTH_DEFAULT = 220

export function clampCardWidth(v: number | undefined | null): number {
    if (typeof v !== "number" || !Number.isFinite(v)) return CARD_WIDTH_DEFAULT
    return Math.min(CARD_WIDTH_MAX, Math.max(CARD_WIDTH_MIN, Math.round(v)))
}
