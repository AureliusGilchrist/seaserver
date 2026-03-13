"use client"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { MediaCardLazyGrid } from "@/app/(main)/_features/media/_components/media-card-grid"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { MediaEntryPageLoadingDisplay } from "@/app/(main)/_features/media/_components/media-entry-page-loading-display"
import { MangaLibraryHeader } from "@/app/(main)/manga/_components/library-header"
import { useHandleMangaCollection } from "@/app/(main)/manga/_lib/handle-manga-collection"
import { useMangaFavorites } from "@/app/(main)/manga/_lib/use-manga-favorites"
import { useGetMangaDownloadsList } from "@/api/hooks/manga_download.hooks"
import { MangaLibraryView } from "@/app/(main)/manga/_screens/manga-library-view"
import { MangaCarousel } from "@/app/(main)/(library)/_home/home-screen"
import { MangaHomeSettingsButton, MangaHomeSettingsModal, DEFAULT_MANGA_HOME_ITEMS } from "@/app/(main)/manga/_components/manga-home-settings"
import { MangaContinueReading } from "@/app/(main)/manga/_containers/manga-continue-reading"
import { MangaDiscoverHeader } from "@/app/(main)/manga/_containers/manga-discover-header"
import { MangaUpcomingChapters } from "@/app/(main)/manga/_containers/manga-upcoming-chapters"
import { MangaRecentlyReleased } from "@/app/(main)/manga/_containers/manga-recently-released"
import { MangaMissedSequels } from "@/app/(main)/manga/_containers/manga-missed-sequels"
import { useGetMangaHomeItems } from "@/api/hooks/status.hooks"
import { cn } from "@/components/ui/core/styling"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { episodeCardCarouselItemClass } from "@/components/shared/classnames"
import { ThemeLibraryScreenBannerType, useThemeSettings } from "@/lib/theme/hooks"
import { __isDesktop__ } from "@/types/constants"
import React from "react"

export const dynamic = "force-static"

