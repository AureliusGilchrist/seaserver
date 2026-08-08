import { AL_MediaListStatus, Anime_LibraryCollectionEntry, Anime_LibraryCollectionList } from "@/api/generated/types"
import { __mainLibrary_paramsAtom } from "@/app/(main)/(library)/_lib/handle-library-collection"
import { PaginatedMediaGrid } from "@/app/(main)/_features/media/_components/paginated-media-grid"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { IconButton } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselDotButtons } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { getLibraryCollectionTitle } from "@/lib/server/utils"
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
            {collectionList.map(collection => {
                if (!collection.entries?.length) return null
                return <LibraryCollectionListItem
                    key={collection.type}
                    list={collection}
                    streamingMediaIds={streamingMediaIds}
                    showStatuses={showStatuses}
                    type={type}
                />
            })}
        </PageWrapper>
    )

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
            {type === "grid" && <PaginatedMediaGrid
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

export const LibraryCollectionListItem = React.memo(({ list, streamingMediaIds, showStatuses, type }: {
    list: Anime_LibraryCollectionList,
    streamingMediaIds: number[],
    showStatuses?: AL_MediaListStatus[],
    type: "carousel" | "grid"
}) => {

    const isCurrentlyWatching = list.type === "CURRENT"

    const [params, setParams] = useAtom(__mainLibrary_paramsAtom)

    if (!!showStatuses && !!list.type && !showStatuses.includes(list.type)) return null

    return (
        <React.Fragment key={list.type}>
            <div className="flex gap-3 items-center" data-library-collection-list-item-header data-list-type={list.type}>
                <h2
                    className={cn(
                        "p-0 m-0",
                    )}
                >{getLibraryCollectionTitle(list.type)}</h2>
                {type === "grid" && <div className="flex flex-1"></div>}
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
            {type === "grid" && <PaginatedMediaGrid
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
            containerClassName={type === "carousel" ? "basis-[200px] md:basis-[250px] mx-2 mt-8 mb-0" : undefined}
        />
    )
})
