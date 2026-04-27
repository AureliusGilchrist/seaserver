import { AL_MediaListStatus, Manga_Collection, Manga_CollectionList } from "@/api/generated/types"
import { useGetMangaReadingHistory, useGetRecentlyReadSyntheticManga, useRefetchMangaChapterContainers } from "@/api/hooks/manga.hooks"
import { MediaCardLazyGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
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
        if (!showStatuses) return true
        return list.type && showStatuses.includes(list.type)
    })

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
            {lists?.map(collection => {
                if (!collection.entries?.length) return null
                return (
                    <React.Fragment key={collection.type}>
                        <CollectionListItem
                            list={collection}
                            storedProviders={storedProviders}
                            showStatuses={showStatuses}
                            type={type}
                            withTitle={withTitle}
                            onHoverImage={onHoverImage}
                        />

                        {(collection.type === "CURRENT" && !!genres?.length) && <GenreSelector genres={genres} className="!my-0" />}
                    </React.Fragment>
                )
            })}
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

            {type === "grid" && <MediaCardLazyGrid itemCount={entries?.length || 0}>
                {entries.map(entry => {
                    return <div
                        key={entry.media?.id}
                    >
                        <MediaEntryCard
                            media={entry.media!}
                            listData={entry.listData}
                            showListDataButton
                            withAudienceScore={false}
                            type="manga"
                            onHoverImage={onHoverImage}
                        />
                    </div>
                })}
            </MediaCardLazyGrid>}
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
                            showListDataButton
                            withAudienceScore={false}
                            type="manga"
                            containerClassName={type === "carousel" ? "basis-[200px] md:basis-[250px] mx-2 mt-8 mb-0" : undefined}
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

const CollectionListItem = memo(({ list, storedProviders, showStatuses, type, withTitle, onHoverImage }: {
    list: Manga_CollectionList,
    storedProviders: Record<string, string>,
    showStatuses?: AL_MediaListStatus[],
    type?: "carousel" | "grid",
    withTitle?: boolean,
    onHoverImage?: (imageUrl: string | null) => void
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

        // Sort by lastReadAt (most recent first), items without history go to end
        items.sort((a, b) => {
            if (a.lastReadAt && b.lastReadAt) {
                return b.lastReadAt.getTime() - a.lastReadAt.getTime()
            }
            if (a.lastReadAt) return -1
            if (b.lastReadAt) return 1
            return 0
        })

        return items
    }, [list.type, list.entries, readingHistory, syntheticMangaList])

    React.useEffect(() => {
        if (list.type === "CURRENT") {
            const firstItem = mergedEntries[0]
            if (currentHeaderImage === null && firstItem?.bannerImage) {
                setCurrentHeaderImage(firstItem.bannerImage)
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

            <div className="flex gap-3 items-center" data-manga-library-view-collection-list-item-header-container>
                <h2 data-manga-library-view-collection-list-item-header-title>{list.type === "CURRENT" ? "Continue reading" : getMangaCollectionTitle(
                    list.type)}</h2>
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
                <MediaCardLazyGrid itemCount={displayEntries.length}>
                    {displayEntries.map(item => {
                        if (item.type === "regular" && item.entry) {
                            return (
                                <div
                                    key={item.entry.media?.id}
                                    onMouseEnter={() => {
                                        if (item.bannerImage) {
                                            React.startTransition(() => {
                                                setCurrentHeaderImage(item.bannerImage!)
                                            })
                                        }
                                    }}
                                >
                                    <MediaEntryCard
                                        media={item.entry.media!}
                                        listData={item.entry.listData}
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
                    })}
                </MediaCardLazyGrid>
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
                                        className="relative basis-[200px] col-span-1 place-content-stretch flex-none md:basis-[250px] mx-2 mt-8 mb-0"
                                        onMouseEnter={() => {
                                            if (item.bannerImage) {
                                                React.startTransition(() => {
                                                    setCurrentHeaderImage(item.bannerImage!)
                                                })
                                            }
                                        }}
                                    >
                                        <MediaEntryCard
                                            media={item.entry.media!}
                                            listData={item.entry.listData}
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
                                        className="relative basis-[200px] col-span-1 place-content-stretch flex-none md:basis-[250px] mx-2 mt-8 mb-0 cursor-pointer"
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
                <MediaCardLazyGrid itemCount={list.entries?.length ?? 0}>
                    {list.entries?.map(entry => {
                        return <div
                            key={entry.media?.id}
                        >
                            <MediaEntryCard
                                media={entry.media!}
                                listData={entry.listData}
                                showListDataButton
                                withAudienceScore={false}
                                type="manga"
                                onHoverImage={onHoverImage}
                            />
                        </div>
                    })}
                </MediaCardLazyGrid>
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
                        {list.entries?.map(entry => {
                            return <div
                                key={entry.media?.id}
                                className="relative basis-[200px] col-span-1 place-content-stretch flex-none md:basis-[250px] mx-2 mt-8 mb-0"
                            >
                                <MediaEntryCard
                                    media={entry.media!}
                                    listData={entry.listData}
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

