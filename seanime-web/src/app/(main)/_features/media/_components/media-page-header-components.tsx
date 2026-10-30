import { AL_BaseAnime, AL_BaseManga, AL_MediaStatus, Anime_EntryListData, Manga_EntryListData, Nullish } from "@/api/generated/types"
import { TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE } from "@/app/(main)/_features/custom-ui/styles"
import { AnilistSyncIndicator } from "@/app/(main)/_features/media/_components/anilist-sync-indicator"
import { AnilistMediaEntryModal } from "@/app/(main)/_features/media/_containers/anilist-media-entry-modal"
import { imageShimmer } from "@/components/shared/image-helpers"
import { SeaImage } from "@/components/shared/sea-image"
import { TextGenerateEffect } from "@/components/shared/text-generate-effect"
import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Popover } from "@/components/ui/popover"
import { Tooltip } from "@/components/ui/tooltip"
import { getScoreColor } from "@/lib/helpers/score"
import { getImageUrl } from "@/lib/server/assets"
import { ThemeMediaPageBannerSize, ThemeMediaPageBannerType, ThemeMediaPageInfoBoxSize, useIsMobile, useThemeSettings } from "@/lib/theme/hooks"
import capitalize from "lodash/capitalize"
import { AnimatePresence, easeInOut, easeOut, motion, useMotionTemplate, useScroll, useSpring, useTransform } from "motion/react"
import React from "react"
import { BiCalendarAlt, BiSolidStar, BiStar } from "react-icons/bi"
import { LuChevronDown } from "react-icons/lu"
import { MdOutlineSegment } from "react-icons/md"
import { RiSignalTowerFill } from "react-icons/ri"
import { useWindowSize } from "react-use"

const MotionImage = motion.create(SeaImage)

// Every scroll-driven value in the header is a motion value: it follows the scroll position without
// re-rendering the page, and the spring smooths the steps a mouse wheel makes into one glide.
const SCROLL_SPRING = { stiffness: 140, damping: 30, mass: 0.5, restDelta: 0.001 }

/** How far down the page the banner takes to fade out. */
const BANNER_FADE_END = 560

type MediaPageHeaderProps = {
    children?: React.ReactNode
    backgroundImage?: string
    coverImage?: string
}

