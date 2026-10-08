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
    | "anime-stats"
    | "manga-stats"
    | "schedule"
    | "airing-today"
    | "updates"
    | "to-watch"
    | "unmatched"
    | "torrents"
    | "achievements"

export type LandingWidgetConfig = {
    id: LandingWidgetId
    enabled: boolean
}

/** The default page: what was there before it became configurable, and nothing else. */
export const DEFAULT_LANDING_WIDGETS: LandingWidgetConfig[] = [
    { id: "continue-watching", enabled: true },
    { id: "quick-links", enabled: true },
    { id: "airing-today", enabled: true },
    { id: "anime-stats", enabled: true },
    { id: "manga-stats", enabled: true },
    { id: "schedule", enabled: true },
    { id: "updates", enabled: true },
    { id: "to-watch", enabled: true },
    { id: "unmatched", enabled: true },
    { id: "torrents", enabled: false },
    { id: "achievements", enabled: false },
    { id: "continue-reading", enabled: false },
]

export const LANDING_WIDGET_META: Record<LandingWidgetId, { name: string, description: string }> = {
    "continue-watching": { name: "Continue watching", description: "Whatever was being watched, first." },
    "continue-reading": { name: "Continue reading", description: "The manga you were reading, first." },
    "quick-links": { name: "Quick links", description: "Every sidebar area, as a card — pick which in its settings." },
    "anime-stats": { name: "Anime stats", description: "What your anime library holds, counted." },
    "manga-stats": { name: "Manga stats", description: "What your manga library holds, counted." },
    "schedule": { name: "Schedule", description: "What airs next, and what you are behind on." },
    "airing-today": { name: "Airing today", description: "What is out today, from AniList's schedule." },
    "updates": { name: "Updates", description: "What the server was last updated to, and recent commits." },
    "to-watch": { name: "To Watch", description: "The list you arranged, in your order." },
    "unmatched": { name: "Unmatched downloads", description: "Finished downloads waiting to be matched." },
    "torrents": { name: "Torrent list", description: "What is downloading, and what is seeding." },
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
    { id: "schedule", name: "Schedule", description: "What airs next, and what you are behind on.", href: "/schedule" },
    { id: "manga", name: "Manga", description: "Your reading, and what is new.", href: "/manga" },
    { id: "to-watch", name: "To Watch", description: "The list you arranged, in your order.", href: "/to-watch" },
    { id: "discover", name: "Discover", description: "Something new, from what you already like.", href: "/discover" },
    { id: "lists", name: "My List", description: "Your AniList lists, as AniList keeps them.", href: "/lists" },
    { id: "unmatched", name: "Unmatched Downloads", description: "Finished downloads waiting to be matched.", href: "/unmatched" },
    { id: "torrent-list", name: "Torrent list", description: "What is downloading, and what is seeding.", href: "/torrent-list" },
    { id: "community", name: "Community", description: "Who else is here, and what they are watching.", href: "/community" },
    { id: "achievements", name: "Achievements", description: "Everything you have unlocked so far.", href: "/achievements" },
    { id: "enqueue-future", name: "Enqueue Future", description: "What the recommendations queued for you.", href: "/enqueue-future" },
    { id: "milestones", name: "Milestones", description: "How far along your levels you are.", href: "/milestones" },
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
