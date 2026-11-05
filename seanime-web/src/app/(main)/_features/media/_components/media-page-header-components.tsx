import { AL_BaseAnime, AL_BaseManga, AL_MediaStatus, Anime_EntryListData, Manga_EntryListData, Nullish } from "@/api/generated/types"
import { TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE } from "@/app/(main)/_features/custom-ui/styles"
import { AnilistSyncIndicator } from "@/app/(main)/_features/media/_components/anilist-sync-indicator"
import { AnilistMediaEntryModal } from "@/app/(main)/_features/media/_containers/anilist-media-entry-modal"
import { SCROLL_SPRING, useHeroScrollFade } from "@/app/(main)/_features/media/_lib/use-hero-scroll-fade"
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
import { ThemeMediaPageBannerSize, ThemeMediaPageBannerType, ThemeMediaPageInfoBoxSize, useThemeSettings } from "@/lib/theme/hooks"
import capitalize from "lodash/capitalize"
import { AnimatePresence, easeInOut, easeOut, motion, useScroll, useSpring, useTransform } from "motion/react"
import React from "react"
import { BiCalendarAlt, BiSolidStar, BiStar } from "react-icons/bi"
import { LuChevronDown } from "react-icons/lu"
import { MdOutlineSegment } from "react-icons/md"
import { RiSignalTowerFill } from "react-icons/ri"
import { useWindowSize } from "react-use"

const MotionImage = motion.create(SeaImage)

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

    const heroFade = useHeroScrollFade({ dim: shouldDimBanner })

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
                    ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small ? "lg:h-[28rem]" : "h-[20rem] lg:h-[34rem]",
                    isFixedBanner ? "fixed top-0 will-change-[opacity]" : "absolute -top-[5rem]",
                    !ts.disableSidebarTransparency && TRANSPARENT_SIDEBAR_BANNER_IMG_STYLE,
                    shouldHideBanner && "bg-transparent",
                )}
                style={heroFade.containerStyle}
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
                    style={heroFade.imageStyle}
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

// The hero's content, laid over the banner. Its layout:
//
//   ┌────────┐  EYEBROW · DATE · STATUS
//   │ poster │  Title
//   │        │  English title / romaji · native
//   │        │  ┌ stat ribbon ───────────────────┐
//   └────────┘  description
//   ┌ my list ┐ facts · studios · genres · topics
//   └─────────┘
//
// On phones the poster sits centred above the title and "my list" comes right under the title.

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
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                    className="relative z-[4]"
                    data-media-page-header-details-container
                >
                    <div
                        data-media-page-header-details-inner-container
                        className={cn(
                            "relative px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:pb-6",
                            ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small && "sm:pt-5",
                            ts.mediaPageBannerInfoBoxSize === ThemeMediaPageInfoBoxSize.Fluid
                                ? "w-full"
                                : "lg:max-w-[100%] 2xl:max-w-[96rem] 5xl:max-w-[112rem]",
                        )}
                    >
                        <motion.div
                            initial="hidden"
                            animate="shown"
                            variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } } }}
                            className="space-y-6"
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

/** Each block of the hero rises in on its turn (see the container's stagger). */
const heroItem = {
    hidden: { opacity: 0, y: 14 },
    shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.8, 0.2, 1] } },
} as const

export function MediaPageHeaderReveal({ children, className, ...rest }: { children: React.ReactNode, className?: string } & React.HTMLAttributes<HTMLDivElement>) {
    return <motion.div variants={heroItem} className={className} {...(rest as any)}>{children}</motion.div>
}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const STATUS_TONE: Record<string, { dot: string, text: string }> = {
    RELEASING: { dot: "bg-sky-400 shadow-[0_0_10px_2px_rgb(56_189_248_/_0.55)] animate-pulse", text: "text-sky-100" },
    FINISHED: { dot: "bg-emerald-400", text: "text-emerald-100" },
    NOT_YET_RELEASED: { dot: "bg-amber-400", text: "text-amber-100" },
    CANCELLED: { dot: "bg-red-400", text: "text-red-100" },
    HIATUS: { dot: "bg-orange-400", text: "text-orange-100" },
}