export function MediaPageHeader(props: MediaPageHeaderProps) {

    const {
        children,
        backgroundImage,
        coverImage,
        ...rest
    } = props

    const ts = useThemeSettings()
    const { isMobile } = useIsMobile()

    const bannerImage = backgroundImage || coverImage
    const [failedBannerImage, setFailedBannerImage] = React.useState<string | null>(null)
    React.useEffect(() => {
        setFailedBannerImage(null)
    }, [backgroundImage, coverImage])
    const visibleBannerImage = bannerImage === failedBannerImage
        ? (coverImage && coverImage !== failedBannerImage ? coverImage : null)
        : bannerImage
    const shouldHideBanner = (
        (ts.mediaPageBannerType === ThemeMediaPageBannerType.HideWhenUnavailable && !backgroundImage)
        || ts.mediaPageBannerType === ThemeMediaPageBannerType.Hide
    )
    const shouldBlurBanner = (ts.mediaPageBannerType === ThemeMediaPageBannerType.BlurWhenUnavailable && !backgroundImage) ||
        ts.mediaPageBannerType === ThemeMediaPageBannerType.Blur

    const shouldDimBanner = (ts.mediaPageBannerType === ThemeMediaPageBannerType.DimWhenUnavailable && !backgroundImage) ||
        ts.mediaPageBannerType === ThemeMediaPageBannerType.Dim

    // With a custom wallpaper the banner scrolls away with the page (it sits on the wallpaper);
    // otherwise it is fixed behind the content and fades out as the page scrolls over it.
    const isFixedBanner = !ts.libraryScreenCustomBackgroundImage

    const { scrollY } = useScroll()
    const bannerOpacity = useSpring(
        useTransform(scrollY, [0, 90, BANNER_FADE_END], [1, 1, shouldDimBanner ? 0.15 : 0.06], { ease: easeInOut }),
        SCROLL_SPRING,
    )
    const bannerBlurPx = useSpring(useTransform(scrollY, [60, BANNER_FADE_END], [0, 10], { ease: easeOut }), SCROLL_SPRING)
    const bannerFilter = useMotionTemplate`blur(${bannerBlurPx}px)`
    const bannerScale = useSpring(useTransform(scrollY, [0, BANNER_FADE_END], [1, 1.06]), SCROLL_SPRING)
    const bannerY = useSpring(useTransform(scrollY, [0, BANNER_FADE_END], [0, isMobile ? 0 : -70]), SCROLL_SPRING)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="__meta-page-header relative group/media-page-header"
            data-media-page-header
        >

            {/* The blurred-banner background layer is gone: it was a full-screen opaque layer that
                faded in after load and covered the wallpaper and its effects. */}

            {children}

            <motion.div
                data-media-page-header-banner
                className={cn(
                    "w-full scroll-locked-offset flex-none object-cover object-center z-[3] bg-[--background] h-[20rem]",
                    ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small ? "lg:h-[28rem]" : "h-[20rem] lg:h-[32rem] 2xl:h-[34rem]",
                    isFixedBanner ? "fixed top-0 will-change-[opacity]" : "absolute -top-[5rem]",
                    !ts.disableSidebarTransparency && TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE,
                    shouldHideBanner && "bg-transparent",
                )}
                style={isFixedBanner ? { opacity: bannerOpacity } : undefined}
            >
                {/*TOP FADE*/}
                <div
                    data-media-page-header-banner-top-gradient
                    className={cn(
                        "w-full absolute z-[2] top-0 h-[8rem] opacity-40 bg-gradient-to-b from-[--background] to-transparent via",
                    )}
                />

                {/*BOTTOM OVERFLOW FADE*/}
                <div
                    data-media-page-header-banner-bottom-gradient
                    className={cn(
                        "w-full z-[2] absolute scroll-locked-offset bottom-[-5rem] h-[5em] bg-gradient-to-b from-[--background] via-transparent via-100% to-transparent",
                        !ts.disableSidebarTransparency && TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE,
                        shouldHideBanner && "hidden",
                    )}
                />

                <motion.div
                    data-media-page-header-banner-image-container
                    className={cn(
                        "absolute top-0 left-0 scroll-locked-offset w-full h-full overflow-hidden will-change-transform",
                        shouldHideBanner && "hidden",
                    )}
                    style={isFixedBanner ? { scale: bannerScale, y: bannerY, filter: bannerFilter } : undefined}
                >
                    {!!visibleBannerImage && <MotionImage
                        data-media-page-header-banner-image
                        src={getImageUrl(visibleBannerImage)}
                        alt="banner image"
                        fill
                        quality={100}
                        priority
                        sizes="100vw"
                        onError={() => setFailedBannerImage(visibleBannerImage)}
                        className={cn(
                            "object-cover object-center scroll-locked-offset z-[1]",
                            shouldBlurBanner && "blur",
                        )}
                        initial={{ scale: 1.05, x: 0, y: -10, opacity: 0 }}
                        animate={{ scale: 1, x: 0, y: 1, opacity: shouldDimBanner ? 0.3 : 1 }}
                        transition={{ duration: 0.8, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
                    />}

                    {/* Banner scanlines removed: scanlines (and the other anime-theme / effects-preset
                        decorations) belong to the TRUE background only. The page header is now layered
                        above the global effects (see anime-entry-page.tsx) so the banner stays clean. */}

                    {/*LEFT MASK*/}
                    <div
                        data-media-page-header-banner-left-gradient
                        className={cn(
                            "hidden lg:block max-w-[60rem] lg:max-w-[100rem] xl:max-w-[90%] w-full z-[2] h-full absolute left-0 bg-gradient-to-r from-[--background] to-transparent",
                            "opacity-95",
                        )}
                    />
                    <div
                        data-media-page-header-banner-right-gradient
                        className={cn(
                            "hidden lg:block max-w-[60rem] xl:max-w-[80rem] w-full z-[2] h-full absolute left-0 bg-gradient-to-r from-[--background] from-25% to-transparent",
                            "opacity-50",
                        )}
                    />
                </motion.div>

                {/*BOTTOM FADE*/}
                <div
                    data-media-page-header-banner-bottom-gradient
                    className={cn(
                        "w-full z-[3] absolute bottom-0 h-[70%] bg-gradient-to-t from-[--background] from-0% via-[--background]/80 via-30% to-transparent to-100%",
                        shouldHideBanner && "hidden",
                    )}
                />

                <div
                    data-media-page-header-banner-dim
                    className={cn(
                        "absolute h-full w-full block lg:hidden bg-[--background] opacity-70 z-[2]",
                        shouldHideBanner && "hidden",
                    )}
                />

            </motion.div>
        </motion.div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type MediaPageHeaderDetailsContainerProps = {
    children?: React.ReactNode
}

export function MediaPageHeaderDetailsContainer(props: MediaPageHeaderDetailsContainerProps) {

    const {
        children,
        ...rest
    } = props

    const ts = useThemeSettings()
    const { width } = useWindowSize()

    // On desktop the details drift up and dim as the content scrolls over them, on the same
    // smoothed curve as the banner instead of a jump once a threshold is crossed.
    const { scrollY } = useScroll()
    const detailsOpacity = useSpring(useTransform(scrollY, [160, 640], [1, 0.12], { ease: easeInOut }), SCROLL_SPRING)
    const detailsY = useSpring(useTransform(scrollY, [0, 640], [0, -40], { ease: easeOut }), SCROLL_SPRING)

    return (
        <>
            <motion.div
                className="relative z-[4]"
                style={width >= 1024 ? { opacity: detailsOpacity, y: detailsY } : undefined}
            >
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                    className="relative z-[4]"
                    data-media-page-header-details-container
                >
                    <div
                        data-media-page-header-details-inner-container
                        className={cn(
                            "space-y-6 p-6 sm:p-8 relative",
                            ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small && "p-6 sm:py-4 sm:px-8",
                            ts.mediaPageBannerInfoBoxSize === ThemeMediaPageInfoBoxSize.Fluid
                                ? "w-full"
                                : "lg:max-w-[100%] xl:max-w-[80%] 2xl:max-w-[65rem] 5xl:max-w-[80rem]",
                        )}
                    >
                        <motion.div
                            {...{
                                initial: { opacity: 0 },
                                animate: { opacity: 1 },
                                exit: { opacity: 0 },
                                transition: {
                                    type: "spring",
                                    damping: 20,
                                    stiffness: 100,
                                    delay: 0.1,
                                },
                            }}
                            className="space-y-5"
                            data-media-page-header-details-motion-container
                        >

                            {children}

                        </motion.div>

                    </div>
                </motion.div>
            </motion.div>
        </>
    )
}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


type MediaPageHeaderEntryDetailsProps = {
    children?: React.ReactNode
    coverImage?: string
    color?: string
    title?: string
    englishTitle?: string
    romajiTitle?: string
    startDate?: { year?: number, month?: number }
    season?: string
    progressTotal?: number
    status?: AL_MediaStatus
    description?: string
    smallerTitle?: boolean

    listData?: Anime_EntryListData | Manga_EntryListData
    media: AL_BaseAnime | AL_BaseManga
    type: "anime" | "manga"
    offlineAnilistAnimeEntryModal?: React.ReactNode
}

export function MediaPageHeaderEntryDetails(props: MediaPageHeaderEntryDetailsProps) {

    const {
        children,
        coverImage,
        title,
        englishTitle,
        romajiTitle,
        startDate,
        season,
        progressTotal,
        status,
        description,
        color,
        smallerTitle,

        listData,
        media,
        type,
        offlineAnilistAnimeEntryModal,
        ...rest
    } = props

    const ts = useThemeSettings()
    const { scrollY } = useScroll()
    const coverScale = useSpring(useTransform(scrollY, [0, 500], [1, 1.05]), SCROLL_SPRING)

    const showEnglish = !!englishTitle && title?.toLowerCase() !== englishTitle?.toLowerCase()
    const showRomaji = !!romajiTitle && title?.toLowerCase() !== romajiTitle?.toLowerCase()
    const showNative = !!media?.title?.native && title !== media.title.native

    return (
        <>
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-10" data-media-page-header-entry-details>

                {!!coverImage && <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                    data-media-page-header-entry-details-cover-image-container
                    className={cn(
                        "flex-none aspect-[6/8] max-w-[150px] mx-auto lg:m-0 h-auto sm:max-w-[200px] lg:max-w-[230px] w-full relative rounded-[--radius-md] overflow-hidden bg-[--background] block",
                        "shadow-[0_20px_50px_-12px_rgb(0_0_0_/_0.7)] ring-1 ring-white/10",
                        ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small && "max-w-[150px] lg:m-0 h-auto sm:max-w-[195px] lg:max-w-[210px] -top-1",
                        ts.mediaPageBannerInfoBoxSize === ThemeMediaPageInfoBoxSize.Fluid && "lg:max-w-[270px]",
                        (ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small && ts.mediaPageBannerInfoBoxSize === ThemeMediaPageInfoBoxSize.Fluid) && "lg:max-w-[220px]",
                    )}
                >
                    <motion.div className="w-full h-full" style={{ scale: coverScale }}>
                        <MotionImage
                            data-media-page-header-entry-details-cover-image
                            src={getImageUrl(coverImage)}
                            alt="cover image"
                            fill
                            priority
                            placeholder={imageShimmer(700, 475)}
                            className="object-cover object-center"
                            initial={{ scale: 1.1, x: 0 }}
                            animate={{ scale: 1, x: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                    </motion.div>
                </motion.div>}


                <div
                    data-media-page-header-entry-details-content
                    className={cn(
                        "space-y-3 lg:space-y-4 min-w-0 flex-1",
                        (ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small || ts.mediaPageBannerInfoBoxSize === ThemeMediaPageInfoBoxSize.Fluid) && "lg:space-y-3",
                    )}
                >
                    {/*DATE & STATUS — a quiet eyebrow above the title*/}
                    {(!!startDate?.year || !!status) && (
                        <div
                            className="flex gap-x-3 gap-y-1 items-center flex-wrap justify-center lg:justify-start text-xs font-semibold uppercase tracking-[0.14em] text-white/60"
                            data-media-page-header-entry-details-date-container
                        >
                            {!!startDate?.year && <p className="flex gap-1.5 items-center">
                                <BiCalendarAlt className="text-sm" /> {new Intl.DateTimeFormat("en-US", {
                                year: "numeric",
                                month: "short",
                            }).format(new Date(startDate?.year || 0, startDate?.month ? startDate?.month - 1 : 0))}{!!season
                                ? ` · ${capitalize(season)}`
                                : ""}
                            </p>}

                            {!!startDate?.year && !!status && <span className="size-1 rounded-full bg-white/30" />}

                            {!!status && <Badge
                                size="sm"
                                intent={status === "RELEASING" ? "primary" : "gray"}
                                className="bg-transparent border-transparent dark:text-brand-200 px-0 rounded-none text-xs font-semibold uppercase tracking-[0.14em]"
                                leftIcon={<RiSignalTowerFill />}
                                data-media-page-header-entry-details-date-badge
                            >
                                {capitalize(status || "")?.replaceAll("_", " ")}
                            </Badge>}

                            {ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small && !!description && <Popover
                                trigger={
                                    <IconButton
                                        intent="white-subtle"
                                        className="rounded-full"
                                        size="xs"
                                        icon={<MdOutlineSegment />}
                                    />
                                }
                                className="max-w-[40rem] bg-[--background] p-4 w-[20rem] lg:w-[40rem] text-md normal-case tracking-normal font-normal"
                            >
                                <span className="transition-colors">{description?.replace(/(<([^>]+)>)/ig, "")}</span>
                            </Popover>}
                        </div>
                    )}

                    {/*TITLE*/}
                    <div className="space-y-1.5" data-media-page-header-entry-details-title-container>
                        <TextGenerateEffect
                            className={cn(
                                "[text-shadow:_0_2px_18px_rgb(0_0_0_/_35%)] text-white line-clamp-2 pb-1 text-center lg:text-left text-pretty text-3xl 2xl:text-5xl font-bold tracking-tight xl:max-w-[50vw]",
                                smallerTitle && "text-3xl 2xl:text-3xl",
                            )}
                            words={title || ""}
                        />
                        {showEnglish &&
                            <h4 className="text-white/85 text-lg font-medium line-clamp-1 text-center lg:text-left xl:max-w-[50vw]">{englishTitle}</h4>}
                        {(showRomaji || showNative) && <p
                            className="flex flex-wrap gap-x-2 justify-center lg:justify-start text-sm text-white/50 xl:max-w-[50vw]"
                            data-media-page-header-entry-details-alt-titles
                        >
                            {showRomaji && <span className="line-clamp-1">{romajiTitle}</span>}
                            {showRomaji && showNative && <span className="text-white/25">·</span>}
                            {showNative && <span className="line-clamp-1 tracking-wide" lang="ja">{media.title!.native}</span>}
                        </p>}
                    </div>

                    {/*LIST*/}
                    <div
                        className="flex justify-center lg:justify-start"
                        data-media-page-header-entry-details-more-info
                    >
                        <div className="inline-flex flex-wrap gap-2 md:gap-4 items-center justify-center rounded-2xl bg-black/25 px-4 py-1.5 ring-1 ring-white/10 backdrop-blur-md">
                            <MediaPageHeaderScoreAndProgress
                                score={listData?.score}
                                progress={listData?.progress}
                                episodes={progressTotal}
                            />

                            <AnilistMediaEntryModal listData={listData} media={media} type={type} />

                            {(listData?.status || listData?.repeat) &&
                                <div
                                    data-media-page-header-entry-details-status
                                    className="text-base text-white md:text-md font-medium tracking-wide flex items-center"
                                >{capitalize(listData?.status === "CURRENT"
                                    ? type === "anime" ? "watching" : "reading"
                                    : listData?.status)}
                                    {listData?.repeat && <Tooltip
                                        trigger={<Badge
                                            size="md"
                                            intent="gray"
                                            className="ml-3"
                                            data-media-page-header-entry-details-repeating-badge
                                        >
                                            {listData?.repeat}

                                        </Badge>}
                                    >
                                        {listData?.repeat} {type === "anime" ? "rewatch" : "reread"}{listData?.repeat > 1
                                        ? type === "anime" ? "es" : "s"
                                        : ""}
                                    </Tooltip>}
                                </div>}

                            <AnilistSyncIndicator mediaId={media?.id} />
                        </div>
                    </div>

                    {ts.mediaPageBannerSize !== ThemeMediaPageBannerSize.Small && !!description &&
                        <MediaPageHeaderDescription description={description} />}

                    {children}

                </div>

            </div>
        </>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Secondary hero metadata (credits, rankings…) folded behind a toggle so the hero stays calm.
 * Nothing in it is dropped: it is one click away, and it opens with the same easing as "Read more".
 */
export function MediaPageHeaderMoreDetails({ label = "More details", children, className }: {
    label?: string
    children: React.ReactNode
    className?: string
}) {
    const [open, setOpen] = React.useState(false)
    return (
        <div className={cn("w-full", className)} data-media-page-header-more-details>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="mx-auto lg:mx-0 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/55 hover:text-white transition-colors"
            >
                {label}
                <LuChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
                {open && <motion.div
                    key="more"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                    className="overflow-hidden"
                >
                    <div className="pt-3 space-y-3">{children}</div>
                </motion.div>}
            </AnimatePresence>
        </div>
    )
}

/** The hero's action bar: quiet links on the left, a divider, then the actions. */
export function MediaPageHeaderActions({ links, children, className, ...rest }: {
    links?: React.ReactNode
    children?: React.ReactNode
    className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "flex flex-row w-full gap-3 items-center justify-center lg:justify-start lg:max-w-[65vw] flex-wrap",
                className,
            )}
            {...rest}
        >
            {!!links && <div
                className="flex items-center gap-3 h-10 px-4 rounded-full bg-black/25 ring-1 ring-white/10 backdrop-blur-md"
                data-media-page-header-actions-links
            >
                {links}
            </div>}
            {children}
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function MediaPageHeaderScoreAndProgress({ score, progress, episodes }: {
    score: Nullish<number>,
    progress: Nullish<number>,
    episodes: Nullish<number>,
}) {

    return (
        <>
            {!!score && <Badge
                leftIcon={score >= 90 ? <BiSolidStar className="text-sm" /> : <BiStar className="text-sm" />}
                size="xl"
                intent="unstyled"
                className={getScoreColor(score, "user")}
                data-media-page-header-score-badge
            >
                {score / 10}
            </Badge>}
            <Badge
                size="xl"
                intent="basic"
                className="!text-xl font-bold !text-white px-0 gap-0 rounded-none"
                data-media-page-header-progress-badge
            >
                <span data-media-page-header-progress-badge-progress>{`${progress ?? 0}`}</span><span
                data-media-page-header-progress-total
                className={cn(
                    (!progress || progress !== episodes) && "opacity-60",
                )}
            >/{episodes || "-"}</span>
            </Badge>
        </>
    )

}


/** The description in the hero: three lines, then a smooth "Read more" in place. */
function MediaPageHeaderDescription({ description }: { description: string }) {
    const [expanded, setExpanded] = React.useState(false)
    const text = React.useMemo(() => description
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/(<([^>]+)>)/ig, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim(), [description])
    const long = text.length > 260
    return (
        <div
            data-media-page-header-details-description
            className={cn(
                "relative max-w-full 2xl:max-w-[50vw] rounded-2xl text-sm leading-relaxed text-white/70 transition-colors",
                expanded && "bg-black/30 backdrop-blur-md ring-1 ring-white/10 p-4 -mx-1",
            )}
        >
            <motion.div
                initial={false}
                animate={{ height: expanded || !long ? "auto" : "4.1rem" }}
                transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                className="overflow-hidden whitespace-pre-line text-center lg:text-left"
            >
                {text}
            </motion.div>
            {long && !expanded && <div className="pointer-events-none absolute inset-x-0 bottom-6 h-8 bg-gradient-to-t from-[--background]/40 to-transparent" />}
            {long && <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="mx-auto mt-1 block text-xs font-semibold text-brand-200 hover:text-white lg:mx-0"
            >
                {expanded ? "Show less" : "Read more"}
            </button>}
        </div>
    )
}
