"use client"
import { useGetCurrentProfile } from "@/api/hooks/profiles.hooks"
import { useSeaCommandInject } from "@/app/(main)/_features/sea-command/use-inject"
import { seaCommand_compareMediaTitles } from "@/app/(main)/_features/sea-command/utils"
import { episodeCardCarouselItemClass } from "@/components/shared/classnames"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaImage } from "@/components/shared/sea-image"
import { SeaLink } from "@/components/shared/sea-link"
import { Carousel, CarouselContent, CarouselDotButtons, CarouselItem } from "@/components/ui/carousel"
import { cn } from "@/components/ui/core/styling"
import { useThemeSettings } from "@/lib/theme/hooks"
import { useRouter } from "@/lib/navigation"
import React from "react"
import { LuBookMarked } from "react-icons/lu"
import { MangaContinueReadingEntry } from "@/app/(main)/manga/_lib/use-manga-continue-reading"

interface MangaContinueReadingProps {
    list: MangaContinueReadingEntry[]
    onHoverImage?: (image: string | null) => void
    withTitle?: boolean
}

/**
 * The manga counterpart of the anime Continue Watching section: the same heading, the same carousel
 * shape, the same card — for chapters rather than episodes.
 *
 * The list comes from the collection the way the anime's does, so the section renders whenever
 * there is something to continue and never goes blank on a data hiccup. What differs is only the
 * data — the series, the chapter you are on, and the date you read it. An entry the endpoint could
 * not enrich takes a placeholder tile, which is a way in rather than a dead space.
 */
export function MangaContinueReading({ list, onHoverImage, withTitle }: MangaContinueReadingProps) {
    const ts = useThemeSettings()

    // Get current profile
    const { data: currentProfile } = useGetCurrentProfile()

    const router = useRouter()

    const { inject, remove } = useSeaCommandInject()

    React.useEffect(() => {
        if (!list.length) return
        inject("continue-reading-manga", {
            items: list.map(item => ({
                data: item,
                id: `manga-${item.mediaId}`,
                value: item.media?.title?.romaji || "",
                heading: "Continue Reading",
                priority: 100,
                render: () => (
                    <>
                        <div className="w-12 aspect-[6/5] flex-none rounded-[--radius-md] relative overflow-hidden">
                            {!!item.media?.coverImage?.medium && <SeaImage
                                src={item.media.coverImage.medium}
                                alt="manga cover"
                                fill
                                className="object-center object-cover"
                            />}
                        </div>
                        <div className="flex gap-1 items-center w-full">
                            <p className="max-w-[70%] truncate">{item.media?.title?.romaji || `Manga ID: ${item.mediaId}`}</p>&nbsp;-&nbsp;
                            <p className="text-[--muted]">Ch</p><span>{item.chapterNumber ?? "?"}</span>
                        </div>
                    </>
                ),
                onSelect: () => {
                    router.push(`/manga/entry?id=${item.mediaId}`)
                },
            })),
            filter: ({ item, input }) => {
                if (!input) return true
                const data = item.data as MangaContinueReadingEntry
                const media = data.media
                return (item.value.toLowerCase().includes(input.toLowerCase())) ||
                    (!!media && seaCommand_compareMediaTitles(media.title, input)) ||
                    `manga id ${data.mediaId}`.includes(input.toLowerCase())
            },
            priority: 100,
        })

        return () => remove("continue-reading-manga")
    }, [list, inject, remove, router])

    if (!list.length) {
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
                    {list.map((item) => {
                        const hoverImage = item.media?.bannerImage || item.media?.coverImage?.extraLarge || item.media?.coverImage?.large || null

                        if (!item.media) {
                            // No metadata — the endpoint never enriched this one. The tile keeps
                            // its ID and its chapter number, and it opens the entry page, where the
                            // server fetches what is missing in the background.
                            return (
                                <CarouselItem
                                    key={`history-${item.mediaId}`}
                                    className={episodeCardCarouselItemClass(ts.smallerEpisodeCarouselSize)}
                                >
                                    <SeaLink
                                        href={`/manga/entry?id=${item.mediaId}`}
                                        className="block h-full group/dl-card"
                                        onMouseEnter={() => onHoverImage?.(null)}
                                        onMouseLeave={() => onHoverImage?.(null)}
                                    >
                                        <div
                                            className={cn(
                                                "relative aspect-[4/2] w-full overflow-hidden rounded-xl",
                                                "border border-gray-800 bg-gray-900/70",
                                                "flex flex-col items-center justify-center gap-2",
                                                "transition group-hover/dl-card:border-gray-600 group-hover/dl-card:bg-gray-900",
                                            )}
                                        >
                                            <LuBookMarked className="text-4xl text-gray-700" />
                                            <p className="px-3 text-center text-xs text-[--muted]">Manga ID: {item.mediaId}</p>
                                        </div>
                                        <div className="pt-2 space-y-0.5">
                                            <p className="text-sm font-semibold text-white line-clamp-1">Chapter {item.chapterNumber ?? "?"}</p>
                                        </div>
                                    </SeaLink>
                                </CarouselItem>
                            )
                        }

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
    item: MangaContinueReadingEntry,
}) => {
    const router = useRouter()

    const progressTotal = item.chaptersTotal
    const progressNumber = item.chapterNumber
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
