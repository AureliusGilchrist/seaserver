"use client"
import { MangaReadingHistory, useGetMangaReadingHistory } from "@/api/hooks/manga.hooks"
import { useGetCurrentProfile } from "@/api/hooks/profiles.hooks"
import { useSeaCommandInject } from "@/app/(main)/_features/sea-command/use-inject"
import { seaCommand_compareMediaTitles } from "@/app/(main)/_features/sea-command/utils"
import { episodeCardCarouselItemClass } from "@/components/shared/classnames"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaImage } from "@/components/shared/sea-image"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import { useThemeSettings } from "@/lib/theme/hooks"
import { useRouter } from "@/lib/navigation"
import React from "react"

interface MangaContinueReadingProps {
    onHoverImage?: (image: string | null) => void
    withTitle?: boolean
}

/**
 * The manga counterpart of the anime Continue Watching section: the same heading, the same carousel
 * shape, the same card — for chapters rather than episodes.
 *
 * The heading and the carousel mirror the anime's ContinueWatching exactly, so an anime home screen
 * and a manga home screen side by side read as the same app. What differs is only the data — the
 * reading history's series, the chapter you are on, and the date you read it.
 */
export function MangaContinueReading({ onHoverImage, withTitle }: MangaContinueReadingProps) {
    const { data: readingHistory, isLoading } = useGetMangaReadingHistory()
    const ts = useThemeSettings()

    // Get current profile
    const { data: currentProfile } = useGetCurrentProfile()

    const router = useRouter()

    const uniqueManga = React.useMemo(() => {
        if (!readingHistory || readingHistory.length === 0) return []
        // Filter to get unique manga (by mediaId) and limit to recent ones
        return readingHistory
            .filter((item, index, self) =>
                index === self.findIndex(t => t.mediaId === item.mediaId),
            )
            .slice(0, 20)
    }, [readingHistory])

    const { inject, remove } = useSeaCommandInject()

    React.useEffect(() => {
        if (!uniqueManga.length) return
        inject("continue-reading-manga", {
            items: uniqueManga.map(item => ({
                data: item,
                id: `manga-${item.mediaId}`,
                value: item.media?.title?.romaji || "",
                heading: "Continue Reading",
                priority: 100,
                render: () => (
                    <>
                        <div className="w-12 aspect-[6/5] flex-none rounded-[--radius-md] relative overflow-hidden">
                            <SeaImage
                                src={item.media?.coverImage?.medium || ""}
                                alt="manga cover"
                                fill
                                className="object-center object-cover"
                            />
                        </div>
                        <div className="flex gap-1 items-center w-full">
                            <p className="max-w-[70%] truncate">{item.media?.title?.romaji || ""}</p>&nbsp;-&nbsp;
                            <p className="text-[--muted]">Ch</p><span>{item.lastChapterNumber || "?"}</span>
                        </div>
                    </>
                ),
                onSelect: () => {
                    router.push(`/manga/entry?id=${item.mediaId}`)
                },
            })),
            filter: ({ item, input }) => {
                if (!input) return true
                return item.value.toLowerCase().includes(input.toLowerCase()) ||
                    seaCommand_compareMediaTitles((item.data as MangaReadingHistory).media?.title, input)
            },
            priority: 100,
        })

        return () => remove("continue-reading-manga")
    }, [uniqueManga, inject, remove, router])

    if (isLoading) {
        return (
            <PageWrapper className="px-4 py-8 space-y-4" data-continue-reading-container>
                <h2 data-continue-reading-title>Continue reading</h2>
                <div className="flex gap-4 overflow-hidden">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-48 h-72 bg-gray-800/50 rounded-lg animate-pulse" />
                    ))}
                </div>
            </PageWrapper>
        )
    }

    if (!uniqueManga.length) {
        return null
    }

    return (
        <PageWrapper className="space-y-3 lg:space-y-6 p-4 relative z-[4]" data-continue-reading-container>
            <h2 data-continue-reading-title>Continue reading</h2>
            {currentProfile?.name && (
                <span className="text-xs text-[--muted] hidden">Profile: {currentProfile.name}</span>
            )}

            <Carousel
                className="w-full max-w-full"
                gap="md"
                opts={{
                    align: "start",
                }}
                autoScroll
                autoScrollDelay={8000}
            >
                <CarouselDotButtons />
                <CarouselContent>
                    {uniqueManga.map((item) => {
                        if (!item.media) return null

                        const hoverImage = item.media.bannerImage || item.media.coverImage?.extraLarge || item.media.coverImage?.large || null

                        return (
                            <CarouselItem
                                key={item.mediaId}
                                className={episodeCardCarouselItemClass(ts.smallerEpisodeCarouselSize)}
                            >
                                <div
                                    onMouseEnter={() => {
                                        if (hoverImage) onHoverImage?.(hoverImage)
                                    }}
                                    onMouseLeave={() => onHoverImage?.(null)}
                                >
                                    <MediaEntryCardWrapper item={item} />
                                </div>
                            </CarouselItem>
                        )
                    })}
                </CarouselContent>
            </Carousel>
        </PageWrapper>
    )
}

