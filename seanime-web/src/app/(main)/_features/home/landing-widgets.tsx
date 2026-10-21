"use client"

import { useGetLibraryCollection } from "@/api/hooks/anime_collection.hooks"
import { useGetToWatch } from "@/api/hooks/towatch.hooks"
import { useGetUnmatchedTorrents } from "@/api/hooks/unmatched.hooks"
import { useGetAchievementSummary } from "@/api/hooks/achievement.hooks"
import { useMissingEpisodeCount } from "@/app/(main)/_hooks/missing-episodes-loader"
import { useGetAnimeGojuuonMap } from "@/api/hooks/services.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { useGetMangaCollection } from "@/api/hooks/manga.hooks"
import { useAnilistListRecentAiringAnime } from "@/api/hooks/anilist.hooks"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { cn } from "@/components/ui/core/styling"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { useAtom } from "jotai/react"
import { atomWithStorage } from "jotai/utils"
import React from "react"
import {
    LuArrowRight, LuBook, LuCalendar, LuCircleAlert, LuCompass, LuDownload,
    LuFolderSearch, LuListVideo, LuMonitorPlay, LuRss, LuUsers, LuWand, LuTrophy, LuHardDrive,
} from "react-icons/lu"
import { BiBook, BiCalendar } from "react-icons/bi"
import { GiTrophyCup } from "react-icons/gi"

/**
 * The landing page's widgets, and the settings that arrange them.
 *
 * The landing page is a map of the app, and a map is not the same for everybody: what is worth a
 * card on it depends on what the person uses. So the page is a set of widgets, each one a thing the
 * app already knows how to show, and each one optional — toggled and reordered in the settings, the
 * same way the anime and manga home screens are arranged.
 *
 * The configuration is per-profile and kept on this side, like the rewards: there is no server
 * schema for it, and nothing here is a second source of truth — every widget reads the hooks the
 * rest of the app reads.
 */

// ─── Widget definitions ───────────────────────────────────────────────────────

export type LandingWidgetId =
    | "continue-watching"
    | "continue-reading"
    | "quick-links"
    | "library-insights"
    | "anime-stats"
    | "manga-stats"
    | "upcoming-manga"
    | "schedule"
    | "airing-today"
    | "updates"
    | "to-watch"
    | "unmatched"
    | "torrents"
    | "news-feed"
    | "achievements"

export type LandingWidgetConfig = {
    id: LandingWidgetId
    enabled: boolean
}

/** The default page: what was there before it became configurable, and nothing else. */
export const DEFAULT_LANDING_WIDGETS: LandingWidgetConfig[] = [
    { id: "continue-watching", enabled: true },
    { id: "quick-links", enabled: true },
    { id: "library-insights", enabled: true },
    { id: "airing-today", enabled: true },
    { id: "anime-stats", enabled: true },
    { id: "manga-stats", enabled: true },
    { id: "upcoming-manga", enabled: true },
    { id: "schedule", enabled: true },
    { id: "updates", enabled: true },
    { id: "to-watch", enabled: true },
    { id: "unmatched", enabled: true },
    { id: "torrents", enabled: false },
    { id: "news-feed", enabled: true },
    { id: "achievements", enabled: false },
    { id: "continue-reading", enabled: false },
]

export const LANDING_WIDGET_META: Record<LandingWidgetId, { name: string, description: string }> = {
    "continue-watching": { name: "Continue watching", description: "Whatever was being watched, first." },
    "continue-reading": { name: "Continue reading", description: "The manga you were reading, first." },
    "quick-links": { name: "App folders", description: "Your app destinations, organized into folders." },
    "library-insights": { name: "Library analytics", description: "Detailed counts and progress across your library." },
    "anime-stats": { name: "Anime stats", description: "What your anime library holds, counted." },
    "manga-stats": { name: "Manga stats", description: "What your manga library holds, counted." },
    "upcoming-manga": { name: "Upcoming manga", description: "The next likely chapter from manga you are reading." },
    "schedule": { name: "Schedule", description: "What airs next, and what you are behind on." },
    "airing-today": { name: "Airing today", description: "What is out today, from AniList's schedule." },
    "updates": { name: "Updates", description: "What the server was last updated to, and recent commits." },
    "to-watch": { name: "Todo List", description: "Anime and manga you plan to watch or read." },
    "unmatched": { name: "Unmatched downloads", description: "Finished downloads waiting to be matched." },
    "torrents": { name: "Torrent list", description: "What is downloading, and what is seeding." },
    "news-feed": { name: "News", description: "Anime and manga news and recommendations, from RSS." },
    "achievements": { name: "Achievements", description: "Everything you have unlocked so far." },
}

