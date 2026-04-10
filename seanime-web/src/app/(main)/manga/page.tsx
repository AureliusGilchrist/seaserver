"use client"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { MediaCardLazyGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { MediaEntryPageLoadingDisplay } from "@/app/(main)/_features/media/_components/media-entry-page-loading-display"
import { MangaLibraryHeader } from "@/app/(main)/manga/_components/library-header"
import { MangaHomeToolbar } from "@/app/(main)/manga/_components/manga-home-toolbar"
import { useHandleMangaCollection } from "@/app/(main)/manga/_lib/handle-manga-collection"
import { useMangaFavorites } from "@/app/(main)/manga/_lib/use-manga-favorites"
import { useGetMangaDownloadsList } from "@/api/hooks/manga_download.hooks"
import { MangaLibraryView } from "@/app/(main)/manga/_screens/manga-library-view"
import { MangaCarousel } from "@/app/(main)/(library)/_home/home-screen"
import { MangaHomeSettingsModal, DEFAULT_MANGA_HOME_ITEMS } from "@/app/(main)/manga/_components/manga-home-settings"
import { MangaContinueReading } from "@/app/(main)/manga/_containers/manga-continue-reading"
import { MangaDiscoverHeader } from "@/app/(main)/manga/_containers/manga-discover-header"
import { MangaUpcomingChapters } from "@/app/(main)/manga/_containers/manga-upcoming-chapters"
import { MangaRecentlyReleased } from "@/app/(main)/manga/_containers/manga-recently-released"
import { MangaMissedSequels } from "@/app/(main)/manga/_containers/manga-missed-sequels"
import { useGetMangaHomeItems } from "@/api/hooks/status.hooks"
import { mangaCardSizeAtom, getCardSizeClasses } from "@/app/(main)/_atoms/card-size.atoms"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { cn } from "@/components/ui/core/styling"
import { Skeleton } from "@/components/ui/skeleton"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { ThemeLibraryScreenBannerType, useThemeSettings } from "@/lib/theme/hooks"
import { useDebounce } from "use-debounce"
import { __isDesktop__ } from "@/types/constants"
import { AnimatePresence } from "motion/react"
import { useAtomValue } from "jotai/react"
import React from "react"

export const dynamic = "force-static"

export default function Page() {
    const { data: mangaHomeItems } = useGetMangaHomeItems()
    const cardSize = useAtomValue(mangaCardSizeAtom)
    const cardSizeClass = getCardSizeClasses(cardSize)
    const {
        mangaCollection,
        filteredMangaCollection,
        mangaCollectionLoading,
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

    // Hero background image state (hover-driven) - matching anime home screen
    const [hoverImage, setHoverImage] = React.useState<string | null>(null)
    const [activeHero] = useDebounce(hoverImage, 50)
    const [scrolled, setScrolled] = React.useState(false)

    const handleHoverImage = React.useCallback((img: string | null) => {
        setHoverImage(img)
    }, [])

    React.useEffect(() => {
        const handler = () => setScrolled(window.scrollY > 60)
        handler()
        window.addEventListener("scroll", handler)
        return () => window.removeEventListener("scroll", handler)
    }, [])

    React.useEffect(() => {
        if (scrolled) {
            setHoverImage(null)
        }
    }, [scrolled])

    const { data: downloadedList, isLoading: downloadsLoading, isError: downloadsError } = useGetMangaDownloadsList()
    const [downloadSearch, setDownloadSearch] = React.useState("")

    const downloadedWithMedia = React.useMemo(() => (downloadedList || []).filter(d => !!d.media), [downloadedList])
    const filteredDownloads = React.useMemo(() => {
        const list = downloadedList || []
        const q = downloadSearch.trim().toLowerCase()
        const filtered = !q ? list : list.filter(item => item.media?.title?.userPreferred?.toLowerCase().includes(q))
        
        // Sort alphabetically with natural number ordering
        return filtered.sort((a, b) => {
            const titleA = a.media?.title?.userPreferred || `Unknown ${a.mediaId}`
            const titleB = b.media?.title?.userPreferred || `Unknown ${b.mediaId}`
            return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' })
        })
    }, [downloadSearch, downloadedList])
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

    const homeItems = mangaHomeItems || DEFAULT_MANGA_HOME_ITEMS

    // Loading state - matching anime home screen skeleton
    if (!mangaCollection || mangaCollectionLoading) {
        return (
            <React.Fragment>
                <div className="p-4 space-y-4 relative z-[4]">
                    <Skeleton className="h-12 w-full max-w-lg relative" />
                    <div
                        className={cn(
                            "grid h-[22rem] min-[2000px]:h-[24rem] grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 min-[2000px]:grid-cols-8 gap-4",
                        )}
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8]?.map((_, idx) => {
                            return <Skeleton
                                key={idx} className={cn(
                                "h-[22rem] min-[2000px]:h-[24rem] col-span-1 aspect-[6/7] flex-none rounded-[--radius-md] relative overflow-hidden",
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
            {/* Dynamic blurred background hero - matching anime home screen z-index */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div
                    className={cn(
                        "absolute inset-0 transition-opacity duration-500",
                        activeHero ? "opacity-100" : "opacity-0",
                    )}
                    style={{
                        backgroundImage: activeHero ? `url(${activeHero})` : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        filter: "blur(22px) saturate(120%)",
                        transform: "scale(1.05)",
                    }}
                />
                <div
                    className={cn(
                        "absolute inset-0 bg-gradient-to-b from-black/90 via-black/70 to-black/90 transition-opacity duration-400",
                        scrolled ? "opacity-95" : "opacity-85",
                    )}
                />
            </div>

            <div className="relative z-[1]">

                {/* Manga Discover Header - if first item */}
                {homeItems[0]?.type === "manga-discover-header" && (
                    <MangaDiscoverHeader onHoverImage={handleHoverImage} cardSizeClass={cardSizeClass} />
                )}

                {/* Manga Continue Reading Header - if first item */}
                {homeItems[0]?.type === "manga-continue-reading-header" && (
                    <MangaContinueReading onHoverImage={handleHoverImage} />
                )}

                {/* Manga Library Header - dynamic banner only when manga-library is first */}
                {(ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Dynamic && 
                    (homeItems[0]?.type === "manga-library")
                ) && (
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
                {(
                    (ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Dynamic && hasManga) &&
                    (homeItems[0]?.type === "manga-library")
                ) && <div
                    className={cn(
                        "h-28",
                        ts.hideTopNavbar && "h-40",
                    )}
                    data-manga-toolbar-top-padding
                ></div>}

                {/* Manga Home Toolbar - same position as anime HomeToolbar */}
                <MangaHomeToolbar
                    hasManga={hasManga}
                    className={cn(
                        (homeItems[0]?.type === "manga-discover-header" || homeItems[0]?.type === "manga-continue-reading-header") && "!mt-[-4rem] !mb-[-1rem]",
                    )}
                />

                {/* Custom Library Banner */}
                {(!!ts.libraryScreenCustomBannerImage
                    && ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Custom
                    && homeItems[0]?.type !== "manga-discover-header"
                    && homeItems[0]?.type !== "manga-continue-reading-header"
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
                    && homeItems[0]?.type !== "manga-continue-reading-header"
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
                        {/* Local Manga Library Stats - always at top of items */}
                        {!downloadsLoading && !downloadsError && (downloadedList?.length ?? 0) > 0 && (
                            <div className="px-4 pb-4">
                                <div className="grid gap-4 md:grid-cols-3 bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-sm text-gray-100">
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400">Total Series</p>
                                        <p className="text-lg font-semibold">{downloadedList?.length || 0}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400">Total Chapters</p>
                                        <p className="text-lg font-semibold">{downloadedChaptersTotal}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-400">With Metadata</p>
                                        <p className="text-lg font-semibold">{downloadedWithMedia.length}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {homeItems.filter(n => n.type !== "manga-discover-header" && n.type !== "manga-continue-reading-header" && n.type !== "local-manga-library-stats").map((item, index) => {
                            // Divider between items (except for certain types)
                            const showDivider = index !== 0 && 
                                !(item?.type === "manga-library" || item?.type === "manga-continue-reading")

                            return (
                                <React.Fragment key={item.id}>
                                    {showDivider && <div data-manga-home-item-divider={index} className="h-8" />}
                                    <MangaHomeScreenItem
                                        item={item}
                                        index={homeItems.findIndex(n => n.id === item.id)}
                                        onHoverImage={handleHoverImage}
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
                                        filteredMangaCollection={filteredMangaCollection}
                                        mangaCollectionGenres={mangaCollectionGenres}
                                        storedProviders={storedProviders}
                                        hasManga={hasManga}
                                        favoritesMedia={favoritesMedia}
                                        cardSizeClass={cardSizeClass}
                                    />
                                </React.Fragment>
                            )
                        })}

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
        filteredMangaCollection,
        mangaCollectionGenres,
        storedProviders,
        hasManga,
        favoritesMedia,
        cardSizeClass,
    } = props

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
                    <MediaCardLazyGrid itemCount={favoritesMedia.length}>
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
                    libraryCollectionList: [],
                    filteredLibraryCollectionList: [],
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

    // My Lists - handled by shared component, skip for now
    if (item.type === "my-lists") {
        return null
    }

    // Manga Continue Reading
    if (item.type === "manga-continue-reading" || item.type === "manga-continue-reading-header") {
        return (
            <MangaContinueReading
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
            <div className="px-4 py-6 space-y-4">
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
                        <div className="flex items-center gap-3">
                            <input
                                value={downloadSearch}
                                onChange={(e) => setDownloadSearch(e.target.value)}
                                placeholder="Search downloaded manga"
                                className="w-full rounded-lg bg-gray-900/70 border border-gray-800 px-3 py-2 text-sm text-white focus:border-brand-400 focus:outline-none"
                            />
                        </div>

                        {layout === "carousel" ? (
                            <Carousel opts={{ align: "start" }} autoScroll>
                                <CarouselDotButtons />
                                <CarouselContent>
                                    {sourceFilteredDownloads.map(dlItem => {
                                        const chapters = Object.values(dlItem.downloadData).flatMap(n => n).length
                                        const isSynthetic = (dlItem.media?.id !== undefined && dlItem.media.id < 0) && !dlItem.isMapped
                                        if (dlItem.media) {
                                            const hoverImg = dlItem.media?.bannerImage || dlItem.media?.coverImage?.extraLarge || dlItem.media?.coverImage?.large || null
                                            return (
                                                <CarouselItem
                                                    key={dlItem.media?.id}
                                                    className={cn(
                                                        "basis-1/2",
                                                        cardSizeClass || "md:basis-1/3 lg:basis-1/4 xl:basis-1/5 2xl:basis-1/6 min-[2000px]:basis-1/8",
                                                    )}
                                                >
                                                    <div
                                                        onMouseEnter={() => hoverImg && onHoverImage(hoverImg)}
                                                        onMouseLeave={() => onHoverImage(null)}
                                                    >
                                                        <MediaEntryCard
                                                            media={dlItem.media}
                                                            type="manga"
                                                            hideUnseenCountBadge
                                                            hideAnilistEntryEditButton
                                                            containerClassName="h-full"
                                                            overlay={
                                                                <div className="absolute inset-x-0 top-0 flex justify-between pointer-events-none">
                                                                    {isSynthetic && (
                                                                        <span className="ml-0.5 mt-0.5 px-2 py-1 text-[10px] font-semibold rounded-br bg-amber-600/90 text-white">Synthetic</span>
                                                                    )}
                                                                    <p className="ml-auto font-semibold text-white bg-gray-950 bg-opacity-90 px-3 py-1 text-xs rounded-bl-lg">{chapters} chapter{chapters === 1 ? "" : "s"}</p>
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
                            <MediaCardLazyGrid itemCount={sourceFilteredDownloads.length}>
                                {sourceFilteredDownloads.map(dlItem => {
                                    const chapters = Object.values(dlItem.downloadData).flatMap(n => n).length
                                    const isSynthetic = (dlItem.media?.id !== undefined && dlItem.media.id < 0) && !dlItem.isMapped
                                    if (dlItem.media) {
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
                                                    hideUnseenCountBadge
                                                    hideAnilistEntryEditButton
                                                    containerClassName="h-full"
                                                    overlay={
                                                        <div className="absolute inset-x-0 top-0 flex justify-between pointer-events-none">
                                                            {isSynthetic && (
                                                                <span className="ml-0.5 mt-0.5 px-2 py-1 text-[10px] font-semibold rounded-br bg-amber-600/90 text-white">Synthetic</span>
                                                            )}
                                                            <p className="ml-auto font-semibold text-white bg-gray-950 bg-opacity-90 px-3 py-1 text-xs rounded-bl-lg">{chapters} chapter{chapters === 1 ? "" : "s"}</p>
                                                        </div>
                                                    }
                                                    onHoverImage={onHoverImage}
                                                />
                                            </div>
                                        )
                                    }
                                    const provider = Object.keys(dlItem.downloadData || {})[0]
                                    return (
                                        <div
                                            key={`download-${dlItem.mediaId}-${provider}`}
                                            className="relative h-full rounded-xl border border-gray-800 bg-gray-900/70 p-3 flex flex-col gap-2"
                                            onMouseEnter={() => onHoverImage(null)}
                                            onMouseLeave={() => onHoverImage(null)}
                                        >
                                            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[--muted]">
                                                <span>Local download</span>
                                                {isSynthetic && <span className="px-2 py-0.5 rounded bg-amber-600/80 text-white text-[10px]">Synthetic</span>}
                                            </div>
                                            <div className="text-sm font-semibold text-white line-clamp-2">Manga ID: {dlItem.mediaId}</div>
                                            {provider && <div className="text-xs text-[--muted]">Provider: {provider}</div>}
                                            <div className="mt-auto text-xs text-[--muted]">{chapters} chapter{chapters === 1 ? "" : "s"}</div>
                                        </div>
                                    )
                                })}
                            </MediaCardLazyGrid>
                        )}
                    </div>
                )}

                {!downloadsLoading && !downloadsError && !downloadedWithMedia.length && (
                    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-sm text-gray-300">
                        No downloaded series found. Use Manga Downloads to add offline chapters.
                    </div>
                )}
            </div>
        )
    }

    // Local Manga Library Stats (downloads only)
    if (item.type === "local-manga-library-stats") {
        const totalSeries = downloadedList?.length || 0
        return (
            <div className="px-4 py-8">
                <h2 className="text-xl font-semibold text-white mb-4">Downloads Statistics</h2>
                <div className="grid gap-4 md:grid-cols-3 bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-sm text-gray-100">
                    <div className="space-y-1">
                        <p className="text-xs text-gray-400">Total Series</p>
                        <p className="text-lg font-semibold">{totalSeries}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-gray-400">Total Chapters</p>
                        <p className="text-lg font-semibold">{downloadedChaptersTotal}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-gray-400">With Metadata</p>
                        <p className="text-lg font-semibold">{downloadedWithMedia.length}</p>
                    </div>
                </div>
            </div>
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

    // Missed Sequels
    if (item.type === "manga-missed-sequels") {
        return (
            <MangaMissedSequels
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
