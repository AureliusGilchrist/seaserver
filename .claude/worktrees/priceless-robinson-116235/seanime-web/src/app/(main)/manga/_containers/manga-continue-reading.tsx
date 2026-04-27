"use client"
import { useGetMangaReadingHistory } from "@/api/hooks/manga.hooks"
import { useGetCurrentProfile } from "@/api/hooks/profiles.hooks"
import React from "react"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { cn } from "@/components/ui/core/styling"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"

interface MangaContinueReadingProps {
    onHoverImage?: (image: string | null) => void
}

export function MangaContinueReading({ onHoverImage }: MangaContinueReadingProps) {
    const { data: readingHistory, isLoading } = useGetMangaReadingHistory()

    // Get current profile
    const { data: currentProfile } = useGetCurrentProfile()

    const uniqueManga = React.useMemo(() => {
        if (!readingHistory || readingHistory.length === 0) return []
        // Filter to get unique manga (by mediaId) and limit to recent ones
        return readingHistory
            .filter((item, index, self) =>
                index === self.findIndex(t => t.mediaId === item.mediaId),
            )
            .slice(0, 20)
    }, [readingHistory])


    if (isLoading) {
        return (
            <div className="px-4 py-8">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-semibold text-white">Continue Reading</h2>
                    {currentProfile?.name && (
                        <span className="text-sm text-[--muted]">Profile: {currentProfile.name}</span>
                    )}
                </div>
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

    if (uniqueManga.length === 0) {
        return null
    }

    return (
        <div className="px-4 py-8 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-white">Continue Reading</h2>
                    {currentProfile?.name && (
                        <span className="text-xs text-[--muted]">Profile: {currentProfile.name}</span>
                    )}
                </div>
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
                                    "basis-1/2",
                                    "min-[768px]:basis-1/3 min-[1080px]:basis-1/4 min-[1320px]:basis-1/5 min-[1750px]:basis-1/6 min-[1850px]:basis-[14.2857%] min-[2000px]:basis-[12.5%]",
                                )}
                            >
                                <div
                                    onMouseEnter={() => {
                                        if (!hoverImage) return
                                        onHoverImage?.(hoverImage)
                                    }}
                                    onMouseLeave={() => {
                                        onHoverImage?.(null)
                                    }}
                                >
                                    <MediaEntryCard
                                        media={item.media}
                                        type="manga"
                                        containerClassName="h-full"
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