type MediaPageHeaderEntryDetailsProps = {
    children?: React.ReactNode
    /** The stat ribbon, right under the title. */
    aside?: React.ReactNode
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
        aside,
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
    const { width } = useWindowSize()
    const { scrollY } = useScroll()
    const coverScale = useSpring(useTransform(scrollY, [0, 500], [1, 1.05]), SCROLL_SPRING)

    const small = ts.mediaPageBannerSize === ThemeMediaPageBannerSize.Small
    const fluid = ts.mediaPageBannerInfoBoxSize === ThemeMediaPageInfoBoxSize.Fluid

    const showEnglish = !!englishTitle && title?.toLowerCase() !== englishTitle?.toLowerCase()
    const showRomaji = !!romajiTitle && title?.toLowerCase() !== romajiTitle?.toLowerCase()
    const showNative = !!media?.title?.native && title !== media.title.native

    // The list card is rendered once: under the poster on desktop, under the title on narrower screens.
    const listUnderPoster = !!coverImage && width >= 1024
    const statusTone = status ? STATUS_TONE[status] : undefined
    const longTitle = (title?.length ?? 0) > 42

    const listCard = <MediaPageHeaderListCard listData={listData} media={media} type={type} progressTotal={progressTotal} />

    return (
        <>
            <div
                className={cn(
                    "grid grid-cols-1 items-start gap-x-10 gap-y-6",
                    !!coverImage && (
                        small ? "lg:grid-cols-[13rem,minmax(0,1fr)]"
                            : fluid ? "lg:grid-cols-[16rem,minmax(0,1fr)]"
                                : "lg:grid-cols-[15rem,minmax(0,1fr)]"
                    ),
                )}
                data-media-page-header-entry-details
            >

                {!!coverImage && <div className="flex min-w-0 flex-col items-center gap-3 lg:items-stretch" data-media-page-header-entry-details-poster>
                    <motion.div
                        variants={heroItem}
                        data-media-page-header-entry-details-cover-image-container
                        className={cn(
                            "group/cover relative block aspect-[2/3] w-[9.5rem] flex-none overflow-hidden rounded-2xl bg-[--background] sm:w-[12rem] lg:w-full",
                            "shadow-[0_34px_70px_-24px_rgb(0_0_0_/_0.9)] ring-1 ring-white/10",
                        )}
                    >
                        <motion.div className="h-full w-full" style={{ scale: coverScale }}>
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
                                transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                            />
                        </motion.div>
                        {/* A soft light from above and a hairline inside the edge, so the poster reads as a printed card. */}
                        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.07] via-transparent to-black/25 ring-1 ring-inset ring-white/[0.08]" />
                    </motion.div>

                    {listUnderPoster && <motion.div variants={heroItem} className="w-full">{listCard}</motion.div>}
                </div>}


                <div
                    data-media-page-header-entry-details-content
                    className={cn(
                        "min-w-0 space-y-4 lg:space-y-5 lg:pt-1",
                        // Leaves the right of the banner to the artwork.
                        !fluid && "lg:max-w-[54rem] 2xl:max-w-[60rem]",
                        (small || fluid) && "lg:space-y-4",
                    )}
                >
                    {/*EYEBROW — when it started, and whether it still airs*/}
                    {(!!startDate?.year || !!status) && (
                        <motion.div
                            variants={heroItem}
                            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60 lg:justify-start"
                            data-media-page-header-entry-details-date-container
                        >
                            {!!startDate?.year && <p className="flex items-center gap-1.5">
                                <BiCalendarAlt className="text-[13px] text-white/45" />
                                {new Intl.DateTimeFormat("en-US", {
                                    year: "numeric",
                                    month: "short",
                                }).format(new Date(startDate?.year || 0, startDate?.month ? startDate?.month - 1 : 0))}
                                {!!season && <span className="text-white/35">· {capitalize(season)}</span>}
                            </p>}

                            {!!status && <span
                                className={cn(
                                    "inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-2.5 py-1 ring-1 ring-white/10 backdrop-blur-md",
                                    statusTone?.text ?? "text-white/80",
                                )}
                                data-media-page-header-entry-details-date-badge
                            >
                                <span className={cn("size-1.5 rounded-full", statusTone?.dot ?? "bg-white/50")} />
                                {capitalize(status || "")?.replaceAll("_", " ")}
                            </span>}

                            {small && !!description && <Popover
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
                        </motion.div>
                    )}

                    {/*TITLE — a div main title and a p subtitle line, which the Alternative Titles plugin builds on*/}
                    <motion.div variants={heroItem} className="space-y-2" data-media-page-header-entry-details-title-container>
                        <TextGenerateEffect
                            className={cn(
                                "text-balance text-center text-[2rem] font-extrabold leading-[1.04] tracking-[-0.025em] text-white line-clamp-3 sm:text-5xl lg:text-left",
                                "[text-shadow:_0_2px_24px_rgb(0_0_0_/_45%)]",
                                longTitle ? "lg:text-[2.9rem]" : "lg:text-[3.6rem]",
                                (small || fluid) && !longTitle && "lg:text-[3.1rem]",
                                smallerTitle && "text-2xl sm:text-3xl lg:text-[2.1rem]",
                            )}
                            words={title || ""}
                        />
                        {showEnglish &&
                            <h4 className="line-clamp-1 text-center text-lg font-medium text-white/80 sm:text-xl lg:text-left">{englishTitle}</h4>}
                        {(showRomaji || showNative) && <p
                            className="flex flex-wrap justify-center gap-x-2 text-sm text-white/45 lg:justify-start"
                            data-media-page-header-entry-details-alt-titles
                        >
                            {showRomaji && <span className="line-clamp-1">{romajiTitle}</span>}
                            {showRomaji && showNative && <span className="text-white/20">·</span>}
                            {showNative && <span className="line-clamp-1 tracking-wide" lang="ja">{media.title!.native}</span>}
                        </p>}
                    </motion.div>

                    {!listUnderPoster && <motion.div variants={heroItem} className="mx-auto w-full max-w-md lg:mx-0">{listCard}</motion.div>}

                    {!!aside && <motion.div variants={heroItem} className="min-w-0" data-media-page-header-entry-details-aside>{aside}</motion.div>}

                    {!small && !!description &&
                        <motion.div variants={heroItem}><MediaPageHeaderDescription description={description} /></motion.div>}

                    {!!children && <motion.div variants={heroItem}>{children}</motion.div>}

                </div>

            </div>
        </>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/** Your own entry: progress against the total, your score, the list status, and the editor. */
function MediaPageHeaderListCard({ listData, media, type, progressTotal }: {
    listData?: Anime_EntryListData | Manga_EntryListData
    media: AL_BaseAnime | AL_BaseManga
    type: "anime" | "manga"
    progressTotal?: number
}) {
    const progress = listData?.progress ?? 0
    const share = progressTotal ? Math.min(1, progress / progressTotal) : 0
    const statusLabel = listData?.status
        ? capitalize(listData.status === "CURRENT" ? (type === "anime" ? "watching" : "reading") : listData.status)
        : null

    return (
        <div
            className="w-full rounded-2xl bg-black/45 p-3.5 text-left shadow-xl shadow-black/30 ring-1 ring-white/10 backdrop-blur-xl"
            data-media-page-header-entry-details-more-info
        >
            <div className="flex items-center justify-between gap-2">
                {(listData?.status || listData?.repeat)
                    ? <div
                        data-media-page-header-entry-details-status
                        className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-200"
                    >
                        <span className="truncate">{statusLabel}</span>
                        {!!listData?.repeat && <Tooltip
                            trigger={<span
                                className="inline-flex items-center rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tracking-normal text-white/80 ring-1 ring-white/10"
                                data-media-page-header-entry-details-repeating-badge
                            >
                                ×{listData?.repeat}
                            </span>}
                        >
                            {listData?.repeat} {type === "anime" ? "rewatch" : "reread"}{listData?.repeat > 1
                            ? type === "anime" ? "es" : "s"
                            : ""}
                        </Tooltip>}
                    </div>
                    : <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                        {listData ? "On your list" : "Not on your list"}
                    </span>}

                <div className="flex flex-none items-center gap-1.5">
                    <AnilistSyncIndicator mediaId={media?.id} />
                    <AnilistMediaEntryModal listData={listData} media={media} type={type} />
                </div>
            </div>

            <div className="mt-2 flex items-end justify-between gap-3">
                <MediaPageHeaderScoreAndProgress
                    score={listData?.score}
                    progress={listData?.progress}
                    episodes={progressTotal}
                    unit={type === "anime" ? "ep" : "ch"}
                />
            </div>

            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
                <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300"
                    initial={{ width: 0 }}
                    animate={{ width: `${share * 100}%` }}
                    transition={{ duration: 0.9, delay: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                />
            </div>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Secondary hero metadata folded behind a toggle so the hero stays calm.
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

/** The hero's action bar: the actions, then the quiet links (AniList, trailer, favourite) pushed to the far end. */
export function MediaPageHeaderActions({ links, children, className, ...rest }: {
    links?: React.ReactNode
    children?: React.ReactNode
    className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
    return (
        <motion.div
            variants={heroItem}
            className={cn(
                "flex w-full flex-row flex-wrap items-center justify-center gap-2.5 lg:justify-start",
                className,
            )}
            {...(rest as any)}
        >
            {children}
            {!!links && <div
                className="flex h-10 items-center gap-3.5 rounded-full bg-black/40 px-4 ring-1 ring-white/10 backdrop-blur-md lg:ml-auto"
                data-media-page-header-actions-links
            >
                {links}
            </div>}
        </motion.div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function MediaPageHeaderScoreAndProgress({ score, progress, episodes, unit }: {
    score: Nullish<number>,
    progress: Nullish<number>,
    episodes: Nullish<number>,
    unit?: string,
}) {

    return (
        <>
            <span
                className="flex items-baseline gap-1 font-bold tabular-nums text-white"
                data-media-page-header-progress-badge
            >
                <span data-media-page-header-progress-badge-progress className="text-[1.75rem] leading-none tracking-tight">{`${progress ?? 0}`}</span>
                <span
                    data-media-page-header-progress-total
                    className={cn(
                        "text-base leading-none",
                        (!progress || progress !== episodes) ? "text-white/40" : "text-white/75",
                    )}
                >/{episodes || "–"}</span>
                {!!unit && <span className="ml-0.5 text-xs font-medium leading-none text-white/35">{unit}</span>}
            </span>
            {!!score && <span
                className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums text-white ring-1 ring-white/10",
                    getScoreColor(score, "user"),
                )}
                data-media-page-header-score-badge
            >
                {score >= 90 ? <BiSolidStar className="text-sm" /> : <BiStar className="text-sm" />}
                {score / 10}
            </span>}
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
            className="relative mx-auto max-w-[46rem] text-[0.94rem] leading-7 text-white/80 [text-shadow:_0_1px_12px_rgb(0_0_0_/_90%)] lg:mx-0"
        >
            <motion.div
                initial={false}
                animate={{ height: expanded || !long ? "auto" : "5.25rem" }}
                transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                className={cn(
                    "overflow-hidden whitespace-pre-line text-center lg:text-left",
                    long && !expanded && "[mask-image:linear-gradient(to_bottom,black_45%,transparent)]",
                )}
            >
                {text}
            </motion.div>
            {long && <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="mx-auto mt-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-200 transition-colors hover:text-white lg:mx-0"
            >
                {expanded ? "Show less" : "Read more"}
                <LuChevronDown className={cn("size-3.5 transition-transform duration-300", expanded && "rotate-180")} />
            </button>}
        </div>
    )
}
