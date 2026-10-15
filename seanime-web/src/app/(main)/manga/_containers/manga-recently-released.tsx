"use client"
import { useGetMangaCollection, useGetMangaLatestChapterNumbersMap } from "@/api/hooks/manga.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import { formatNumber } from "@/lib/helpers/number"
import React from "react"

interface MangaRecentlyReleasedProps {
    onHoverImage?: (image: string | null) => void
    cardSizeClass?: string
}

export function MangaRecentlyReleased({ onHoverImage, cardSizeClass }: MangaRecentlyReleasedProps) {
    const { data: collection, isLoading: collectionLoading, isError: collectionError } = useGetMangaCollection()
    const { data: latestChapterNumbers, isLoading: chaptersLoading, isError: chaptersError } = useGetMangaLatestChapterNumbersMap()

    const mangaWithNewChapters = React.useMemo(() => {
        const entries = collection?.lists
            ?.filter(list => list.type === "CURRENT" || list.type === "REPEATING")
            .flatMap(list => list.entries ?? []) ?? []
        const seen = new Set<number>()

        return entries.flatMap(entry => {
            const media = entry.media
            if (!media || seen.has(entry.mediaId)) return []
            seen.add(entry.mediaId)

            const progress = entry.listData?.progress ?? 0
            const hasUnreadChapters = latestChapterNumbers?.[entry.mediaId]
                ?.some(chapter => chapter.number > progress) ?? false
            return hasUnreadChapters ? [media] : []
        }).slice(0, 20)
    }, [collection, latestChapterNumbers])

    if (collectionLoading || chaptersLoading) {
        return (
            <div className="px-4 py-8">
                <h2 className="text-xl font-semibold text-white mb-4">New Chapters Available</h2>
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
                <h2 className="text-xl font-semibold text-white">New Chapters Available</h2>
                <p className="mt-2 text-sm text-red-400">Unable to load chapter availability. Please try refreshing the page.</p>
            </div>
        )
    }

    if (mangaWithNewChapters.length === 0) {
        return null
    }

    return (
        <div className="px-4 py-8 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">New Chapters Available</h2>
                <span className="text-sm text-[--muted]">{formatNumber(mangaWithNewChapters.length)} series</span>
            </div>

            <Carousel opts={{ align: "start" }} autoScroll>
                <CarouselDotButtons />
                <CarouselContent>
                    {mangaWithNewChapters.map((manga) => {
                        const hoverImage = manga.bannerImage || manga.coverImage?.extraLarge || manga.coverImage?.large || null

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
