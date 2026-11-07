import { HomeListTabs, useHomeListTab, useVisitedHomeLists } from "@/app/(main)/_features/home/home-sections"
import { LibrarySortMenu, useLibrarySort } from "@/app/(main)/_features/sorting/library-sort-menu"
import { MANGA_LIBRARY_SORT_FIELDS, sortMissingLast } from "@/lib/helpers/filtering"
import { AL_MediaListStatus, Manga_Collection, Manga_CollectionList } from "@/api/generated/types"
import { useGetMangaReadingHistory, useGetRecentlyReadSyntheticManga, useRefetchMangaChapterContainers } from "@/api/hooks/manga.hooks"
import { PaginatedMediaGrid } from "@/app/(main)/_features/media/_components/paginated-media-grid"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { MediaGenreSelector } from "@/app/(main)/_features/media/_components/media-genre-selector"
import { PluginWebviewSlot } from "@/app/(main)/_features/plugin/webview/plugin-webviews"
import { SeaCommandInjectableItem, useSeaCommandInject } from "@/app/(main)/_features/sea-command/use-inject"
import { seaCommand_compareMediaTitles } from "@/app/(main)/_features/sea-command/utils"
import { __mangaLibraryHeaderImageAtom, __mangaLibraryHeaderMangaAtom } from "@/app/(main)/manga/_components/library-header"
import { __mangaLibrary_paramsAtom, __mangaLibrary_paramsInputAtom } from "@/app/(main)/manga/_lib/handle-manga-collection"
import { LuffyError } from "@/components/shared/luffy-error"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { TextGenerateEffect } from "@/components/shared/text-generate-effect"
import { Button, IconButton } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselDotButtons } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useDebounce } from "@/hooks/use-debounce"
import { getMangaCollectionTitle } from "@/lib/server/utils"
import { ThemeLibraryScreenBannerType, useThemeSettings } from "@/lib/theme/hooks"
import { useSetAtom } from "jotai"
import { useAtom, useAtomValue } from "jotai/react"
import { AnimatePresence } from "motion/react"
import { SeaLink as Link } from "@/components/shared/sea-link"
import { useRouter } from "@/lib/navigation"
import React, { memo } from "react"
import { BiDotsVertical } from "react-icons/bi"
import { LuBookOpenCheck, LuRefreshCcw, LuSparkles } from "react-icons/lu"
import { toast } from "sonner"
import { CommandItemMedia, CommandItemSyntheticManga } from "../../_features/sea-command/_components/command-utils"
import { Badge } from "@/components/ui/badge"
import { SeaImage } from "@/components/shared/sea-image"
import { imageShimmer } from "@/components/shared/image-helpers"
import { displayTitle } from "@/lib/helpers/media"

/** The order of the manga library's lists (stored per viewer; the theme setting until one is picked). */
function useMangaLibrarySort() {
    const { mangaLibraryCollectionDefaultSorting } = useThemeSettings()
    return useLibrarySort("manga-library", mangaLibraryCollectionDefaultSorting)
}

export function MangaLibrarySortMenu({ className }: { className?: string }) {
    const { sorting, setSorting } = useMangaLibrarySort()
    return <LibrarySortMenu fields={MANGA_LIBRARY_SORT_FIELDS} value={sorting} onChange={setSorting} className={className} />
}

type MangaLibraryViewProps = {
    collection: Manga_Collection
    filteredCollection: Manga_Collection | undefined
    genres: string[]
    storedProviders: Record<string, string>
    hasManga: boolean
    showStatuses?: AL_MediaListStatus[]
    type?: "carousel" | "grid"
    withTitle?: boolean
    onHoverImage?: (imageUrl: string | null) => void
}

