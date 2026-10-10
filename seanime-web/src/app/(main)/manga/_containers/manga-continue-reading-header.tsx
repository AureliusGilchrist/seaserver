"use client"
import { AL_BaseManga } from "@/api/generated/types"
import { useGetMangaReadingHistory } from "@/api/hooks/manga.hooks"
import { __mangaLibraryHeaderImageAtom } from "@/app/(main)/manga/_components/library-header"
import { TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE } from "@/app/(main)/_features/custom-ui/styles"
import { MediaEntryAudienceScore } from "@/app/(main)/_features/media/_components/media-entry-metadata-components"
import { useMediaPreviewModal } from "@/app/(main)/_features/media/_containers/media-preview-modal"
import { imageShimmer } from "@/components/shared/image-helpers"
import { SeaImage } from "@/components/shared/sea-image"
import { SeaLink } from "@/components/shared/sea-link"
import { TextGenerateEffect } from "@/components/shared/text-generate-effect"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { ProgressBar } from "@/components/ui/progress-bar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ThemeLibraryScreenBannerType, ThemeMediaPageBannerSize, ThemeMediaPageBannerType, useThemeSettings } from "@/lib/theme/hooks"
import { useRouter } from "@/lib/navigation"
import { getAssetUrl } from "@/lib/server/assets"
import { __isDesktop__ } from "@/types/constants"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { useAtom } from "jotai/react"
import { AnimatePresence, motion } from "motion/react"
import React from "react"
import { RiSignalTowerLine } from "react-icons/ri"
import { useWindowScroll } from "react-use"

/**
 * The manga counterpart of the anime continue-watching header: the same banner, the same metadata
 * block on the left, the same chapter card on the right, the same carousel dots below — for what
 * you are reading rather than what you are watching.
 *
 * Built to match rather than to echo: an anime home screen and a manga home screen side by side
 * should read as the same app. What differs is only the data — the reading history's most recent
 * series is the one on the banner, the card on the right is the chapter you are on, and the dots
 * walk the rest. The manga home screen item mounts this; the header also renders in flow (like the
 * anime's, a tall block the toolbar sits under), which is what keeps the toolbar out of the
 * window's title bar.
 */

export const __mangaHeader_currentIndexAtom = atom(0)
export const __mangaHeader_hoveringHeaderAtom = atom(false)
export const __mangaHeader_headerIsTransitioningAtom = atom(false)
export const __mangaHeader_setCurrentIndexAtom = atom(
    null,
    (get, set, newIndex: number) => {
        const currentIndex = get(__mangaHeader_currentIndexAtom)
        if (currentIndex !== newIndex) {
            set(__mangaHeader_headerIsTransitioningAtom, true)
            setTimeout(() => {
                set(__mangaHeader_currentIndexAtom, newIndex)
                set(__mangaHeader_headerIsTransitioningAtom, false)
            }, 300)
        }
    },
)

const MotionImage = motion.create(SeaImage)

type HeaderCarouselDotsProps = {
    totalManga: number
    currentIndex: number
    onIndexChange: (index: number) => void
    className?: string
}

function HeaderCarouselDots({ totalManga, currentIndex, onIndexChange, className }: HeaderCarouselDotsProps) {
    // Don't render if there is no history or only one series
    if (totalManga <= 1) return null

    const maxDots = Math.min(totalManga, 99)

    return (
        <div
            className={cn(
                "hidden lg:flex items-center gap-2 z-[10] pl-8 max-w-[20rem] flex-wrap top-[4.5rem]",
                className,
            )}
        >
            {Array.from({ length: maxDots }).map((_, index) => (
                <button
                    key={index}
                    className={cn(
                        "h-1.5 rounded-sm transition-all duration-300 cursor-pointer",
                        index === currentIndex ? "w-6 bg-[--muted]" : "w-3 bg-[--subtle] hover:bg-gray-300",
                    )}
                    onClick={() => onIndexChange(index)}
                    aria-label={`Go to series ${index + 1}`}
                />
            ))}
        </div>
    )
}

type MediaMetadataProps = {
    manga: NonNullable<ReturnType<typeof useHeaderMangaList>[number]["media"]>
}

