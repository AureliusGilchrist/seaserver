"use client"
import { useGetMangaReadingHistory } from "@/api/hooks/manga.hooks"
import { useRouter } from "next/navigation"
import React from "react"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { cn } from "@/components/ui/core/styling"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { episodeCardCarouselItemClass } from "@/components/shared/classnames"

interface MangaContinueReadingProps {
    onHoverImage?: (image: string | null) => void
}

export function MangaContinueReading({ onHoverImage }: MangaContinueReadingProps) {
    const router = useRouter()
    const { data: readingHistory, isLoading } = useGetMangaReadingHistory()

    if (isLoading) {
        return (
            <div className="px-4 py-8">
                <h2 className="text-xl font-semibold text-white mb-4">Continue Reading</h2>
                <div className="flex gap-4 overflow-hidden">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-48 h-72 bg-gray-800/50 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        )
    }

    if (!readingHistory || readingHistory.length === 0) {
        return null
    }

    // Filter to get unique manga (by mediaId) and limit to recent ones
    const uniqueManga = readingHistory
        .filter((item, index, self) => 
            index === self.findIndex(t => t.mediaId === item.mediaId)
        )
        .slice(0, 20)

    if (uniqueManga.length === 0) {
        return null
    }

    return (
        <div className="px-4 py-8 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Continue Reading</h2>
                <span className="text-sm text-[--muted]">{uniqueManga.length} series</span>
            </div>

            <Carousel
                opts={{
                    align: "start",
                }}
                autoScroll
            >
                <CarouselDotButtons />
                <CarouselContent>
                    {uniqueManga.map((item) => {
                        if (!item.media) return null
                        
                        const hoverImage = item.media.bannerImage || item.media.coverImage?.extraLarge || item.media.coverImage?.large || null

                        return (
                            <CarouselItem
                                key={item.mediaId}
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
                                        media={item.media}
                                        type="manga"
                                        overlay={
                                            item.lastChapterNumber ? (
                                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                                                    <p className="text-xs text-white font-semibold">
                                                        Chapter {item.lastChapterNumber}
                                                    </p>
                                                    {item.lastReadAt && (
                                                        <p className="text-[10px] text-gray-300">
                                                            {new Date(item.lastReadAt).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : undefined
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