/**
 * The card, drawn once so the memo boundary stays between the carousel and the data. Same shape as
 * the anime episode card's: landscape image on top, the chapter you are on, the date below.
 */
const MediaEntryCardWrapper = React.memo(({ item }: {
    item: MangaReadingHistory,
}) => {
    const router = useRouter()

    const progressTotal = item.media?.chapters
    const progressNumber = item.lastChapterNumber ? parseInt(item.lastChapterNumber, 10) : undefined
    const percentage = (!!progressTotal && !!progressNumber && progressNumber <= progressTotal)
        ? Math.round((progressNumber / progressTotal) * 100)
        : undefined

    return (
        <div
            className="rounded-xl space-y-2 flex-none group/episode-card cursor-pointer select-none w-full"
            onClick={() => router.push(`/manga/entry?id=${item.mediaId}`)}
            data-manga-chapter-card
            data-media-id={item.mediaId}
        >
            <div
                data-manga-chapter-card-image-container
                className="w-full h-full rounded-xl overflow-hidden z-[1] aspect-[4/2] relative bg-[--background]"
            >
                {!!(item.media?.bannerImage || item.media?.coverImage?.extraLarge || item.media?.coverImage?.large) ? <SeaImage
                    src={item.media?.bannerImage || item.media?.coverImage?.extraLarge || item.media?.coverImage?.large || ""}
                    alt=""
                    fill
                    quality={100}
                    sizes="20rem"
                    className="object-cover rounded-xl object-center transition lg:group-hover/episode-card:scale-[1.02] duration-200"
                /> : <div
                    className="h-full block rounded-xl absolute w-full bg-gradient-to-t from-gray-800 to-transparent z-[2]"
                />}
            </div>

            <div className="relative z-[3] w-full space-y-0">
                <p
                    data-manga-chapter-card-title
                    className="w-[80%] line-clamp-1 text-md md:text-lg transition-colors duration-200 text-[--foreground] font-semibold"
                >
                    {item.media?.title?.romaji || item.media?.title?.english || item.media?.title?.userPreferred}
                </p>
                <div className="w-full justify-between flex flex-none items-center">
                    <p className="line-clamp-1 flex items-center">
                        <span className="flex-none text-base md:text-xl font-medium">
                            Chapter {progressNumber ?? "?"}
                            {!!progressTotal && progressTotal > 1 && <span className="opacity-40">{` / `}{progressTotal}</span>}
                        </span>
                    </p>
                    {!!item.lastReadAt && (
                        <p className="text-[--muted] flex-none ml-2 text-sm md:text-base line-clamp-2 text-right">
                            {new Date(item.lastReadAt).toLocaleDateString()}
                        </p>
                    )}
                </div>
            </div>

            {!!percentage && (
                <div data-manga-chapter-card-progress-bar-container className="-mt-2">
                    <div className="h-1 w-full rounded-full bg-gray-800 overflow-hidden">
                        <div className="h-full bg-[--brand] rounded-full" style={{ width: `${percentage}%` }} />
                    </div>
                </div>
            )}
        </div>
    )
})
