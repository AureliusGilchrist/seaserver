"use client"

import { AL_MissedSequel } from "@/api/generated/types"
import { useGetLibraryMissedSequels } from "@/api/hooks/anime_collection.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { PaginatedMediaGrid } from "@/app/(main)/_features/media/_components/paginated-media-grid"
import { LibrarySortMenu, useLibrarySort } from "@/app/(main)/_features/sorting/library-sort-menu"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import {
    LibrarySortField,
    SORT_FIELD_AIRING_STATUS,
    SORT_FIELD_AVERAGE_SCORE,
    SORT_FIELD_RELEASE_DATE,
    SORT_FIELD_GOJUUON,
    SORT_FIELD_TITLE,
    sortByGojuuonTitle,
    sortByMediaField,
} from "@/lib/helpers/filtering"
import { displayTitle } from "@/lib/helpers/media"
import React from "react"

/** Tab id for Missed sequels. Not a list status. */
export const MISSED_SEQUELS_TAB = "MISSED_SEQUELS"

const PREQUEL_TITLE_FIELD: LibrarySortField = {
    label: "Completed show", asc: "PREQUEL_TITLE", desc: "PREQUEL_TITLE_DESC", ascLabel: "A to Z", descLabel: "Z to A",
}

/** Every field but "Completed show" is about the sequel. */
export const MISSED_SEQUELS_SORT_FIELDS: LibrarySortField[] = [
    SORT_FIELD_RELEASE_DATE,
    SORT_FIELD_TITLE,
    SORT_FIELD_GOJUUON,
    PREQUEL_TITLE_FIELD,
    SORT_FIELD_AVERAGE_SCORE,
    SORT_FIELD_AIRING_STATUS,
]

/** Newest sequel first unless the viewer picks otherwise. */
export function useMissedSequelsSort() {
    return useLibrarySort("missed-sequels", "RELEASE_DATE_DESC")
}

export function MissedSequelsSortMenu({ className }: { className?: string }) {
    const { sorting, setSorting } = useMissedSequelsSort()
    return <LibrarySortMenu fields={MISSED_SEQUELS_SORT_FIELDS} value={sorting} onChange={setSorting} className={className} />
}

function sortMissedSequels(items: AL_MissedSequel[], sorting: string): AL_MissedSequel[] {
    const byTitle = (pick: (n: AL_MissedSequel) => string) =>
        [...items].sort((a, b) => pick(a).localeCompare(pick(b)))
    switch (sorting) {
        case "TITLE":
            return byTitle(n => displayTitle(n.sequel?.title))
        case "TITLE_DESC":
            return byTitle(n => displayTitle(n.sequel?.title)).reverse()
        case "PREQUEL_TITLE":
            return byTitle(n => displayTitle(n.media?.title))
        case "PREQUEL_TITLE_DESC":
            return byTitle(n => displayTitle(n.media?.title)).reverse()
        case "GOJUUON":
        case "GOJUUON_DESC":
            return sortByGojuuonTitle(items, n => displayTitle(n.sequel?.title) || n.sequel?.title?.romaji, sorting === "GOJUUON_DESC")
    }
    // Title order first, so ties in the media sorts read alphabetically.
    const base = byTitle(n => displayTitle(n.sequel?.title))
    return sortByMediaField(base, sorting, n => n.sequel) ?? base
}

/**
 * Completed shows whose sequel is out (finished or airing) and not started: not on any list, or only
 * on Planning. The card is the sequel and links to its page; the overlay names the show it follows.
 */
export function MissedSequelsList({ searchInput = "", withTitle = true, withSortMenu = false }: {
    searchInput?: string
    withTitle?: boolean
    /** Draw the sort menu here, for views that do not already show it next to their tabs. */
    withSortMenu?: boolean
}) {
    const { data, isLoading, isError } = useGetLibraryMissedSequels()
    const { sorting } = useMissedSequelsSort()
    const serverStatus = useServerStatus()
    const enableAdult = !!serverStatus?.settings?.anilist?.enableAdultContent

    const items = React.useMemo(() => {
        const q = searchInput.trim().toLowerCase()
        const filtered = (data ?? []).filter(item => {
            if (!item.sequel || !item.media) return false
            if (!enableAdult && (item.sequel.isAdult || item.media.isAdult)) return false
            if (!q) return true
            return [item.sequel.title, item.media.title].some(t =>
                [t?.userPreferred, t?.english, t?.romaji, t?.native].some(v => v?.toLowerCase().includes(q)))
        })
        return sortMissedSequels(filtered, sorting)
    }, [data, searchInput, enableAdult, sorting])

    if (isLoading) return <LoadingSpinner />

    return (
        <div className="space-y-4" data-missed-sequels-list>
            {(withTitle || withSortMenu) && <div className="flex flex-wrap items-center gap-3">
                {withTitle && <h2 className="m-0">Missed sequels <span className="text-[--muted] font-medium ml-3">{items.length.toLocaleString()}</span></h2>}
                <div className="flex-1" />
                {withSortMenu && <MissedSequelsSortMenu />}
            </div>}
            {isError && <p className="text-[--muted]">Could not load missed sequels from the server. Try again later.</p>}
            {!isError && !items.length && <p className="text-[--muted]">
                No missed sequels. Every released sequel to a show you completed is already on one of your lists.
            </p>}
            {!!items.length && <PaginatedMediaGrid persistKey="missed-sequels"
                items={items}
                renderItem={item => <MissedSequelItem key={item.sequel!.id} item={item} />}
            />}
        </div>
    )
}

const MEDIA_STATUS_LABEL: Record<string, string> = {
    FINISHED: "Finished",
    RELEASING: "Airing",
}

const MissedSequelItem = React.memo(({ item }: { item: AL_MissedSequel }) => {
    const prequelTitle = displayTitle(item.media?.title)
    const status = MEDIA_STATUS_LABEL[item.sequel?.status ?? ""] ?? item.sequel?.status
    return (
        <MediaEntryCard
            media={item.sequel!}
            type="anime"
            withAudienceScore={false}
            showAddToPlanning={!item.sequelListStatus}
            overlay={<div className="flex flex-col items-start gap-1 p-2 pointer-events-none" data-missed-sequel-overlay>
                <span
                    className="max-w-full truncate rounded-md bg-gray-950/85 px-2 py-0.5 text-xs font-semibold text-white"
                    title={`Sequel to ${prequelTitle}`}
                >Sequel to {prequelTitle}</span>
                <span className="flex gap-1">
                    {status && <span
                        className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-semibold",
                            item.sequel?.status === "RELEASING" ? "bg-green-700/90 text-white" : "bg-gray-800/90 text-gray-100",
                        )}
                    >{status}</span>}
                    {item.sequelListStatus === "PLANNING" &&
                        <span className="rounded-md bg-indigo-700/90 px-2 py-0.5 text-xs font-semibold text-white">On Planning</span>}
                </span>
            </div>}
        />
    )
})