export default function Page() {
    const { data: mangaHomeItems } = useGetMangaHomeItems()
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

    // Hero background image state (hover-driven)
    const [hoverImage, setHoverImage] = React.useState<string | null>(null)
    const activeHero = React.useMemo(() => hoverImage, [hoverImage])
    const [scrolled, setScrolled] = React.useState(false)

    const handleHoverImage = React.useCallback((img: string | null) => {
        if (scrolled) return
        setHoverImage(img)
    }, [scrolled])

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

    if (!mangaCollection || mangaCollectionLoading) return <MediaEntryPageLoadingDisplay />

    const homeItems = mangaHomeItems || DEFAULT_MANGA_HOME_ITEMS

    return (
        <div
            data-manga-page-container
            data-stored-filters={JSON.stringify(storedFilters)}
            data-stored-providers={JSON.stringify(storedProviders)}
        >
            {/* Dynamic blurred background hero */}
            <div className="pointer-events-none fixed inset-0 -z-30 overflow-hidden">
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
                        "absolute inset-0 bg-gradient-to-b from-black/85 via-black/90 to-black/95 transition-opacity duration-400",
                        scrolled ? "opacity-0" : "opacity-70",
                    )}
                />
            </div>

            <div className="relative z-[10] isolate pt-16 md:pt-20 lg:pt-24">
                <div className="flex justify-end px-4 pt-4 sticky top-0 z-50 bg-transparent">
                    <MangaHomeSettingsButton />
                </div>

                {(
                    (!!ts.libraryScreenCustomBannerImage && ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Custom)
                ) && (
                    <>
                        <CustomLibraryBanner isLibraryScreen />
                        <div
                            data-manga-page-custom-banner-spacer
                            className={cn("h-14")}
                        ></div>
                    </>
                )}
                {ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Dynamic && (
                    <>
                        <MangaLibraryHeader manga={mangaCollection?.lists?.flatMap(l => l.entries)?.flatMap(e => e?.media)?.filter(Boolean) || []} />
                        <div
                            data-manga-page-dynamic-banner-spacer
                            className={cn(
                                !__isDesktop__ && "h-28",
                                (!__isDesktop__ && ts.hideTopNavbar) && "h-40",
                                __isDesktop__ && "h-40",
                            )}
                        ></div>
                    </>
                )}

                {/* Render manga home items based on settings */}
                {homeItems.map((item, index) => {
                    // Centered title
                    if (item.type === "centered-title") {
                        return (
                            <div key={item.id} className="px-4 py-8 text-center">
                                <h2 className="text-2xl font-bold text-white">{item.options?.text || "Title"}</h2>
                            </div>
                        )
                    }

                    // Favorite Manga
                    if (item.type === "manga-favorites") {
                        return (
                            <div key={item.id} className="px-4 py-8 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-semibold text-white">Favorite Manga</h2>
                                    {!favoritesMedia.length && <span className="text-sm text-[--muted]">No favorites yet</span>}
                                </div>

                                {!!favoritesMedia.length && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                        {favoritesMedia.map(media => (
                                            <MediaEntryCard
                                                key={media.id}
                                                media={media}
                                                type="manga"
                                                hideUnseenCountBadge
                                                onHoverImage={handleHoverImage}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    }

                    // Manga Library
                    if (item.type === "manga-library") {
                        return (
                            <MangaLibraryView
                                key={item.id}
                                genres={mangaCollectionGenres}
                                collection={mangaCollection}
                                filteredCollection={filteredMangaCollection}
                                storedProviders={storedProviders}
                                hasManga={hasManga}
                                onHoverImage={handleHoverImage}
                            />
                        )
                    }

                    // Manga Carousel
                    if (item.type === "manga-carousel") {
                        return (
                            <MangaCarousel
                                key={item.id}
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
                                onHoverImage={setHoverImage}
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
                                key={item.id}
                                onHoverImage={handleHoverImage}
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
                            <div key={item.id} className="px-4 py-6 space-y-4">
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
                                                    {sourceFilteredDownloads.map(item => {
                                                        const chapters = Object.values(item.downloadData).flatMap(n => n).length
                                                        const isSynthetic = (item.media?.id !== undefined && item.media.id < 0) || Object.keys(item.downloadData || {}).includes("weebcentral")
                                                        if (item.media) {
                                                            const hoverImage = item.media?.bannerImage || item.media?.coverImage?.extraLarge || item.media?.coverImage?.large || null
                                                            return (
                                                                <CarouselItem
                                                                    key={item.media?.id}
                                                                    className={cn(
                                                                        episodeCardCarouselItemClass,
                                                                        "md:basis-1/3 lg:basis-1/4 xl:basis-1/5 2xl:basis-1/6 min-[2000px]:basis-1/8",
                                                                    )}
                                                                >
                                                                    <div
                                                                        onMouseEnter={() => hoverImage && handleHoverImage(hoverImage)}
                                                                        onMouseLeave={() => handleHoverImage(null)}
                                                                    >
                                                                        <MediaEntryCard
                                                                            media={item.media}
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
                                                                            onHoverImage={handleHoverImage}
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
                                                {sourceFilteredDownloads.map(item => {
                                                    const chapters = Object.values(item.downloadData).flatMap(n => n).length
                                                    const isSynthetic = (item.media?.id !== undefined && item.media.id < 0) || Object.keys(item.downloadData || {}).includes("weebcentral")
                                                    if (item.media) {
                                                        const hoverImage = item.media?.bannerImage || item.media?.coverImage?.extraLarge || item.media?.coverImage?.large || null
                                                        return (
                                                            <div
                                                                key={item.media?.id}
                                                                onMouseEnter={() => hoverImage && handleHoverImage(hoverImage)}
                                                                onMouseLeave={() => handleHoverImage(null)}
                                                            >
                                                                <MediaEntryCard
                                                                    media={item.media}
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
                                                                    onHoverImage={handleHoverImage}
                                                                />
                                                            </div>
                                                        )
                                                    }
                                                    const provider = Object.keys(item.downloadData || {})[0]
                                                    return (
                                                        <div
                                                            key={`download-${item.mediaId}-${provider}`}
                                                            className="relative h-full rounded-xl border border-gray-800 bg-gray-900/70 p-3 flex flex-col gap-2"
                                                            onMouseEnter={() => handleHoverImage(null)}
                                                            onMouseLeave={() => handleHoverImage(null)}
                                                        >
                                                            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[--muted]">
                                                                <span>Local download</span>
                                                                {isSynthetic && <span className="px-2 py-0.5 rounded bg-amber-600/80 text-white text-[10px]">Synthetic</span>}
                                                            </div>
                                                            <div className="text-sm font-semibold text-white line-clamp-2">Unknown title</div>
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
                            <div key={item.id} className="px-4 py-8">
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
                                key={item.id}
                                onHoverImage={handleHoverImage}
                            />
                        )
                    }

                    // Recently Released
                    if (item.type === "manga-aired-recently") {
                        return (
                            <MangaRecentlyReleased
                                key={item.id}
                                onHoverImage={handleHoverImage}
                            />
                        )
                    }

                    // Missed Sequels
                    if (item.type === "manga-missed-sequels") {
                        return (
                            <MangaMissedSequels
                                key={item.id}
                                onHoverImage={handleHoverImage}
                            />
                        )
                    }

                    // Schedule Calendar - hide for now, calendar requires more complex implementation
                    if (item.type === "manga-schedule-calendar") {
                        return null
                    }

                    // Discover Header
                    if (item.type === "manga-discover-header") {
                        return (
                            <MangaDiscoverHeader
                                key={item.id}
                                onHoverImage={handleHoverImage}
                            />
                        )
                    }

                    // Fallback for unknown types
                    return (
                        <div key={item.id} className="px-4 py-8">
                            <div className="text-center py-12 bg-red-900/20 rounded-lg border border-red-700">
                                <p className="text-red-400">Unknown item type: {item.type}</p>
                            </div>
                        </div>
                    )
                })}

                <MangaHomeSettingsModal />
            </div>
        </div>
    )
}