/** Everything a quick-link card can point at — the sidebar's own destinations. */
export type LandingQuickLink = {
    id: string
    name: string
    description: string
    href: string
}

export const LANDING_QUICK_LINKS: LandingQuickLink[] = [
    { id: "anime", name: "Anime", description: "Your library, everything you have.", href: "/anime" },
    { id: "manga", name: "Manga", description: "Your reading, and what is new.", href: "/manga" },
    { id: "to-watch", name: "Todo List", description: "Anime and manga you plan to watch or read.", href: "/to-watch" },
    { id: "lists", name: "My List", description: "Your AniList lists, as AniList keeps them.", href: "/lists" },
    { id: "discover", name: "Discover", description: "Something new, from what you already like.", href: "/discover" },
    { id: "schedule", name: "Schedule", description: "What airs next, and what you are behind on.", href: "/schedule" },
    { id: "news", name: "News", description: "The freshest from your feeds.", href: "/news" },
    { id: "missed-sequels", name: "Missed Sequels", description: "Follow-up series you may have missed.", href: "/missed-sequels" },
    { id: "unmatched", name: "Unmatched Downloads", description: "Finished downloads waiting to be matched.", href: "/unmatched" },
    { id: "torrent-list", name: "Torrent list", description: "What is downloading, and what is seeding.", href: "/torrent-list" },
    { id: "debrid", name: "Debrid", description: "Browse and manage debrid downloads.", href: "/debrid" },
    { id: "enqueue-future", name: "Enqueue Future", description: "What the recommendations queued for you.", href: "/enqueue-future" },
    { id: "auto-downloader", name: "Auto Downloader", description: "Rules and queues for automatic downloads.", href: "/auto-downloader" },
    { id: "scan-summaries", name: "Scan Summaries", description: "Review recent library scans.", href: "/scan-summaries" },
    { id: "community", name: "Community", description: "Who else is here, and what they are watching.", href: "/community" },
    { id: "achievements", name: "Achievements", description: "Everything you have unlocked so far.", href: "/achievements" },
    { id: "milestones", name: "Milestones", description: "How far along your levels you are.", href: "/milestones" },
    { id: "profile", name: "Profile", description: "Your profile, stats, and activity.", href: "/profile/me" },
    { id: "enmasse-anime", name: "Anime En Masse", description: "Apply actions to multiple anime at once.", href: "/enmasse-anime" },
    { id: "enmasse-manga", name: "Manga En Masse", description: "Apply actions to multiple manga at once.", href: "/enmasse-manga" },
    { id: "extensions", name: "Extensions", description: "Manage extensions and plugins.", href: "/extensions" },
    { id: "sync", name: "Offline Sync", description: "Manage offline media and synchronization.", href: "/sync" },
    { id: "theme-manager", name: "Themes", description: "Choose and customize app themes.", href: "/theme-manager" },
    { id: "settings", name: "Settings", description: "Configure Deus Ex Aeternae.", href: "/settings" },
]

export type LandingFolderConfig = {
    id: string
    name: string
    linkIds: string[]
}

export const DEFAULT_LANDING_FOLDERS: LandingFolderConfig[] = [
    { id: "library", name: "Library", linkIds: ["anime", "manga", "lists", "to-watch"] },
    { id: "discover", name: "Discover", linkIds: ["discover", "schedule", "news", "missed-sequels"] },
    { id: "downloads", name: "Downloads", linkIds: ["unmatched", "torrent-list", "debrid", "enqueue-future", "auto-downloader", "scan-summaries"] },
    { id: "community", name: "Community", linkIds: ["community", "achievements", "milestones", "profile"] },
    { id: "tools", name: "Tools", linkIds: ["enmasse-anime", "enmasse-manga", "extensions", "sync", "theme-manager", "settings"] },
]

