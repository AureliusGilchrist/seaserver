"use client"
import { useGetMangaReadingHistory } from "@/api/hooks/manga.hooks"
import { __mangaLibraryHeaderImageAtom } from "@/app/(main)/manga/_components/library-header"
import { SeaImage } from "@/components/shared/sea-image"
import { TextGenerateEffect } from "@/components/shared/text-generate-effect"
import { SeaLink } from "@/components/shared/sea-link"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/components/ui/core/styling"
import { imageShimmer } from "@/components/shared/image-helpers"
import { useMediaPreviewModal } from "@/app/(main)/_features/media/_containers/media-preview-modal"
import { __isDesktop__ } from "@/types/constants"
import { atom, useAtomValue, useSetAtom } from "jotai"
import { motion } from "motion/react"
import React from "react"
import { RiSignalTowerLine } from "react-icons/ri"
import { ThemeMediaPageBannerSize, useThemeSettings } from "@/lib/theme/hooks"

/**
 * The manga counterpart of the anime continue-watching header: the same banner, the same card on
 * the left, the same description, genres and score — for what you are reading rather than what you
 * are watching.
 *
 * Built to match rather than to echo: an anime home screen and a manga home screen side by side
 * should read as the same app. What differs is only the data — the reading history's most recent
 * series is the one on the banner, and the carousel dots below it walk the rest.
 */

export const __mangaHeader_currentIndexAtom = atom(0)

export function MangaContinueReadingHeader({ onHoverImage }: { onHoverImage?: (image: string | null) => void }) {
    const { data: readingHistory } = useGetMangaReadingHistory()
    const ts = useThemeSettings()
    const { setPreviewModalMediaId } = useMediaPreviewModal()

    const currentIndex = useAtomValue(__mangaHeader_currentIndexAtom)
    const setCurrentIndex = useSetAtom(__mangaHeader_currentIndexAtom)

    const uniqueManga = React.useMemo(() => {
        if (!readingHistory || readingHistory.length === 0) return []
        return readingHistory
            .filter((item, index, self) =>
                index === self.findIndex(t => t.mediaId === item.mediaId),
            )
            .slice(0, 20)
    }, [readingHistory])

    const manga = uniqueManga[currentIndex]?.media ?? uniqueManga[0]?.media ?? null

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
            setCurrentIndex(prev => (prev + 1) % uniqueManga.length)
        }, 8000)
        return () => clearInterval(interval)
    }, [uniqueManga.length, setCurrentIndex])

    if (!manga) return null

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
        >
            <motion.div
                className="flex items-center relative gap-6 p-6 pr-3 w-fit overflow-hidden"
                {...{
                    initial: { opacity: 0, x: -40 },
                    animate: { opacity: 1, x: 0 },
                    transition: { type: "spring", damping: 20, stiffness: 100 },
                }}
            >
                <motion.div
                    className="flex-none"
                    initial={{ opacity: 0, scale: 0.7 } as any}
                    animate={{ opacity: 1, scale: 1 } as any}
                    transition={{ duration: 0.5 }}
                >
                    <SeaLink href={`/manga/entry?id=${manga.id}`}>
                        {(manga.coverImage?.large) && (
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
                        {!!manga.meanScore && (
                            <div className="rounded-full w-fit inline-block">
                                <span className="text-sm font-semibold text-gray-200">{(manga.meanScore / 10).toFixed(1)}</span>
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
