"use client"
import { useGetMangaCollection, useGetMangaLatestChapterNumbersMap } from "@/api/hooks/manga.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { estimateMangaChapterRelease } from "@/app/(main)/manga/_lib/chapter-release-estimate"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import { formatNumber } from "@/lib/helpers/number"
import React from "react"

interface MangaUpcomingChaptersProps {
    onHoverImage?: (image: string | null) => void
    cardSizeClass?: string
}

export function MangaUpcomingChapters({ onHoverImage, cardSizeClass }: MangaUpcomingChaptersProps) {
    const { data: collection, isLoading: collectionLoading, isError: collectionError } = useGetMangaCollection()
    const { data: latestChapterNumbers, isLoading: chaptersLoading, isError: chaptersError } = useGetMangaLatestChapterNumbersMap()

    const upcomingManga = React.useMemo(() => {
        const entries = collection?.lists
            ?.filter(list => list.type === "CURRENT" || list.type === "REPEATING")
            .flatMap(list => list.entries ?? []) ?? []
        const seen = new Set<number>()

        return entries.flatMap(entry => {
            const media = entry.media
            if (!media || media.status !== "RELEASING" || seen.has(entry.mediaId)) return []
            seen.add(entry.mediaId)

            const sources = [...(latestChapterNumbers?.[entry.mediaId] ?? [])]
                .sort((a, b) => b.number - a.number || Number(!!b.releaseHistory?.length) - Number(!!a.releaseHistory?.length))
            const latest = sources[0]
            if (!latest) return []

            const estimate = estimateMangaChapterRelease(latest.releaseHistory ?? [])
            return [{
                media,
                listData: entry.listData,
                nextChapter: latest.number + 1,
                estimate,
            }]
        }).slice(0, 20)
    }, [collection, latestChapterNumbers])

    if (collectionLoading || chaptersLoading) {
        return (
            <div className="px-4 py-8">
                <h2 className="text-xl font-semibold text-white mb-4">Upcoming Manga</h2>
                <div className="flex gap-4 overflow-hidden">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-48 h-72 bg-gray-800/50 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        )
    }

    if (collectionError || chaptersError) {
        return (
            <div className="px-4 py-8">
                <h2 className="text-xl font-semibold text-white">Upcoming Manga</h2>
                <p className="mt-2 text-sm text-red-400">Unable to load upcoming chapter estimates. Please try refreshing the page.</p>
            </div>
        )
    }

    if (!upcomingManga.length) return null

    return (
        <div className="px-4 py-8 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-white">Upcoming Manga</h2>
                    <p className="mt-1 text-sm text-[--muted]">
                        Next chapters are based on your cached sources; timing appears only when release dates show a steady pattern.
                    </p>
                </div>
                <span className="shrink-0 text-sm text-[--muted]">{formatNumber(upcomingManga.length)} series</span>
            </div>

            <Carousel opts={{ align: "start" }} autoScroll>
                <CarouselDotButtons />
                <CarouselContent>
                    {upcomingManga.map(({ media, listData, nextChapter, estimate }) => {
                        const hoverImage = media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large || null

                        return (
                            <CarouselItem
                                key={media.id}
                                className={cn(
                                    "basis-1/2",
                                    cardSizeClass || "md:basis-1/3 lg:basis-1/4 xl:basis-1/5 2xl:basis-1/6 min-[2000px]:basis-1/8",
                                )}
                            >
                                <div
                                    onMouseEnter={() => hoverImage && onHoverImage?.(hoverImage)}
                                    onMouseLeave={() => onHoverImage?.(null)}
                                >
                                    <MediaEntryCard
                                        media={media}
                                        listData={listData}
                                        type="manga"
                                        overlay={
                                            <div className="absolute inset-x-0 top-0 z-[3] flex justify-end p-2">
                                                <div className="rounded-xl border border-white/15 bg-gray-950/80 px-3 py-2 text-right shadow-lg backdrop-blur-md">
                                                    <p className="text-xs font-semibold text-white">Most likely next: Ch. {formatNumber(nextChapter)}</p>
                                                    {estimate ? (
                                                        <p className="mt-0.5 text-[10px] text-white/70">
                                                            ~{formatNumber(estimate.intervalDays)} days · around {estimate.nextReleaseAt.toLocaleDateString(undefined, { timeZone: "UTC" })}
                                                        </p>
                                                    ) : (
                                                        <p className="mt-0.5 text-[10px] text-white/60">No regular release pattern</p>
                                                    )}
                                                </div>
                                            </div>
                                        }
                                    />
                                </div>
                            </CarouselItem>
                        )
                    })}
                </CarouselContent>
            </Carousel>
        </div>
    )
}