export function MangaLibraryView(props: MangaLibraryViewProps) {

    const {
        collection,
        filteredCollection,
        genres,
        storedProviders,
        hasManga,
        showStatuses,
        type = "grid",
        withTitle = true,
        onHoverImage,
    } = props

    const [params, setParams] = useAtom(__mangaLibrary_paramsAtom)

    return (
        <>
            <PageWrapper
                key="lists"
                className="relative 2xl:order-first pb-10 p-0"
                data-manga-library-view-container
            >
                <div className="w-full flex justify-end">
                </div>

                <AnimatePresence mode="wait" initial={false}>

                    {!!collection && !hasManga && <LuffyError
                        title="No manga found"
                    >
                        <div className="space-y-2">
                            <p>
                                No manga has been added to your library yet.
                            </p>

                            <div className="!mt-4">
                                <Link href="/discover?type=manga">
                                    <Button intent="white-outline" rounded>
                                        Browse manga
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </LuffyError>}

                    {!params.genre?.length ?
                        <CollectionLists
                            key="lists"
                            collectionList={collection}
                            genres={genres}
                            storedProviders={storedProviders}
                            showStatuses={showStatuses}
                            type={type}
                            withTitle={withTitle}
                            onHoverImage={onHoverImage}
                        />
                        : <FilteredCollectionLists
                            key="filtered-collection"
                            collectionList={filteredCollection}
                            genres={genres}
                            showStatuses={showStatuses}
                            type={type}
                            onHoverImage={onHoverImage}
                        />
                    }
                </AnimatePresence>

                <PluginWebviewSlot slot="manga-screen-bottom" />
            </PageWrapper>
        </>
    )
}

export function CollectionLists({ collectionList, genres, storedProviders, showStatuses, type, withTitle, onHoverImage }: {
    collectionList: Manga_Collection | undefined
    genres: string[]
    storedProviders: Record<string, string>
    showStatuses?: AL_MediaListStatus[]
    type?: "carousel" | "grid"
    withTitle?: boolean
    onHoverImage?: (imageUrl: string | null) => void
}) {

    const lists = collectionList?.lists?.filter(list => {
        if (!list.entries?.length) return false
        if (!showStatuses) return true
        return list.type && showStatuses.includes(list.type)
    }) ?? []
    const [activeList, setActiveList] = useHomeListTab("manga", lists.map(list => list.type!))
    const visitedLists = useVisitedHomeLists(activeList)

    return (
        <PageWrapper
            className="p-4 space-y-8 relative z-[4]"
            data-manga-library-view-collection-lists-container
            {...{
                initial: { opacity: 0, y: 60 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, scale: 0.99 },
                transition: {
                    duration: 0.35,
                },
            }}
        >
            {!!genres?.length && <GenreSelector genres={genres} className="!my-0" />}

            <HomeListTabs
                tabs={lists.map(list => ({
                    id: list.type!,
                    label: list.type === "CURRENT" ? "Currently reading" : getMangaCollectionTitle(list.type),
                    count: list.entries?.length ?? 0,
                }))}
                value={activeList}
                onChange={setActiveList}
                trailing={<MangaLibrarySortMenu />}
            />

            {lists.filter(collection => collection.type === "CURRENT" || collection.type === activeList || (collection.type && visitedLists.has(collection.type))).map(collection => (
                // Kept mounted when hidden: the reading list feeds the header and the command palette.
                <div key={collection.type} hidden={collection.type !== activeList} className="space-y-4">
                    <CollectionListItem
                        list={collection}
                        storedProviders={storedProviders}
                        showStatuses={showStatuses}
                        type={type}
                        withTitle={withTitle}
                        onHoverImage={onHoverImage}
                        hideTitle={lists.length > 1}
                    />
                </div>
            ))}
        </PageWrapper>
    )

}

