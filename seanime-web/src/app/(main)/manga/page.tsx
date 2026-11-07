"use client"

import { MangaHomeInsights } from "@/app/(main)/_features/home/medium-home-insights"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { Manga_CollectionEntry, Manga_CollectionList } from "@/api/generated/types"
import { MediaCardLazyGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
import { PaginatedMediaGrid } from "@/app/(main)/_features/media/_components/paginated-media-grid"
import { MangaBadge, MangaSyntheticOutline, SYNTHETIC_CARD_CLASS } from "@/app/(main)/_features/media/_components/manga-badge"
import { useMangaBadgeState } from "@/app/(main)/_atoms/manga-badges.atoms"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { MediaEntryPageLoadingDisplay } from "@/app/(main)/_features/media/_components/media-entry-page-loading-display"
import { MangaLibraryHeader } from "@/app/(main)/manga/_components/library-header"
import { MangaHomeToolbar } from "@/app/(main)/manga/_components/manga-home-toolbar"
import { useHandleMangaCollection } from "@/app/(main)/manga/_lib/handle-manga-collection"
import { useMangaCoverProxy } from "@/app/(main)/manga/_lib/use-manga-cover-proxy"
import { useMangaFavorites } from "@/app/(main)/manga/_lib/use-manga-favorites"
import { useGetMangaDownloadsList } from "@/api/hooks/manga_download.hooks"
import { useMangaDownloadsSnapshot } from "@/app/(main)/manga/_lib/use-manga-downloads-snapshot"
import { formatNumber } from "@/lib/helpers/number"
import { MangaLibraryView } from "@/app/(main)/manga/_screens/manga-library-view"
import { MangaCarousel, MyLists } from "@/app/(main)/(library)/_home/home-screen"
import { HomeSections } from "@/app/(main)/_features/home/home-sections"
import { HomeStatsStrip } from "@/app/(main)/_features/home/home-stats-strip"
import { MangaHomeSettingsModal, DEFAULT_MANGA_HOME_ITEMS, normalizeMangaHomeItems } from "@/app/(main)/manga/_components/manga-home-settings"
import { MangaContinueReading } from "@/app/(main)/manga/_containers/manga-continue-reading"
import { MangaContinueReadingHeader } from "@/app/(main)/manga/_containers/manga-continue-reading-header"
import { MangaDiscoverHeader } from "@/app/(main)/manga/_containers/manga-discover-header"
import { MangaUpcomingChapters } from "@/app/(main)/manga/_containers/manga-upcoming-chapters"
import { MangaRecentlyReleased } from "@/app/(main)/manga/_containers/manga-recently-released"
import { useGetMangaHomeItems } from "@/api/hooks/status.hooks"
import { MangaContinueReadingEntry, useMangaContinueReadingList } from "@/app/(main)/manga/_lib/use-manga-continue-reading"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { Alert } from "@/components/ui/alert/alert"
import { Button } from "@/components/ui/button"
import { LuBookMarked, LuBookOpen, LuBookOpenCheck, LuDownload, LuEye, LuFiles, LuImage, LuLibrary, LuStar } from "react-icons/lu"
import { cn } from "@/components/ui/core/styling"
import { Skeleton } from "@/components/ui/skeleton"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { ThemeLibraryScreenBannerType, useThemeSettings } from "@/lib/theme/hooks"
import { __isDesktop__ } from "@/types/constants"
import { displayTitle } from "@/lib/helpers/media"
import { LibrarySortMenu, useLibrarySort } from "@/app/(main)/_features/sorting/library-sort-menu"
import {
    LibrarySortField,
    SORT_FIELD_AIRING_STATUS,
    SORT_FIELD_AVERAGE_SCORE,
    SORT_FIELD_RELEASE_DATE,
    SORT_FIELD_SCORE,
    SORT_FIELD_TITLE,
    sortByMediaField,
    sortMissingLast,
} from "@/lib/helpers/filtering"

/** The downloads grid: what is on disk, ordered by title until the viewer picks otherwise. */
const LOCAL_MANGA_LIBRARY_SORT_FIELDS: LibrarySortField[] = [
    SORT_FIELD_TITLE,
    SORT_FIELD_RELEASE_DATE,
    { label: "Downloaded chapters", asc: "DOWNLOADED_CHAPTERS", desc: "DOWNLOADED_CHAPTERS_DESC", ascLabel: "Fewest first", descLabel: "Most first", defaultDesc: true },
    SORT_FIELD_SCORE,
    SORT_FIELD_AVERAGE_SCORE,
    SORT_FIELD_AIRING_STATUS,
]
import { AnimatePresence } from "motion/react"
import { useAtomValue } from "jotai/react"
import { useWindowSize } from "react-use"
import React from "react"

export const dynamic = "force-static"

/**
 * A download with no cover art yet. Same poster shape as a real card, so a library with some
 * metadata missing still reads as one grid rather than as cards with text tiles wedged between
 * them. Draws its own badge (and synthetic outline), because a tile with no cover art is not a card.
 */
function NoCoverMangaTile(props: {
    mediaId: number
    title: string
    provider: string | undefined
    chapters: number
    onHoverImage: (url: string | null) => void
}) {
    const { mediaId, title, provider, chapters, onHoverImage } = props
    const { isSynthetic } = useMangaBadgeState(mediaId)

    return (
        <SeaLink
            href={`/manga/entry?id=${mediaId}`}
            className="block h-full group/dl-card"
            onMouseEnter={() => onHoverImage(null)}
            onMouseLeave={() => onHoverImage(null)}
        >
            <div
                data-synthetic={isSynthetic || undefined}
                title={isSynthetic ? "Synthetic — described locally rather than from AniList" : undefined}
                className={cn(
                    "relative aspect-[6/7] w-full overflow-hidden rounded-[--radius-md]",
                    "bg-gray-900/70",
                    "flex flex-col items-center justify-center gap-2",
                    "transition group-hover/dl-card:bg-gray-900",
                    isSynthetic
                        ? SYNTHETIC_CARD_CLASS
                        : "border border-gray-800 group-hover/dl-card:border-gray-600",
                )}
            >
                {isSynthetic && <MangaSyntheticOutline />}
                <LuBookMarked className={cn("text-4xl", isSynthetic ? "text-orange-400/40" : "text-gray-700")} />
                <p className="px-3 text-center text-xs text-[--muted]">No cover art</p>

                <div className="absolute inset-x-0 top-0 flex justify-between">
                    <MangaBadge mediaId={mediaId} variant="overlay" className="!relative" />
                    <p className="ml-auto font-semibold text-white bg-gray-950 bg-opacity-90 px-3 py-1 text-xs rounded-bl-lg">
                        {formatNumber(chapters)} chapter{chapters === 1 ? "" : "s"}
                    </p>
                </div>
            </div>

            <div className="pt-2 space-y-0.5">
                <p className="text-sm font-semibold text-white line-clamp-2">{title}</p>
                {provider && <p className="text-xs text-[--muted]">Provider: {provider}</p>}
            </div>
        </SeaLink>
    )
}

export default function Page() {
    const { data: mangaHomeItems } = useGetMangaHomeItems()
    // Carousel slots sized by the manga card width (Personal -> Display).
    const cardSizeClass = "sea-card-slot sea-card-manga"
    const { width } = useWindowSize()
    const {
        mangaCollection,
        filteredMangaCollection,
        mangaCollectionLoading,
        mangaCollectionError,
        refetchMangaCollection,
        storedFilters,
        storedProviders,
        mangaCollectionGenres,
        hasManga,
    } = useHandleMangaCollection()
    const { favorites } = useMangaFavorites()

    const favoritesMedia = React.useMemo(() => {
        if (!favorites?.length) return [] as any[]
        const entries = mangaCollection?.lists?.flatMap(l => l.entries).filter(Boolean) || []
        return favorites
            .map(id => entries.find(e => Number((e as any)?.media?.id) === Number(id))?.media)
            .filter(Boolean)
    }, [favorites, mangaCollection])

    const ts = useThemeSettings()
    const handleHoverImage = React.useCallback((_image: string | null) => undefined, [])

    // No hover-driven wallpaper here — the theme's background stays put, and the only banners are
    // the continue-reading header's and the library header's, which belong to headers, not to
    // whatever the cursor last crossed.

    const { data: liveDownloadedList, isLoading: liveDownloadsLoading, isError: downloadsError } = useGetMangaDownloadsList()
    // Last visit's list until the server answers, so the library and its stats paint at once.
    const downloadsSnapshot = useMangaDownloadsSnapshot(liveDownloadedList)
    const downloadedList = liveDownloadedList ?? downloadsSnapshot
    const downloadsLoading = liveDownloadsLoading && !downloadsSnapshot
    const [downloadSearch, setDownloadSearch] = React.useState("")

    const downloadedWithMedia = React.useMemo(() => (downloadedList || []).filter(d => !!d.media), [downloadedList])

    // Provider cover art is routed through the server's image proxy — see useMangaCoverProxy. Done
    // once here rather than per card so the objects the cards receive keep a stable identity.
    const { withProxiedCover } = useMangaCoverProxy()
    const proxiedDownloads = React.useMemo(() => {
        const list = downloadedList || []
        let changed = false
        const mapped = list.map(item => {
            const media = withProxiedCover(item.media)
            if (media === item.media) return item
            changed = true
            return { ...item, media }
        })
        return changed ? mapped : list
    }, [downloadedList, withProxiedCover])

    const localMangaSort = useLibrarySort("local-manga-library", "TITLE")
    const filteredDownloads = React.useMemo(() => {
        const list = proxiedDownloads
        const q = downloadSearch.trim().toLowerCase()
        const filtered = !q ? list : list.filter(item => displayTitle(item.media?.title).toLowerCase().includes(q))

        // Sort a copy, never the array itself.
        //
        // With an empty search box `filtered` IS the query's cached array, and Array.sort sorts in
        // place — so this was reordering React Query's cache during render. The cache is compared
        // against the next response to decide what changed, so a mutated one made every refetch look
        // like a different list: new array identity, new object identities, every memo below
        // invalidated and every card unmounted and remounted. That is the library reshuffling itself
        // every few seconds.
        const byTitle = [...filtered].sort((a, b) => {
            const titleA = displayTitle(a.media?.title) || `Unknown ${a.mediaId}`
            const titleB = displayTitle(b.media?.title) || `Unknown ${b.mediaId}`
            return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: "base" })
        })
        // Every other order starts from title order, so ties read alphabetically.
        const sorting = localMangaSort.sorting
        switch (sorting) {
            case "TITLE":
                return byTitle
            case "TITLE_DESC":
                return byTitle.reverse()
            case "DOWNLOADED_CHAPTERS":
            case "DOWNLOADED_CHAPTERS_DESC":
                return sortMissingLast(byTitle, n => Object.values(n.downloadData ?? {}).flatMap(c => c).length,
                    sorting === "DOWNLOADED_CHAPTERS_DESC")
            case "SCORE":
            case "SCORE_DESC":
                return sortMissingLast(byTitle, n => n.listData?.score || undefined, sorting === "SCORE_DESC")
        }
        return sortByMediaField(byTitle, sorting, n => n.media ?? undefined) ?? byTitle
    }, [downloadSearch, proxiedDownloads, localMangaSort.sorting])
    const downloadedChaptersTotal = React.useMemo(() => downloadedList?.reduce((acc, d) => acc + Object.values(d.downloadData).flatMap(n => n).length, 0) || 0, [downloadedList])

    // Pre-compute filtered downloads for all possible source filters
    const sourceFilteredDownloadsMap = React.useMemo(() => {
        const map: Record<string, typeof filteredDownloads> = {
            both: filteredDownloads,
            synthetic: filteredDownloads.filter(download => {
                const isSynthetic = (download.media?.id !== undefined && download.media.id < 0) || Object.keys(download.downloadData || {}).includes("weebcentral")
                return isSynthetic
            }),
            anilist: filteredDownloads.filter(download => {
                const isSynthetic = (download.media?.id !== undefined && download.media.id < 0) || Object.keys(download.downloadData || {}).includes("weebcentral")
                return !isSynthetic
            }),
        }
        return map
    }, [filteredDownloads])

    const homeItems = React.useMemo(() => {
        let ret = normalizeMangaHomeItems(mangaHomeItems?.length ? mangaHomeItems : DEFAULT_MANGA_HOME_ITEMS)
        // Saved layouts that predate the stats row get it right above the library.
        if (!ret.some(n => n.type === "local-manga-library-stats")) {
            const libIdx = ret.findIndex(n => n.type === "manga-library")
            if (libIdx >= 0) {
                ret = [...ret.slice(0, libIdx), { id: "local-manga-library-stats", type: "local-manga-library-stats", schemaVersion: 1 }, ...ret.slice(libIdx)]
            }
        }
        // The header's banner, metadata block and chapter card are all lg-only, so below lg the
        // header collapses to an empty block — the same reason the anime home swaps its
        // continue-watching header for the carousel on mobile.
        if (width < 1024 && ret[0]?.type === "manga-continue-reading-header") {
            if (ret.find(n => n.type === "manga-continue-reading")) {
                // remove any other continue reading section
                ret = ret.filter(n => n.type !== "manga-continue-reading")
            }
            return ret.map(item => {
                if (item.type === "manga-continue-reading-header") {
                    return {
                        ...item,
                        type: "manga-continue-reading",
                    }
                }
                return item
            })
        }
        return ret
    }, [mangaHomeItems, width < 1024])

    // The continue-reading list, built once here and handed to the header and the section —
    // the collection the way the anime home's continue-watching list is, not the reading history
    // alone, whose media enrichment can come back empty and leave both blank.
    const { entries: continueReadingList } = useMangaContinueReadingList()
    const hasContinueReadingHeader = continueReadingList.some(entry => !!entry.media)
    // The continue-reading header is always first, and it has nothing to draw when nothing is in
    // progress. The library's banner takes its place, so the page never loses its hero.
    const showLibraryBanner = ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Dynamic && (
        homeItems[0]?.type === "manga-library"
        || (homeItems[0]?.type === "manga-continue-reading-header" && !hasContinueReadingHeader)
    )

    if (mangaCollectionError && !mangaCollection) {
        return (
            <>
                <CustomLibraryBanner discrete />
                <PageWrapper className="p-4 sm:p-8">
                    <div className="mx-auto flex max-w-2xl flex-col items-start gap-4">
                        <Alert
                            intent="alert"
                            title="Could not load the manga library"
                            description={mangaCollectionError.message || "The manga collection request failed."}
                            className="w-full"
                        />
                        <Button intent="gray-outline" onClick={() => { void refetchMangaCollection() }}>
                            Retry
                        </Button>
                    </div>
                </PageWrapper>
            </>
        )
    }

    // Loading state - matching anime home screen skeleton
    if (!mangaCollection || mangaCollectionLoading) {
        return (
            <React.Fragment>
                <div className="p-4 space-y-4 relative z-[4]">
                    <Skeleton className="h-12 w-full max-w-lg relative" />
                    <div
                        className={cn(
                            "sea-card-grid sea-card-manga max-h-[calc(var(--sea-card-w)*4/3)] overflow-hidden",
                        )}
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8]?.map((_, idx) => {
                            return <Skeleton
                                key={idx} className={cn(
                                "col-span-1 aspect-[6/8] flex-none rounded-[--radius-md] relative overflow-hidden",
                                "[&:nth-child(8)]:hidden min-[2000px]:[&:nth-child(8)]:block",
                                "[&:nth-child(7)]:hidden 2xl:[&:nth-child(7)]:block",
                                "[&:nth-child(6)]:hidden xl:[&:nth-child(6)]:block",
                                "[&:nth-child(5)]:hidden xl:[&:nth-child(5)]:block",
                                "[&:nth-child(4)]:hidden lg:[&:nth-child(4)]:block",
                                "[&:nth-child(3)]:hidden md:[&:nth-child(3)]:block",
                            )}
                            />
                        })}
                    </div>
                </div>
            </React.Fragment>
        )
    }

    return (
        <div
            data-manga-page-container
            data-stored-filters={JSON.stringify(storedFilters)}
            data-stored-providers={JSON.stringify(storedProviders)}
            className="relative"
        >
            <div className="relative z-[1]">

                {/* Manga Discover Header - if first item */}
                {homeItems[0]?.type === "manga-discover-header" && (
                    <MangaDiscoverHeader cardSizeClass={cardSizeClass} />
                )}

                {/* Manga Continue Reading Header - if first item. The full header — banner, card,
                    description, genres, the chapter card on the right — the way the anime home
                    screen's is. It renders in flow (a tall block), which is also what keeps the
                    toolbar below it out of the window's title bar. */}
                {homeItems[0]?.type === "manga-continue-reading-header" && hasContinueReadingHeader && (
                    <MangaContinueReadingHeader list={continueReadingList} />
                )}

                {/* Manga Library Header - dynamic banner only when manga-library is first */}
                {showLibraryBanner && (
                    <MangaLibraryHeader manga={mangaCollection?.lists?.flatMap(l => l.entries)?.flatMap(e => e?.media)?.filter(Boolean) || []} />
                )}

                {/* Top padding for mobile */}
                <div
                    className={cn(
                        "h-12 lg:hidden",
                    )}
                    data-manga-toolbar-top-padding
                ></div>

                {/* Top padding for dynamic banner */}
                {(showLibraryBanner && hasManga) && <div
                    className={cn(
                        "h-28",
                        ts.hideTopNavbar && "h-40",
                    )}
                    data-manga-toolbar-top-padding
                ></div>}

                {/* When nothing above puts space between the toolbar and the window's title bar —
                    no header item first, no banner — the toolbar would sit at the very top of the
                    page, inside the desktop title bar's drag strip, where its buttons cannot be
                    pressed. A header item first is the shape the anime home screen has; this spacer
                    covers every other arrangement. */}
                {(
                    homeItems[0]?.type !== "manga-discover-header"
                    && !(homeItems[0]?.type === "manga-continue-reading-header" && hasContinueReadingHeader)
                    && !(showLibraryBanner && hasManga)
                    && !(!!ts.libraryScreenCustomBannerImage && ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Custom && homeItems[0]?.type !== "manga-discover-header" && !(homeItems[0]?.type === "manga-continue-reading-header" && hasContinueReadingHeader))
                ) && <div
                    className={cn(
                        "h-14",
                        ts.hideTopNavbar && "h-20",
                    )}
                    data-manga-toolbar-top-padding
                ></div>}

                {/* Manga Home Toolbar - same position as anime HomeToolbar. The negative margin
                    only when the header above actually rendered — the anime home conditions it on
                    the list being non-empty the same way, so an empty header never drags the
                    toolbar up into the window's title bar. */}
                <MangaHomeToolbar
                    hasManga={hasManga}
                    className={cn(
                        (homeItems[0]?.type === "manga-discover-header" || (homeItems[0]?.type === "manga-continue-reading-header" && hasContinueReadingHeader)) && "!mt-[-4rem] !mb-[-1rem]",
                    )}
                />

                {/* Custom Library Banner */}
                {(!!ts.libraryScreenCustomBannerImage
                    && ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Custom
                    && homeItems[0]?.type !== "manga-discover-header"
                    && !(homeItems[0]?.type === "manga-continue-reading-header" && hasContinueReadingHeader)
                ) && <div
                    data-custom-library-banner-top-spacer
                    className={cn(
                        "py-20",
                        ts.hideTopNavbar && "py-28",
                    )}
                ></div>}

                {(
                    hasManga &&
                    ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Custom
                    && homeItems[0]?.type !== "manga-discover-header"
                    && !(homeItems[0]?.type === "manga-continue-reading-header" && hasContinueReadingHeader)
                ) && <CustomLibraryBanner isLibraryScreen isHomeScreen />}

                {/* Render manga home items - matching anime home screen pattern */}
                <AnimatePresence mode="wait">
                    <PageWrapper
                        key="manga-home"
                        className="relative 2xl:order-first pb-10 pt-4"
                        {...{
                            initial: { opacity: 0, y: 5 },
                            animate: { opacity: 1, y: 0 },
                            exit: { opacity: 0, scale: 0.99 },
                            transition: {
                                duration: 0.25,
                            },
                        }}
                    >
                        <div className="px-3 pb-6 md:px-5">
                            <MangaHomeInsights
                                // Continue reading sits right under the welcome, above the numbers,
                                // whenever it is one of this home's sections.
                                afterWelcome={homeItems.some(n => n.type === "manga-continue-reading") && continueReadingList.length > 0 && (
                                    <div className="relative z-[1] rounded-3xl border border-white/10 bg-black/20 p-2 shadow-xl shadow-black/20 backdrop-blur-md sm:p-3" data-manga-home-continue-reading>
                                        <MangaContinueReading list={continueReadingList} withTitle withMetadata onHoverImage={handleHoverImage} />
                                    </div>
                                )}
                            />
                        </div>
                        <HomeSections
                            items={homeItems.filter(n => n.type !== "manga-discover-header" && n.type !== "manga-continue-reading-header" && n.type !== "manga-continue-reading")}
                            renderItem={item => (
                                <MangaHomeScreenItem
                                    item={item}
                                    index={homeItems.findIndex(n => n.id === item.id)}
                                    onHoverImage={handleHoverImage}
                                    continueReadingList={continueReadingList}
                                    downloadSearch={downloadSearch}
                                    setDownloadSearch={setDownloadSearch}
                                    sourceFilteredDownloadsMap={sourceFilteredDownloadsMap}
                                    filteredDownloads={filteredDownloads}
                                    downloadsLoading={downloadsLoading}
                                    downloadsError={downloadsError}
                                    downloadedWithMedia={downloadedWithMedia}
                                    downloadedChaptersTotal={downloadedChaptersTotal}
                                    downloadedList={downloadedList}
                                    mangaCollection={mangaCollection}
                                    mangaCollectionLoading={mangaCollectionLoading && !mangaCollection}
                                    filteredMangaCollection={filteredMangaCollection}
                                    mangaCollectionGenres={mangaCollectionGenres}
                                    storedProviders={storedProviders}
                                    hasManga={hasManga}
                                    favoritesMedia={favoritesMedia}
                                    cardSizeClass={cardSizeClass}
                                />
                            )}
                        />

                        <div data-manga-home-item-divider className="h-8" />
                    </PageWrapper>
                </AnimatePresence>

                <MangaHomeSettingsModal />
            </div>
        </div>
    )
}