function MediaMetadata({ manga }: MediaMetadataProps) {
    const ts = useThemeSettings()
    const { setPreviewModalMediaId } = useMediaPreviewModal()

    return (
        <div
            className={cn(
                "absolute left-2 w-fit h-[20rem] bg-gradient-to-t z-[3] hidden lg:block",
                "top-[5rem]",
                ts.hideTopNavbar && "top-[4rem]",
                (__isDesktop__ && ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small) && "top-[0rem]",
                (__isDesktop__ && ts.mediaPageBannerSize !== ThemeMediaPageBannerSize.Small) && "top-[2rem]",
            )}
            data-media-id={manga.id}
            data-media-mal-id={manga.idMal}
        >
            <motion.div
                className="flex items-center relative gap-6 p-6 pr-3 w-fit overflow-hidden"
                {...{
                    initial: { opacity: 0, x: -40 },
                    animate: { opacity: 1, x: 0 },
                    exit: { opacity: 0, x: -20 },
                    transition: {
                        type: "spring",
                        damping: 20,
                        stiffness: 100,
                    },
                }}
            >
                <motion.div
                    className="flex-none"
                    initial={{ opacity: 0, scale: 0.7, skew: 5 } as any}
                    animate={{ opacity: 1, scale: 1, skew: 0 } as any}
                    exit={{ opacity: 1, scale: 1, skewY: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <SeaLink href={`/manga/entry?id=${manga.id}`}>
                        {manga.coverImage?.large && (
                            <div className="w-[180px] h-[280px] relative rounded-[--radius-md] overflow-hidden bg-[--background] shadow-md">
                                <SeaImage
                                    src={manga.coverImage.large}
                                    alt="cover image"
                                    fill
                                    priority
                                    placeholder={imageShimmer(700, 475)}
                                    className="object-cover object-center transition-opacity duration-1000"
                                />
                            </div>
                        )}
                    </SeaLink>
                </motion.div>

                <motion.div
                    className="flex-auto space-y-2 z-[1]"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                >
                    <SeaLink href={`/manga/entry?id=${manga.id}`}>
                        <TextGenerateEffect
                            className="[text-shadow:_0_1px_10px_rgb(0_0_0_/_20%)] text-white leading-8 line-clamp-2 pb-1 max-w-md text-pretty text-3xl overflow-ellipsis"
                            words={manga.title?.romaji || manga.title?.english || manga.title?.userPreferred || ""}
                        />
                    </SeaLink>

                    <div className="flex flex-wrap gap-2">
                        {manga.genres?.slice(0, 3).map((genre: string) => (
                            <div key={genre} className="text-sm font-semibold px-1 text-gray-300">
                                {genre}
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center max-w-lg gap-4">
                        {manga.meanScore && (
                            <div className="rounded-full w-fit inline-block">
                                <MediaEntryAudienceScore meanScore={manga.meanScore} />
                            </div>
                        )}

                        {manga.status === "RELEASING" && (
                            <p className="text-base text-brand-200 inline-flex items-center gap-1.5">
                                <RiSignalTowerLine /> Releasing now
                            </p>
                        )}
                    </div>

                    <motion.div
                        className="pt-0 left-0"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.7 }}
                    >
                        <ScrollArea className="max-w-lg leading-3 h-[77px] mb-4 p-0 text-sm">
                            {manga.description?.replace(/(<([^>]+)>)/ig, "")}
                        </ScrollArea>

                        <Button
                            size="sm"
                            intent="gray-outline"
                            className="rounded-full"
                            onClick={() => setPreviewModalMediaId(manga.id, "manga")}
                        >
                            Preview
                        </Button>
                    </motion.div>
                </motion.div>
            </motion.div>
        </div>
    )
}

type ChapterCardSidebarProps = {
    item: NonNullable<ReturnType<typeof useHeaderMangaList>[number]>
    isTransitioning: boolean
}

/**
 * The right-hand card, the same slot the anime header puts the episode card in: what you are up to,
 * as a card. For manga that is the chapter — its number against the total, the date you read it,
 * and the reading progress bar along the bottom edge.
 */
function ChapterCardSidebar({ item, isTransitioning }: ChapterCardSidebarProps) {
    const ts = useThemeSettings()
    const router = useRouter()
    const manga = item.media

    if (!manga) return null

    const progressTotal = manga.chapters
    const progressNumber = item.lastChapterNumber ? parseInt(item.lastChapterNumber, 10) : undefined
    const percentage = (!!progressTotal && !!progressNumber && progressNumber <= progressTotal)
        ? Math.round((progressNumber / progressTotal) * 100)
        : undefined

    return (
        <motion.div
            className={cn(
                "absolute right-6 w-fit h-[25rem] z-[3] hidden lg:block overflow-hidden",
                "top-[5rem]",
                ts.hideTopNavbar && "top-[4rem]",
                (__isDesktop__ && ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small) && "top-[1rem]",
                (__isDesktop__ && ts.mediaPageBannerSize !== ThemeMediaPageBannerSize.Small) && "top-[3rem]",
            )}
        >
            <div className="p-6 w-fit">
                <motion.div
                    {...{
                        initial: { opacity: 0, x: 40 },
                        animate: { opacity: 1, x: 0 },
                        exit: { opacity: 0, x: 20 },
                        transition: {
                            type: "spring",
                            damping: 20,
                            stiffness: 100,
                        },
                    }}
                    className="2xl:w-[500px] xl:w-[400px] lg:w-[300px] rounded-xl overflow-hidden"
                >
                    <div
                        className="rounded-xl space-y-2 flex-none group/episode-card cursor-pointer select-none w-full"
                        onClick={() => router.push(`/manga/entry?id=${manga.id}`)}
                        data-manga-chapter-card
                        data-media-id={manga.id}
                    >
                        <div
                            data-manga-chapter-card-image-container
                            className="w-full h-full rounded-xl overflow-hidden z-[1] aspect-[4/2] relative bg-[--background]"
                        >
                            {!!(item.media?.bannerImage || item.media?.coverImage?.extraLarge) ? <SeaImage
                                src={item.media?.bannerImage || item.media?.coverImage?.extraLarge || ""}
                                alt=""
                                fill
                                quality={100}
                                priority
                                placeholder={imageShimmer(700, 475)}
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
                                {manga.title?.romaji || manga.title?.english || manga.title?.userPreferred}
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
                            <div
                                data-manga-chapter-card-progress-bar-container
                                className="-mt-2"
                            >
                                <ProgressBar value={percentage} size="xs" />
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    )
}

type BannerImageProps = {
    manga: ReturnType<typeof useHeaderMangaList>[number]["media"] | null
    isTransitioning: boolean
    shouldBlurBanner: boolean
}

function BannerImage({ manga, isTransitioning, shouldBlurBanner }: BannerImageProps) {
    const ts = useThemeSettings()
    const bannerImage = (!!ts.libraryScreenCustomBannerImage
        && ts.libraryScreenBannerType === ThemeLibraryScreenBannerType.Custom) ? getAssetUrl(ts.libraryScreenCustomBannerImage) :
        manga?.bannerImage || manga?.coverImage?.extraLarge

    const { y } = useWindowScroll()

    const [dimmed, setDimmed] = React.useState(false)
    React.useEffect(() => {
        if (y > 100)
            setDimmed(true)
        else
            setDimmed(false)
    }, [(y > 100)])

    return (
        <div
            data-continue-watching-header-banner-image
            className={cn(
                "lg:h-[35rem] w-full flex-none object-cover object-center top-0 bg-[--background] absolute",
                !ts.libraryScreenCustomBackgroundImage && "fixed",
                !ts.disableSidebarTransparency && TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE,
                __isDesktop__ && "top-[-2rem]",
                ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small && "lg:h-[30rem]",
            )}
        >
            <div className="w-full z-[2] absolute bottom-[-10rem] h-[10rem] bg-gradient-to-b from-[--background] via-transparent via-100% to-transparent" />
            <div className="w-full absolute z-[2] top-0 h-[10rem] opacity-50 bg-gradient-to-b from-[--background] to-transparent" />
            <div
                className={cn(
                    "opacity-0 duration-1000 bg-[var(--background)] w-full h-full absolute z-[2]",
                    isTransitioning && "opacity-70",
                )}
            />

            <AnimatePresence>
                <div className="w-full h-full absolute z-[1] overflow-hidden scroll-locked-offset-width">
                    {bannerImage && (
                        <MotionImage
                            src={bannerImage}
                            alt="banner image"
                            fill
                            quality={100}
                            priority
                            className={cn(
                                "object-cover object-center z-[1] transition-all duration-1000",
                                isTransitioning && "scale-[1.01] -translate-x-0.5",
                                !isTransitioning && "scale-100 translate-x-0",
                                !manga?.bannerImage && "opacity-35",
                                { "opacity-5": dimmed },
                            )}
                        />
                    )}
                </div>
            </AnimatePresence>

            {shouldBlurBanner && (
                <div className="absolute top-0 w-full h-full backdrop-blur-2xl z-[2]" />
            )}

            <div
                className={cn(
                    "hidden lg:block max-w-[80rem] w-full z-[2] h-full absolute left-0 bg-gradient-to-r from-[--background] from-5% via-[--background] transition-opacity via-opacity-50 via-5% to-transparent",
                    "opacity-100 duration-500",
                )}
            />

            <div
                className={cn(
                    "hidden lg:block max-w-[60rem] w-full right-0 z-[2] h-full absolute &-bottom-[10rem] bg-gradient-to-l from-[--background] from-5% via-[--background] via-opacity-50 via-5% transition-opacity to-transparent",
                    "opacity-90 duration-500",
                )}
            />

            {!ts.disableSidebarTransparency && (
                <div
                    className={cn(
                        "hidden lg:block max-w-[10rem] w-full z-[2] h-full absolute left-0 bg-gradient-to-r from-[--background] via-[--background] transition-opacity via-opacity-50 via-5% to-transparent",
                        "opacity-70 duration-500",
                    )}
                />
            )}

            <div className="w-full z-[2] absolute bottom-0 h-[20rem] bg-gradient-to-t from-[--background] via-[--background] via-opacity-50 via-10% to-transparent" />
        </div>
    )
}

type HeaderHistoryItem = {
    mediaId: number
    lastReadAt: string
    lastChapterNumber: string
    isSynthetic: boolean
    media?: AL_BaseManga
}

function useHeaderMangaList(): HeaderHistoryItem[] {
    const { data: readingHistory } = useGetMangaReadingHistory()

    return React.useMemo(() => {
        if (!readingHistory || readingHistory.length === 0) return []
        return readingHistory
            .filter((item, index, self) =>
                index === self.findIndex(t => t.mediaId === item.mediaId),
            )
            .slice(0, 20) as HeaderHistoryItem[]
    }, [readingHistory])
}

export function MangaContinueReadingHeader({ onHoverImage, className }: { onHoverImage?: (image: string | null) => void, className?: string }) {
    const ts = useThemeSettings()

    const uniqueManga = useHeaderMangaList()

    const currentIndex = useAtomValue(__mangaHeader_currentIndexAtom)
    const isTransitioning = useAtomValue(__mangaHeader_headerIsTransitioningAtom)
    const setCurrentIndex = useSetAtom(__mangaHeader_setCurrentIndexAtom)
    const [isHoveringHeader, setHoveringHeader] = useAtom(__mangaHeader_hoveringHeaderAtom)

    const currentMangaItem = uniqueManga[currentIndex] || uniqueManga[0] || null
    const manga = currentMangaItem?.media ?? null

    const shouldBlurBanner = ts.mediaPageBannerType === ThemeMediaPageBannerType.BlurWhenUnavailable &&
        !manga?.bannerImage

    // The banner behind the header follows the series on show — the same atom the manga library
    // header reads, so the wallpaper and the card agree.
    const setHeaderImage = useSetAtom(__mangaLibraryHeaderImageAtom)

    React.useEffect(() => {
        if (!manga) return
        setHeaderImage(manga.bannerImage || manga.coverImage?.extraLarge || null)
        onHoverImage?.(manga.bannerImage || manga.coverImage?.extraLarge || null)
    }, [manga?.id])

    // Walk the recent series when nobody is hovering, the way the anime header does.
    React.useEffect(() => {
        if (uniqueManga.length <= 1) return

        const interval = setInterval(() => {
            if (!isHoveringHeader) {
                setCurrentIndex((currentIndex + 1) % uniqueManga.length)
            }
        }, 8000)

        return () => clearInterval(interval)
    }, [currentIndex, uniqueManga.length, isHoveringHeader, setCurrentIndex])

    if (!uniqueManga.length) return null

    return (
        <motion.div
            className={cn(
                "__header lg:h-[28rem] max-w-full overflow-hidden",
                ts.hideTopNavbar && "lg:h-[32rem]",
                ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small && "lg:h-[26rem]",
                (ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small && ts.hideTopNavbar) && "lg:h-[28rem]",
                className,
            )}
            {...{
                initial: { opacity: 0 },
                animate: { opacity: 1 },
                transition: { duration: 1.2 },
            }}
        >

            <BannerImage
                manga={manga}
                isTransitioning={isTransitioning}
                shouldBlurBanner={shouldBlurBanner}
            />

            <AnimatePresence>
                {manga && !isTransitioning && (
                    <>
                        <MediaMetadata manga={manga} />
                        <ChapterCardSidebar item={currentMangaItem!} isTransitioning={isTransitioning} />
                    </>
                )}
            </AnimatePresence>

            <HeaderCarouselDots
                totalManga={uniqueManga.length}
                currentIndex={currentIndex}
                onIndexChange={setCurrentIndex}
            />
        </motion.div>
    )
}
