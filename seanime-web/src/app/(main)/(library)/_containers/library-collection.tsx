import { AL_MediaListStatus, Anime_LibraryCollectionEntry, Anime_LibraryCollectionList } from "@/api/generated/types"
import { useGetLibraryMissedSequels } from "@/api/hooks/anime_collection.hooks"
import { MISSED_SEQUELS_TAB, MissedSequelsList, MissedSequelsSortMenu } from "@/app/(main)/(library)/_containers/missed-sequels"
import { __mainLibrary_paramsAtom } from "@/app/(main)/(library)/_lib/handle-library-collection"
import { HomeListTabs, useHomeListTab } from "@/app/(main)/_features/home/home-sections"
import { PaginatedMediaGrid } from "@/app/(main)/_features/media/_components/paginated-media-grid"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { LibrarySortMenu, useLibrarySort } from "@/app/(main)/_features/sorting/library-sort-menu"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { IconButton } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselDotButtons } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { ANIME_LIBRARY_SORT_FIELDS } from "@/lib/helpers/filtering"
import { getLibraryCollectionTitle } from "@/lib/server/utils"
import { useThemeSettings } from "@/lib/theme/hooks"
import { useAtom } from "jotai/react"
import React from "react"
import { LuListFilter } from "react-icons/lu"

/**
 * A React key that survives the local library.
 *
 * Every other list is AniList entries, where the media id is unique. The local library also carries
 * folders that matched no anime at all, and the server gives all of those media id 0 — so keying on
 * the id alone collapsed them into one key and React drew one folder in place of however many there
 * are. Those entries are titled after their directory, which is what distinguishes them.
 */
function entryKey(entry: Anime_LibraryCollectionEntry): string {
    if (entry.mediaId) return String(entry.mediaId)
    return `unmatched:${entry.media?.title?.userPreferred ?? entry.libraryData?.sharedPath ?? ""}`
}

export function LibraryCollectionLists({ collectionList, isLoading, streamingMediaIds, showStatuses, type }: {
    collectionList: Anime_LibraryCollectionList[],
    isLoading: boolean,
    streamingMediaIds: number[],
    showStatuses?: AL_MediaListStatus[],
    type: "carousel" | "grid"
}) {

    const lists = collectionList.filter(list => !!list.entries?.length && !!list.type && (!showStatuses || showStatuses.includes(list.type)))
    // Missed sequels hang off the Completed list, so they go wherever Completed is allowed.
    const showMissedSequels = !showStatuses || showStatuses.includes("COMPLETED")
    const [activeList, setActiveList] = useHomeListTab("anime", [
        ...lists.map(list => list.type!),
        ...(showMissedSequels ? [MISSED_SEQUELS_TAB] : []),
    ])
    const isMissedSequels = activeList === MISSED_SEQUELS_TAB
    // Only asked for once the tab is opened; after that the cached answer gives the tab its count.
    const { data: missedSequels } = useGetLibraryMissedSequels({ enabled: isMissedSequels })

    return (
        <PageWrapper
            key="library-collection-lists"
            className={type === "grid" ? "space-y-8" : "space-y-4"}
            data-library-collection-lists
            {...{
                initial: { opacity: 0, y: 60 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, scale: 0.99 },
                transition: {
                    duration: 0.25,
                },
            }}>
            <HomeListTabs
                tabs={[
                    ...lists.map(list => ({ id: list.type!, label: getLibraryCollectionTitle(list.type), count: list.entries?.length ?? 0 })),
                    ...(showMissedSequels ? [{ id: MISSED_SEQUELS_TAB, label: "Missed sequels", count: missedSequels?.length }] : []),
                ]}
                value={activeList}
                onChange={setActiveList}
                trailing={isMissedSequels ? <MissedSequelsSortMenu /> : <AnimeLibrarySortMenu />}
            />
            {isMissedSequels && <MissedSequelsList withTitle={false} />}
            {lists.map(collection => (
                <div key={collection.type} hidden={collection.type !== activeList} className="space-y-4">
                    <LibraryCollectionListItem
                        list={collection}
                        streamingMediaIds={streamingMediaIds}
                        showStatuses={showStatuses}
                        type={type}
                        hideTitle={lists.length + (showMissedSequels ? 1 : 0) > 1}
                    />
                </div>
            ))}
        </PageWrapper>
    )

}

/** The order of the anime library's lists, shared by the home lists and the detailed view. */
export function AnimeLibrarySortMenu({ className }: { className?: string }) {
    const { animeLibraryCollectionDefaultSorting } = useThemeSettings()
    const { sorting, setSorting } = useLibrarySort("anime-library", animeLibraryCollectionDefaultSorting)
    return <LibrarySortMenu fields={ANIME_LIBRARY_SORT_FIELDS} value={sorting} onChange={setSorting} className={className} />
}