// ==============================
// Manga Home Screen Item Component
// ==============================

interface MangaHomeScreenItemProps {
    item: any
    index: number
    onHoverImage: (image: string | null) => void
    continueReadingList: MangaContinueReadingEntry[]
    downloadSearch: string
    setDownloadSearch: (value: string) => void
    sourceFilteredDownloadsMap: Record<string, any[]>
    filteredDownloads: any[]
    downloadsLoading: boolean
    downloadsError: boolean
    downloadedWithMedia: any[]
    downloadedChaptersTotal: number
    downloadedList: any[] | undefined
    mangaCollection: any
    mangaCollectionLoading: boolean
    filteredMangaCollection: any
    mangaCollectionGenres: string[]
    storedProviders: any
    hasManga: boolean
    favoritesMedia: any[]
    cardSizeClass: string
}

function MangaHomeScreenItem(props: MangaHomeScreenItemProps) {
    const {
        item,
        index,
        onHoverImage,
        continueReadingList,
        downloadSearch,
        setDownloadSearch,
        sourceFilteredDownloadsMap,
        filteredDownloads,
        downloadsLoading,
        downloadsError,
        downloadedWithMedia,
        downloadedChaptersTotal,
        downloadedList,
        mangaCollection,
        mangaCollectionLoading,
        filteredMangaCollection,
        mangaCollectionGenres,
        storedProviders,
        hasManga,
        favoritesMedia,
        cardSizeClass,
    } = props

    // Same stored order the page sorts the downloads by.
    const localMangaSort = useLibrarySort("local-manga-library", "TITLE")

    // Centered title
    if (item.type === "centered-title") {
        return (
            <h2 data-manga-home-centered-title={item.options?.text} className="text-center text-3xl lg:text-4xl font-bold py-4">
                {item.options?.text}
            </h2>
        )
    }

    // Favorite Manga
    if (item.type === "manga-favorites") {
        return (
            <div className="px-4 py-8 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">Favorite Manga</h2>
                    {!favoritesMedia.length && <span className="text-sm text-[--muted]">No favorites yet</span>}
                </div>

                {!!favoritesMedia.length && (
                    <MediaCardLazyGrid itemCount={favoritesMedia.length} type="manga">
                        {favoritesMedia.map(media => (
                            <MediaEntryCard
                                key={media.id}
                                media={media}
                                type="manga"
                                hideUnseenCountBadge
                                onHoverImage={onHoverImage}
                            />
                        ))}
                    </MediaCardLazyGrid>
                )}
            </div>
        )
    }

    // Manga Library
    if (item.type === "manga-library") {
        return (
            <MangaLibraryView
                genres={mangaCollectionGenres}
                collection={mangaCollection}
                filteredCollection={filteredMangaCollection}
                storedProviders={storedProviders}
                hasManga={hasManga}
                onHoverImage={onHoverImage}
            />
        )
    }

    // Manga Carousel
    if (item.type === "manga-carousel") {
        return (
            <MangaCarousel
                libraryCollectionProps={{
                    libraryGenres: [],
                    isLoading: false,
                    libraryCollectionList: [], allLibraryCollectionList: [],
                    filteredLibraryCollectionList: [],
                    statusCollectionList: [],
                    filteredStatusCollectionList: [],
                    continueWatchingList: [],
                    unmatchedLocalFiles: [],
                    ignoredLocalFiles: [],
                    unmatchedGroups: [],
                    unknownGroups: [],
                    streamingMediaIds: [],
                    hasEntries: false,
                    isStreamingOnly: false,
                    isNakamaLibrary: false,
                }}
                item={item}
                onHoverImage={onHoverImage}
            />
        )
    }

    if (item.type === "my-lists") {
        return <MyLists item={{ ...item, options: { ...item.options, type: item.options?.type ?? "manga" } }} />
    }

    // Manga Continue Reading
    if (item.type === "manga-continue-reading" || item.type === "manga-continue-reading-header") {
        return (
            <MangaContinueReading
                list={continueReadingList}
                onHoverImage={onHoverImage}
            />
        )
    }

    // Local Manga Library (downloads only)
    if (item.type === "local-manga-library") {
        const sourceFilter = item.options?.source || "both"
        const layout = item.options?.layout || "grid"
        
        // Get pre-computed filtered downloads
        const sourceFilteredDownloads = sourceFilteredDownloadsMap[sourceFilter] || filteredDownloads
        
        return (
            <div className="px-4 py-6 space-y-4" data-local-manga-library>
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">
                        Local Library
                        {sourceFilter === "synthetic" && " - Synthetic"}
                        {sourceFilter === "anilist" && " - AniList"}
                    </h2>
                    {downloadsLoading && <span className="text-sm text-[--muted]">Loading…</span>}
                    {downloadsError && <span className="text-sm text-red-400">Failed to load downloads</span>}
                </div>

                {!downloadsLoading && !downloadsError && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <input
                                value={downloadSearch}
                                onChange={(e) => setDownloadSearch(e.target.value)}
                                placeholder="Search downloaded manga"
                                className="min-w-0 flex-1 rounded-full bg-black/25 px-4 py-2 text-sm text-white ring-1 ring-white/10 backdrop-blur-md placeholder:text-white/40 focus:outline-none focus:ring-brand-400/50"
                            />
                            <LibrarySortMenu
                                fields={LOCAL_MANGA_LIBRARY_SORT_FIELDS}
                                value={localMangaSort.sorting}
                                onChange={localMangaSort.setSorting}
                            />
                        </div>

                        {layout === "carousel" ? (
                            <Carousel opts={{ align: "start" }} autoScroll>
                                <CarouselDotButtons />
                                <CarouselContent>
                                    {sourceFilteredDownloads.map(dlItem => {
                                        const chapters = Object.values(dlItem.downloadData).flatMap(n => n).length
                                        if (dlItem.media) {
                                            const hoverImg = dlItem.media?.bannerImage || dlItem.media?.coverImage?.extraLarge || dlItem.media?.coverImage?.large || null
                                            return (
                                                <CarouselItem
                                                    key={dlItem.media?.id}
                                                    className={cn(
                                                        cardSizeClass || "sea-card-slot sea-card-manga",
                                                    )}
                                                >
                                                    <div
                                                        onMouseEnter={() => hoverImg && onHoverImage(hoverImg)}
                                                        onMouseLeave={() => onHoverImage(null)}
                                                    >
                                                        <MediaEntryCard
                                                            media={dlItem.media}
                                                            type="manga"
                                                            listData={dlItem.listData}
                                                            showListDataButton
                                                            hideUnseenCountBadge
                                                            containerClassName="h-full"
                                                            overlay={
                                                                <div className="absolute inset-x-0 top-0 flex justify-end pointer-events-none">
                                                                    {/* Badge and synthetic outline come from the card itself. */}
                                                                    <p className="ml-auto font-semibold text-white bg-gray-950 bg-opacity-90 px-3 py-1 text-xs rounded-bl-lg">{formatNumber(chapters)} chapter{chapters === 1 ? "" : "s"}</p>
                                                                </div>
                                                            }
                                                            onHoverImage={onHoverImage}
                                                        />
                                                    </div>
                                                </CarouselItem>
                                            )
                                        }
                                        return null
                                    })}
                                </CarouselContent>
                            </Carousel>
                        ) : (
                            <PaginatedMediaGrid persistKey="manga-downloads" type="manga"
                                items={sourceFilteredDownloads}
                                scrollTargetSelector="[data-local-manga-library]"
                                renderItem={dlItem => {
                                    const chapters = Object.values(dlItem.downloadData).flatMap(n => n).length
                                    // A media record with no cover art in it renders as a grey
                                    // rectangle — the card is there, the image simply never arrives,
                                    // and nothing on screen says which. Locally scanned series are
                                    // stored with no cover at all, so this is common rather than
                                    // exotic. Those take the placeholder below, which at least says
                                    // what it is and keeps its title.
                                    const coverUrl = dlItem.media?.coverImage?.extraLarge
                                        || dlItem.media?.coverImage?.large
                                        || dlItem.media?.coverImage?.medium
                                        || dlItem.media?.bannerImage
                                        || ""
                                    if (dlItem.media && !!coverUrl) {
                                        const hoverImg = dlItem.media?.bannerImage || dlItem.media?.coverImage?.extraLarge || dlItem.media?.coverImage?.large || null
                                        return (
                                            <div
                                                key={dlItem.media?.id}
                                                onMouseEnter={() => hoverImg && onHoverImage(hoverImg)}
                                                onMouseLeave={() => onHoverImage(null)}
                                            >
                                                <MediaEntryCard
                                                    media={dlItem.media}
                                                    type="manga"
                                                    listData={dlItem.listData}
                                                    showListDataButton
                                                    hideUnseenCountBadge
                                                    containerClassName="h-full"
                                                    overlay={
                                                        <div className="absolute inset-x-0 top-0 flex justify-end pointer-events-none">
                                                            {/* The state badge and the synthetic outline are drawn by the card
                                                             itself now — see MangaBadge — so every screen marks a series
                                                             the same way. Only the chapter count is local to this shelf. */}
                                                            <p className="ml-auto font-semibold text-white bg-gray-950 bg-opacity-90 px-3 py-1 text-xs rounded-bl-lg">{formatNumber(chapters)} chapter{chapters === 1 ? "" : "s"}</p>
                                                        </div>
                                                    }
                                                    onHoverImage={onHoverImage}
                                                />
                                            </div>
                                        )
                                    }
                                    // Either no metadata at all — the list endpoint never reaches
                                    // AniList, so a download whose series is on none of your lists
                                    // and has nothing stored locally arrives with media: null — or
                                    // metadata with no cover in it. The server fetches what is
                                    // missing in the background; until it lands, the card still has
                                    // to be a way in rather than a dead tile. The media ID is all
                                    // the entry page needs.
                                    const provider = Object.keys(dlItem.downloadData || {})[0]
                                    const placeholderTitle = displayTitle(dlItem.media?.title) || `Manga ID: ${dlItem.mediaId}`
                                    return <NoCoverMangaTile key={`download-${dlItem.mediaId}-${provider}`}
                                        mediaId={dlItem.mediaId}
                                        title={placeholderTitle}
                                        provider={provider}
                                        chapters={chapters}
                                        onHoverImage={onHoverImage}
                                    />
                                }}
                            />
                        )}
                    </div>
                )}

                {!downloadsLoading && !downloadsError && !downloadedWithMedia.length && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-sm text-gray-300 backdrop-blur-md">
                        No downloaded series found. Use Manga Downloads to add offline chapters.
                    </div>
                )}
            </div>
        )
    }

    // Local Manga Library Stats, laid out like the anime home's row
    if (item.type === "local-manga-library-stats") {
        const entries: Manga_CollectionEntry[] = mangaCollection?.lists?.flatMap((list: Manga_CollectionList) => list.entries ?? []) ?? []
        const countOf = (type: string) => mangaCollection?.lists?.find((list: Manga_CollectionList) => list.type === type)?.entries?.length ?? 0
        const chaptersRead = entries.reduce((total: number, entry: Manga_CollectionEntry) => total + (entry.listData?.progress ?? 0), 0)
        const scoredEntries = entries.filter((entry: Manga_CollectionEntry) => (entry.listData?.score ?? 0) > 0)
        const averageScore = scoredEntries.length
            ? scoredEntries.reduce((total: number, entry: Manga_CollectionEntry) => total + (entry.listData?.score ?? 0), 0) / scoredEntries.length / 10
            : undefined
        // Nothing to show yet reads as "–", never as a 0 that later turns into the real number.
        const haveCollection = !!mangaCollection && !mangaCollectionLoading
        const haveDownloads = !!downloadedList && !downloadsLoading
        const show = (ready: boolean, n: number) => ready ? formatNumber(n) : "–"
        return (
            <PageWrapper>
                <HomeStatsStrip
                    data-manga-library-stats-container
                    stats={[
                        { label: "Entries", value: show(haveCollection, entries.length), icon: <LuLibrary />, tone: "text-emerald-300" },
                        { label: "Reading", value: show(haveCollection, countOf("CURRENT")), icon: <LuBookOpen />, tone: "text-sky-300" },
                        { label: "Completed", value: show(haveCollection, countOf("COMPLETED")), icon: <LuBookOpenCheck />, tone: "text-brand-200" },
                        { label: "Chapters read", value: show(haveCollection, chaptersRead), icon: <LuEye />, tone: "text-cyan-300" },
                        { label: "My average score", value: !haveCollection || averageScore == null ? "–" : averageScore.toFixed(1), icon: <LuStar />, tone: "text-amber-200", title: `${scoredEntries.length.toLocaleString()} scored titles` },
                        { label: "Downloaded series", value: show(haveDownloads, downloadedList?.length ?? 0), icon: <LuDownload />, tone: "text-violet-300" },
                        { label: "Downloaded chapters", value: show(haveDownloads, downloadedChaptersTotal), icon: <LuFiles />, tone: "text-amber-300" },
                        { label: "With metadata", value: show(haveDownloads, downloadedWithMedia.length), icon: <LuImage />, tone: "text-rose-300" },
                    ]}
                />
            </PageWrapper>
        )
    }

    // Upcoming Chapters
    if (item.type === "manga-upcoming-chapters") {
        return (
            <MangaUpcomingChapters
                onHoverImage={onHoverImage}
                cardSizeClass={cardSizeClass}
            />
        )
    }

    // Recently Released
    if (item.type === "manga-aired-recently") {
        return (
            <MangaRecentlyReleased
                onHoverImage={onHoverImage}
                cardSizeClass={cardSizeClass}
            />
        )
    }

    // Schedule Calendar - hide for now, calendar requires more complex implementation
    if (item.type === "manga-schedule-calendar") {
        return null
    }

    // Discover Header - skip in item list since rendered separately
    if (item.type === "manga-discover-header") {
        return null
    }

    // Fallback for unknown types
    return (
        <div className="px-4 py-8">
            <div className="text-center py-12 bg-red-900/20 rounded-lg border border-red-700">
                <p className="text-red-400">Unknown item type: {item.type}</p>
            </div>
        </div>
    )
}
