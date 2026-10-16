"use client"
import { useGetMangaLatestChapterNumbersMap, useGetUpcomingMangaChapters } from "@/api/hooks/manga.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import { formatNumber } from "@/lib/helpers/number"
import React from "react"

interface MangaUpcomingChaptersProps {
    onHoverImage?: (image: string | null) => void
    cardSizeClass?: string
}

export function MangaUpcomingChapters({ onHoverImage, cardSizeClass }: MangaUpcomingChaptersProps) {
    const { data: upcomingManga, isLoading } = useGetUpcomingMangaChapters()
    const { data: latestChapterNumbers } = useGetMangaLatestChapterNumbersMap()
    const sortedUpcomingManga = React.useMemo(() => {
        return [...(upcomingManga ?? [])].sort((a, b) => {
            const aForecast = getMangaForecastDate(latestChapterNumbers?.[a.id] ?? [])
            const bForecast = getMangaForecastDate(latestChapterNumbers?.[b.id] ?? [])
            if (aForecast !== null && bForecast !== null) return aForecast - bForecast
            if (aForecast !== null) return -1
            if (bForecast !== null) return 1
            return (a.title?.userPreferred ?? "").localeCompare(b.title?.userPreferred ?? "")
        })
    }, [latestChapterNumbers, upcomingManga])

    if (isLoading) {
        return (
            <div className="px-4 py-8">
                <h2 className="text-xl font-semibold text-white mb-4">Upcoming Chapters</h2>
                <div className="flex gap-4 overflow-hidden">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-48 h-72 bg-gray-800/50 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        )
    }

    if (sortedUpcomingManga.length === 0) {
        return null
    }

    return (
        <div className="px-4 py-8 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Upcoming Chapters</h2>
                <span className="text-sm text-[--muted]">{formatNumber(sortedUpcomingManga.length)} series</span>
            </div>

            <Carousel opts={{ align: "start" }} autoScroll>
                <CarouselDotButtons />
                <CarouselContent>
                    {sortedUpcomingManga.map((manga) => {
                        const hoverImage = manga.bannerImage || manga.coverImage?.extraLarge || manga.coverImage?.large || null
                        const latestItem = getLatestMangaChapter(latestChapterNumbers?.[manga.id] ?? [])
                        const latestChapter = Number.parseFloat(latestItem?.chapter ?? String(latestItem?.number ?? ""))
                        const nextChapter = Number.isFinite(latestChapter)
                            ? Math.floor(latestChapter) + 1
                            : manga.chapters && manga.chapters > 0
                                ? manga.chapters + 1
                                : null
                        const daysUntil = latestItem?.estimatedNextAt
                            ? Math.max(0, Math.ceil((new Date(latestItem.estimatedNextAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
                            : null

                        return (
                            <CarouselItem
                                key={manga.id}
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
                                        media={manga}
                                        type="manga"
                                        overlay={nextChapter !== null ? (
                                            <div className="absolute inset-x-0 bottom-0 flex justify-center px-2 pb-2 pointer-events-none">
                                                <span className="rounded-full border border-brand-200/25 bg-black/80 px-3 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md">
                                                    {`Next likely: Ch. ${formatNumber(nextChapter)}`}
                                                    {daysUntil !== null && latestItem?.cadenceDays
                                                        ? ` · ~${daysUntil}d`
                                                        : ""}
                                                </span>
                                            </div>
                                        ) : undefined}
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

function getLatestMangaChapter(items: { chapter?: string, number?: number, updatedAt?: string, estimatedNextAt?: string, cadenceDays?: number }[]) {
    return [...items].sort((a, b) => {
        const aChapter = Number.parseFloat(a.chapter ?? String(a.number ?? ""))
        const bChapter = Number.parseFloat(b.chapter ?? String(b.number ?? ""))
        return bChapter - aChapter
    })[0]
}

function getMangaForecastDate(items: { chapter?: string, number?: number, estimatedNextAt?: string, cadenceDays?: number }[]): number | null {
    const latest = getLatestMangaChapter(items)
    if (!latest?.estimatedNextAt || !latest.cadenceDays) return null
    const timestamp = new Date(latest.estimatedNextAt).getTime()
    return Number.isFinite(timestamp) ? timestamp : null
}
