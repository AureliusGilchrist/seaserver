import { Anime_Entry } from "@/api/generated/types"
import { useRefreshAnimeEntryStats } from "@/api/hooks/anime_entries.hooks"
import { Button } from "@/components/ui/button"
import React from "react"
import { LuRefreshCw } from "react-icons/lu"

/**
 * Sits at the bottom of every anime entry view.
 *
 * Wipes everything the server has cached for this one anime — episode metadata, AniList media
 * objects (memory, disk and SQLite), episode collections, streaming episode lists, filler data
 * — refetches the collection, then drops the client-side copies so the page rebuilds from
 * scratch. For when an entry insists on showing counts or episodes that are no longer true.
 */
export function AnimeEntryRefreshStatsButton({ entry }: { entry: Anime_Entry }) {

    const { mutate: refreshStats, isPending } = useRefreshAnimeEntryStats(entry.mediaId)

    return (
        <div data-anime-entry-refresh-stats-container className="flex justify-center pt-10 pb-4">
            <Button
                data-anime-entry-refresh-stats-button
                intent="warning-subtle"
                // No yellow intent exists — the closest is orange, so the palette is set here.
                className="text-yellow-600 bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20 active:bg-yellow-500/30 dark:text-yellow-300"
                size="md"
                rounded
                disabled={isPending}
                leftIcon={<LuRefreshCw className={isPending ? "animate-spin" : ""} />}
                onClick={() => refreshStats({ mediaId: entry.mediaId })}
            >
                Refresh all library stats on this entry
            </Button>
        </div>
    )
}