export function LibraryCollectionFilteredLists({ collectionList, isLoading, streamingMediaIds, showStatuses, type }: {
    collectionList: Anime_LibraryCollectionList[],
    isLoading: boolean,
    streamingMediaIds: number[],
    showStatuses?: AL_MediaListStatus[],
    type: "carousel" | "grid"
}) {

    // const params = useAtomValue(__mainLibrary_paramsAtom)

    const filteredCollectionList = React.useMemo(() => {
        return collectionList.filter(collection => {
            return !showStatuses || (!!showStatuses && !!collection.type && showStatuses.includes(collection.type))
        })
    }, [collectionList, showStatuses])

    return (
        <PageWrapper
            key="library-filtered-lists"
            className={type === "grid" ? "space-y-8" : "space-y-4"}
            data-library-filtered-lists
            {...{
                initial: { opacity: 0, y: 60 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, scale: 0.99 },
                transition: {
                    duration: 0.25,
                },
            }}>
            <div className="flex justify-end">
                <AnimeLibrarySortMenu />
            </div>
            {type === "grid" && <PaginatedMediaGrid persistKey="anime-library-filtered"
                items={filteredCollectionList?.flatMap(n => n.entries)?.filter(Boolean)}
                renderItem={entry => (
                    <LibraryCollectionEntryItem key={entryKey(entry)} entry={entry} streamingMediaIds={streamingMediaIds} type={type} />
                )}
            />}
            {type === "carousel" && <Carousel
                className={cn("w-full max-w-full !mt-0")}
                gap="xl"
                opts={{
                    align: "start",
                    dragFree: true,
                }}
                autoScroll={false}
            >
                <CarouselDotButtons className="-top-2" />
                <CarouselContent className="px-6">
                    {filteredCollectionList?.flatMap(n => n.entries)?.filter(Boolean)?.map(entry => {
                        return <LibraryCollectionEntryItem key={entryKey(entry)} entry={entry} streamingMediaIds={streamingMediaIds} type={type} />
                    })}
                </CarouselContent>
            </Carousel>}
        </PageWrapper>
    )

}

export const LibraryCollectionListItem = React.memo(({ list, streamingMediaIds, showStatuses, type, hideTitle }: {
    list: Anime_LibraryCollectionList,
    streamingMediaIds: number[],
    showStatuses?: AL_MediaListStatus[],
    type: "carousel" | "grid"
    /** The tabs above already name this list. */
    hideTitle?: boolean
}) => {

    const isCurrentlyWatching = list.type === "CURRENT"

    const [params, setParams] = useAtom(__mainLibrary_paramsAtom)

    if (!!showStatuses && !!list.type && !showStatuses.includes(list.type)) return null

    return (
        <React.Fragment key={list.type}>
            <div className={cn("flex gap-3 items-center", hideTitle && !isCurrentlyWatching && "hidden")} data-library-collection-list-item-header data-list-type={list.type}>
                {!hideTitle && <h2
                    className={cn(
                        "p-0 m-0",
                    )}
                >{getLibraryCollectionTitle(list.type)}</h2>}
                {(type === "grid" || hideTitle) && <div className="flex flex-1"></div>}
                {isCurrentlyWatching && <DropdownMenu
                    trigger={<IconButton
                        intent="white-basic"
                        size="xs"
                        className="mt-1"
                        icon={<LuListFilter />}
                    />}
                >
                    <DropdownMenuItem
                        onClick={() => {
                            setParams(draft => {
                                draft.continueWatchingOnly = !draft.continueWatchingOnly
                                return
                            })
                        }}
                    >
                        {params.continueWatchingOnly ? "Show all" : "Show unwatched only"}
                    </DropdownMenuItem>
                </DropdownMenu>}
            </div>
            {type === "grid" && <PaginatedMediaGrid persistKey={`anime-library-${list.type}`}
                items={list.entries}
                gridProps={{
                    "data-library-collection-list-item-media-card-lazy-grid": true,
                    "data-list-type": list.type,
                }}
                renderItem={entry => (
                    <LibraryCollectionEntryItem key={entryKey(entry)} entry={entry} streamingMediaIds={streamingMediaIds} type={type} />
                )}
            />}
            {type === "carousel" && <Carousel
                className={cn("w-full max-w-full !mt-0")}
                gap="xl"
                opts={{
                    align: "start",
                    dragFree: true,
                }}
                autoScroll={false}
            >
                <CarouselDotButtons className="-top-2" />
                <CarouselContent className="px-6">
                    {list.entries?.map(entry => {
                        return <LibraryCollectionEntryItem key={entryKey(entry)} entry={entry} streamingMediaIds={streamingMediaIds} type={type} />
                    })}
                </CarouselContent>
            </Carousel>}
        </React.Fragment>
    )
})

export const LibraryCollectionEntryItem = React.memo(({ entry, streamingMediaIds, type }: {
    entry: Anime_LibraryCollectionEntry,
    streamingMediaIds: number[],
    type: "carousel" | "grid"
}) => {
    return (
        <MediaEntryCard
            media={entry.media!}
            listData={entry.listData}
            libraryData={entry.libraryData}
            nakamaLibraryData={entry.nakamaLibraryData}
            showListDataButton
            withAudienceScore={false}
            type="anime"
            containerClassName={type === "carousel" ? "sea-card-item mx-2 mt-8 mb-0" : undefined}
        />
    )
})
