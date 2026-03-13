"use client"
import { useGetUpcomingMangaChapters } from "@/api/hooks/manga.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { episodeCardCarouselItemClass } from "@/components/shared/classnames"
import { cn } from "@/components/ui/core/styling"
import React from "react"

interface MangaUpcomingChaptersProps {
    onHoverImage?: (image: string | null) => void
}

export function MangaUpcomingChapters({ onHoverImage }: MangaUpcomingChaptersProps) {
    const { data: upcomingManga, isLoading } = useGetUpcomingMangaChapters()

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

    if (!upcomingManga || upcomingManga.length === 0) {
        return null
    }

    return (
        <div className="px-4 py-8 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Upcoming Chapters</h2>
                <span className="text-sm text-[--muted]">{upcomingManga.length} series</span>
            </div>

            <Carousel opts={{ align: "start" }} autoScroll>
                <CarouselDotButtons />
                <CarouselContent>
                    {upcomingManga.map((manga) => {
                        const hoverImage = manga.bannerImage || manga.coverImage?.extraLarge || manga.coverImage?.large || null

                        return (
                            <CarouselItem
                                key={manga.id}
                                className={cn(
                                    episodeCardCarouselItemClass,
                                    "md:basis-1/3 lg:basis-1/4 xl:basis-1/5 2xl:basis-1/6 min-[2000px]:basis-1/8",
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