// ─── The configuration, per profile ───────────────────────────────────────────

const currentProfileIdAtom = atom(get => {
    const status = get(serverStatusAtom)
    return status?.currentProfile?.id ? String(status.currentProfile.id) : "default"
})

import { serverStatusAtom } from "@/app/(main)/_atoms/server-status.atoms"

export const __landingWidgetsAtom = atomWithStorage<LandingWidgetConfig[]>(
    "sea-landing-widgets-default",
    DEFAULT_LANDING_WIDGETS,
    undefined,
    { getOnInit: true },
)

/**
 * The widget order and toggles, per profile.
 *
 * A single atom keyed by profile would do, but the storage atom is read at mount — before the
 * profile is known — so the swap between profiles happens here instead: the atom holds whichever
 * profile's list is loaded, and changing profiles re-reads it.
 */
export function useLandingWidgets() {
    const profileId = useAtomValue(currentProfileIdAtom)
    const [widgetsByProfile, setWidgets] = useAtom(
        React.useMemo(() => atomWithStorage<Record<string, LandingWidgetConfig[]>>(
            "sea-landing-widgets",
            {},
            undefined,
            { getOnInit: true },
        ), []),
    )

    const widgets = React.useMemo(() => {
        const stored = widgetsByProfile?.[profileId]
        if (!stored?.length) return DEFAULT_LANDING_WIDGETS
        // Widgets added since this profile was last arranged join the end, on.
        const known = new Set(stored.map(w => w.id))
        const missing = DEFAULT_LANDING_WIDGETS.filter(w => !known.has(w.id))
        return [...stored, ...missing]
    }, [widgetsByProfile, profileId])

    const setWidgetEnabled = React.useCallback((id: LandingWidgetId, enabled: boolean) => {
        setWidgets(prev => {
            const current = prev?.[profileId] ?? DEFAULT_LANDING_WIDGETS
            const known = new Set(current.map(w => w.id))
            const missing = DEFAULT_LANDING_WIDGETS.filter(w => !known.has(w.id))
            const list = [...current, ...missing].map(w => w.id === id ? { ...w, enabled } : w)
            return { ...(prev ?? {}), [profileId]: list }
        })
    }, [profileId, setWidgets])

    const moveWidget = React.useCallback((from: number, to: number) => {
        setWidgets(prev => {
            const current = prev?.[profileId] ?? DEFAULT_LANDING_WIDGETS
            const known = new Set(current.map(w => w.id))
            const missing = DEFAULT_LANDING_WIDGETS.filter(w => !known.has(w.id))
            const list = [...current, ...missing]
            const [moved] = list.splice(from, 1)
            list.splice(to, 0, moved)
            return { ...(prev ?? {}), [profileId]: list }
        })
    }, [profileId, setWidgets])

    return { widgets, setWidgetEnabled, moveWidget }
}

/**
 * App destinations are grouped into editable folders and saved per profile.
 */
export function useLandingFolders() {
    const profileId = useAtomValue(currentProfileIdAtom)
    const [foldersByProfile, setFoldersByProfile] = useAtom(
        React.useMemo(() => atomWithStorage<Record<string, LandingFolderConfig[]>>(
            "sea-landing-folders",
            {},
            undefined,
            { getOnInit: true },
        ), []),
    )

    const folders = React.useMemo(
        () => foldersByProfile?.[profileId] ?? DEFAULT_LANDING_FOLDERS,
        [foldersByProfile, profileId],
    )

    const updateFolders = React.useCallback((update: (current: LandingFolderConfig[]) => LandingFolderConfig[]) => {
        setFoldersByProfile(prev => ({
            ...(prev ?? {}),
            [profileId]: update(prev?.[profileId] ?? DEFAULT_LANDING_FOLDERS),
        }))
    }, [profileId, setFoldersByProfile])

    return { folders, updateFolders }
}