export function FilteredCollectionLists({ collectionList, genres, showStatuses, type, onHoverImage }: {
    collectionList: Manga_Collection | undefined
    genres: string[]
    showStatuses?: AL_MediaListStatus[]
    type?: "carousel" | "grid"
    onHoverImage?: (imageUrl: string | null) => void
}) {

    const entries = React.useMemo(() => {
        return collectionList?.lists?.flatMap(n => n.entries).filter(Boolean).filter(entry => {
            if (!showStatuses) return true
            return entry.listData?.status && showStatuses.includes(entry.listData.status)
        }) ?? []
    }, [collectionList])

    return (
        <PageWrapper
            className="p-4 space-y-8 relative z-[4]"
            data-manga-library-view-filtered-collection-lists-container
            {...{
                initial: { opacity: 0, y: 60 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, scale: 0.99 },
                transition: {
                    duration: 0.35,
                },
            }}
        >

            {!!genres?.length && <div className="mt-24">
                <GenreSelector genres={genres} />
            </div>}

            <div className="flex justify-end">
                <MangaLibrarySortMenu />
            </div>

            {type === "grid" && <PaginatedMediaGrid type="manga"
                items={entries}
                renderItem={entry => (
                    <div key={entry.media?.id}>
                        <MediaEntryCard
                            media={entry.media!}
                            listData={entry.listData}
                            downloadedChapterCount={entry.downloadedChapterCount}
                            showListDataButton
                            withAudienceScore={false}
                            type="manga"
                            onHoverImage={onHoverImage}
                        />
                    </div>
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
                    {entries.map(entry => {
                        return <MediaEntryCard
                            key={entry.media?.id}
                            media={entry.media!}
                            listData={entry.listData}
                            downloadedChapterCount={entry.downloadedChapterCount}
                            showListDataButton
                            withAudienceScore={false}
                            type="manga"
                            containerClassName={type === "carousel" ? "sea-card-item mx-2 mt-8 mb-0" : undefined}
                            onHoverImage={onHoverImage}
                        />
                    })}
                </CarouselContent>
            </Carousel>}
        </PageWrapper>
    )

}

// Unified item type for merged manga list (regular + synthetic)
type UnifiedMangaItem = {
    type: "regular" | "synthetic"
    mediaId: number
    title: string
    coverImage: string | undefined
    bannerImage: string | undefined
    lastReadAt: Date | null
    entry?: Manga_CollectionList["entries"] extends (infer E)[] | undefined ? E : never
    syntheticManga?: {
        syntheticId: number
        title: string
        coverImage: string
        chapters: number
    }
}

const CollectionListItem = memo(({ list, storedProviders, showStatuses, type, withTitle, onHoverImage, hideTitle }: {
    list: Manga_CollectionList,
    storedProviders: Record<string, string>,
    showStatuses?: AL_MediaListStatus[],
    type?: "carousel" | "grid",
    withTitle?: boolean,
    onHoverImage?: (imageUrl: string | null) => void
    /** The tabs above already name this list. */
    hideTitle?: boolean
}) => {

    const ts = useThemeSettings()
    const [currentHeaderImage, setCurrentHeaderImage] = useAtom(__mangaLibraryHeaderImageAtom)
    const headerManga = useAtomValue(__mangaLibraryHeaderMangaAtom)
    const [params, setParams] = useAtom(__mangaLibrary_paramsAtom)
    const router = useRouter()

    const { mutate: refetchMangaChapterContainers, isPending: isRefetchingMangaChapterContainers } = useRefetchMangaChapterContainers()

    const { inject, remove } = useSeaCommandInject()

    // Fetch reading history and synthetic manga for CURRENT list
    const { data: readingHistory } = useGetMangaReadingHistory()
    const { data: syntheticMangaList } = useGetRecentlyReadSyntheticManga()

    // Until an order is picked, Currently reading keeps its own most-recently-read order; once one is,
    // every list follows it. "Last read" is applied here because reading history lives here.
    const mangaSort = useMangaLibrarySort()
    const byLastRead = !mangaSort.isChosen || mangaSort.sorting === "LAST_READ" || mangaSort.sorting === "LAST_READ_DESC"
    const lastReadDesc = mangaSort.sorting !== "LAST_READ"

    const sortedEntries = React.useMemo(() => {
        if (!list.entries || list.type === "CURRENT") return list.entries
        if (mangaSort.sorting !== "LAST_READ" && mangaSort.sorting !== "LAST_READ_DESC") return list.entries
        const readAt = new Map<number, number>()
        for (const h of readingHistory ?? []) readAt.set(h.mediaId, new Date(h.lastReadAt).getTime())
        return sortMissingLast(list.entries, e => readAt.get(e.mediaId), mangaSort.sorting === "LAST_READ_DESC")
    }, [list.entries, list.type, mangaSort.sorting, readingHistory])

    // Create a merged and sorted list for CURRENT type
    const mergedEntries = React.useMemo((): UnifiedMangaItem[] => {
        if (list.type !== "CURRENT") return []

        const historyMap = new Map<number, Date>()
        if (readingHistory) {
            for (const h of readingHistory) {
                historyMap.set(h.mediaId, new Date(h.lastReadAt))
            }
        }

        const items: UnifiedMangaItem[] = []

        // Add regular manga entries
        if (list.entries) {
            for (const entry of list.entries) {
                items.push({
                    type: "regular",
                    mediaId: entry.mediaId,
                    title: displayTitle(entry.media?.title),
                    coverImage: entry.media?.coverImage?.large || entry.media?.coverImage?.medium,
                    bannerImage: entry.media?.bannerImage,
                    lastReadAt: historyMap.get(entry.mediaId) || null,
                    entry,
                })
            }
        }

        // Add synthetic manga entries
        if (syntheticMangaList) {
            for (const sm of syntheticMangaList) {
                // Check if already in list (shouldn't be, but just in case)
                if (!items.some(i => i.mediaId === sm.syntheticId)) {
                    items.push({
                        type: "synthetic",
                        mediaId: sm.syntheticId,
                        title: sm.title,
                        coverImage: sm.coverImage,
                        bannerImage: undefined,
                        lastReadAt: historyMap.get(sm.syntheticId) || null,
                        syntheticManga: {
                            syntheticId: sm.syntheticId,
                            title: sm.title,
                            coverImage: sm.coverImage,
                            chapters: sm.chapters,
                        },
                    })
                }
            }
        }

        // By last read (most recent first unless reversed), items without history at the end. Under any
        // other order the regular entries keep the order the list was sorted into and the synthetic
        // ones, which that sort never saw, follow them.
        if (byLastRead) {
            return sortMissingLast(items, i => i.lastReadAt?.getTime(), lastReadDesc)
        }

        return items
    }, [list.type, list.entries, readingHistory, syntheticMangaList, byLastRead, lastReadDesc])

    React.useEffect(() => {
        if (list.type === "CURRENT") {
            // Not simply the first: that one often has no banner, which would leave the page without one.
            const firstBanner = mergedEntries.find(item => !!item.bannerImage)?.bannerImage
            if (currentHeaderImage === null && firstBanner) {
                setCurrentHeaderImage(firstBanner)
            }
        }
    }, [mergedEntries])

    // Inject command for currently reading manga
    React.useEffect(() => {
        if (list.type === "CURRENT" && mergedEntries.length) {
            inject("currently-reading-manga", {
                items: mergedEntries.map(item => ({
                    data: item,
                    id: `manga-${item.mediaId}`,
                    value: item.title,
                    heading: "Currently Reading",
                    priority: 100,
                    render: () => {
                        if (item.type === "regular" && item.entry) {
                            return <CommandItemMedia media={item.entry.media!} type="manga" />
                        }
                        if (item.type === "synthetic" && item.syntheticManga) {
                            return <CommandItemSyntheticManga manga={item.syntheticManga as any} />
                        }
                        return null
                    },
                    onSelect: () => {
                        router.push(`/manga/entry?id=${item.mediaId}`)
                    },
                })),
                filter: ({ item, input }: { item: SeaCommandInjectableItem, input: string }) => {
                    if (!input) return true
                    const data = item.data as UnifiedMangaItem
                    return data.title.toLowerCase().includes(input.toLowerCase())
                },
                priority: 100,
            })
        }

        return () => remove("currently-reading-manga")
    }, [mergedEntries])

    // For non-CURRENT lists, use original entries
    const displayEntries = list.type === "CURRENT" ? mergedEntries : null

    return (
        <React.Fragment>

            <div className={cn("flex gap-3 items-center", hideTitle && list.type !== "CURRENT" && "hidden")} data-manga-library-view-collection-list-item-header-container>
                {!hideTitle && <h2 data-manga-library-view-collection-list-item-header-title>{list.type === "CURRENT" ? "Currently reading" : getMangaCollectionTitle(
                    list.type)}</h2>}
                <div className="flex flex-1" data-manga-library-view-collection-list-item-header-spacer></div>

                {list.type === "CURRENT" && params.unreadOnly && (
                    <Button
                        intent="white-link"
                        size="xs"
                        className="!px-2 !py-1"
                        onClick={() => {
                            setParams(draft => {
                                draft.unreadOnly = false
                                return
                            })
                        }}
                    >
                        Show all
                    </Button>
                )}

                {list.type === "CURRENT" && <DropdownMenu
                    trigger={<div className="relative">
                        <IconButton
                            intent="white-basic"
                            size="xs"
                            className="mt-1"
                            icon={<BiDotsVertical />}
                            // loading={isRefetchingMangaChapterContainers}
                        />
                        {/*{params.unreadOnly && <div className="absolute -top-1 -right-1 bg-[--blue] size-2 rounded-full"></div>}*/}
                        {isRefetchingMangaChapterContainers &&
                            <div className="absolute -top-1 -right-1 bg-[--orange] size-3 rounded-full animate-ping"></div>}
                    </div>}
                >
                    <DropdownMenuItem
                        onClick={() => {
                            if (isRefetchingMangaChapterContainers) return

                            toast.info("Refetching from sources...")
                            refetchMangaChapterContainers({
                                selectedProviderMap: storedProviders,
                            })
                        }}
                    >
                        <LuRefreshCcw /> {isRefetchingMangaChapterContainers ? "Refetching..." : "Refresh sources"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            setParams(draft => {
                                draft.unreadOnly = !draft.unreadOnly
                                return
                            })
                        }}
                    >
                        <LuBookOpenCheck /> {params.unreadOnly ? "Show all" : "Unread chapters only"}
                    </DropdownMenuItem>
                </DropdownMenu>}

            </div>

            {(list.type === "CURRENT" && ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Dynamic && headerManga && withTitle) &&
                <TextGenerateEffect
                    data-manga-library-view-collection-list-item-header-media-title
                    words={displayTitle(headerManga?.title)}
                    className="w-full text-xl lg:text-5xl lg:max-w-[50%] h-[3.2rem] !mt-1 line-clamp-1 truncate text-ellipsis hidden lg:block pb-1"
                />
            }

            {/* CURRENT list: Use merged entries sorted by reading history */}
            {list.type === "CURRENT" && type === "grid" && displayEntries && (
                <PaginatedMediaGrid type="manga"
                    items={displayEntries}
                    renderItem={item => {
                        if (item.type === "regular" && item.entry) {
                            return (
                                <div key={item.entry.media?.id}>
                                    <MediaEntryCard
                                        media={item.entry.media!}
                                        listData={item.entry.listData}
                                        downloadedChapterCount={item.entry.downloadedChapterCount}
                                        showListDataButton
                                        withAudienceScore={false}
                                        type="manga"
                                        onHoverImage={onHoverImage}
                                    />
                                </div>
                            )
                        }
                        if (item.type === "synthetic" && item.syntheticManga) {
                            return (
                                <div
                                    key={`synthetic-${item.syntheticManga.syntheticId}`}
                                    className="cursor-pointer"
                                    onClick={() => router.push(`/manga/entry?id=${item.syntheticManga!.syntheticId}`)}
                                >
                                    <div className="relative aspect-[2/3] rounded-[--radius-md] overflow-hidden group">
                                        <SeaImage
                                            src={item.syntheticManga.coverImage || ""}
                                            alt={item.syntheticManga.title}
                                            fill
                                            className="object-cover object-center transition-transform group-hover:scale-105"
                                            placeholder={imageShimmer(200, 300)}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                        <div className="absolute bottom-0 left-0 right-0 p-3">
                                            <p className="text-sm font-medium text-white line-clamp-2">{item.syntheticManga.title}</p>
                                            <Badge intent="warning" size="sm" className="mt-1 gap-1">
                                                <LuSparkles className="text-xs" />
                                                Synthetic
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            )
                        }
                        return null
                    }}
                />
            )}

            {list.type === "CURRENT" && type === "carousel" && displayEntries && (
                <Carousel
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
                        {displayEntries.map(item => {
                            if (item.type === "regular" && item.entry) {
                                return (
                                    <div
                                        key={item.entry.media?.id}
                                        className="relative sea-card-item sea-card-manga col-span-1 place-content-stretch flex-none mx-2 mt-8 mb-0"
                                    >
                                        <MediaEntryCard
                                            media={item.entry.media!}
                                            listData={item.entry.listData}
                                            downloadedChapterCount={item.entry.downloadedChapterCount}
                                            showListDataButton
                                            withAudienceScore={false}
                                            type="manga"
                                            onHoverImage={onHoverImage}
                                        />
                                    </div>
                                )
                            }
                            if (item.type === "synthetic" && item.syntheticManga) {
                                return (
                                    <div
                                        key={`synthetic-${item.syntheticManga.syntheticId}`}
                                        className="relative sea-card-item sea-card-manga col-span-1 place-content-stretch flex-none mx-2 mt-8 mb-0 cursor-pointer"
                                        onClick={() => router.push(`/manga/entry?id=${item.syntheticManga!.syntheticId}`)}
                                    >
                                        <div className="relative aspect-[2/3] rounded-[--radius-md] overflow-hidden group">
                                            <SeaImage
                                                src={item.syntheticManga.coverImage || ""}
                                                alt={item.syntheticManga.title}
                                                fill
                                                className="object-cover object-center transition-transform group-hover:scale-105"
                                                placeholder={imageShimmer(200, 300)}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                            <div className="absolute bottom-0 left-0 right-0 p-3">
                                                <p className="text-sm font-medium text-white line-clamp-2">{item.syntheticManga.title}</p>
                                                <Badge intent="warning" size="sm" className="mt-1 gap-1">
                                                    <LuSparkles className="text-xs" />
                                                    Synthetic
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }
                            return null
                        })}
                    </CarouselContent>
                </Carousel>
            )}

            {/* Non-CURRENT lists: Use original entries */}
            {list.type !== "CURRENT" && type === "grid" && (
                <PaginatedMediaGrid type="manga"
                    items={sortedEntries}
                    renderItem={entry => (
                        <div key={entry.media?.id}>
                            <MediaEntryCard
                                media={entry.media!}
                                listData={entry.listData}
                                downloadedChapterCount={entry.downloadedChapterCount}
                                showListDataButton
                                withAudienceScore={false}
                                type="manga"
                                onHoverImage={onHoverImage}
                            />
                        </div>
                    )}
                />
            )}

            {list.type !== "CURRENT" && type === "carousel" && (
                <Carousel
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
                        {sortedEntries?.map(entry => {
                            return <div
                                key={entry.media?.id}
                                className="relative sea-card-item sea-card-manga col-span-1 place-content-stretch flex-none mx-2 mt-8 mb-0"
                            >
                                <MediaEntryCard
                                    media={entry.media!}
                                    listData={entry.listData}
                                    downloadedChapterCount={entry.downloadedChapterCount}
                                    showListDataButton
                                    withAudienceScore={false}
                                    type="manga"
                                    onHoverImage={onHoverImage}
                                />
                            </div>
                        })}
                    </CarouselContent>
                </Carousel>
            )}
        </React.Fragment>
    )
})

function GenreSelector({
    genres,
    className,
}: { genres: string[], className?: string }) {
    const [params, setParams] = useAtom(__mangaLibrary_paramsInputAtom)
    const setActualParams = useSetAtom(__mangaLibrary_paramsAtom)
    const debouncedParams = useDebounce(params, 200)

    React.useEffect(() => {
        setActualParams(params)
    }, [debouncedParams])

    if (!genres.length) return null

    return (
        <MediaGenreSelector
            className={cn(className)}
            // className="bg-gray-950 border p-0 rounded-xl mx-auto"
            staticTabsClass=""
            items={[
                ...genres.map(genre => ({
                    name: genre,
                    isCurrent: params!.genre?.includes(genre) ?? false,
                    onClick: () => setParams(draft => {
                        if (draft.genre?.includes(genre)) {
                            draft.genre = draft.genre?.filter(g => g !== genre)
                        } else {
                            draft.genre = [...(draft.genre || []), genre]
                        }
                        return
                    }),
                })),
            ]}
        />
    )
}
