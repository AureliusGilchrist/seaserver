import { VIDEOCORE_DEBUG_ELEMENTS } from "@/app/(main)/_features/video-core/video-core"
import { vc_hoveringControlBar } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_isMobile } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_isSwiping } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_duration } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_currentTime } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_isMuted } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_volume } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_isFullscreen } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_seeking } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_paused } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_miniPlayer } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_cursorBusy } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_containerElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_fullscreenManager } from "@/app/(main)/_features/video-core/video-core-fullscreen"
import { vc_pip } from "@/app/(main)/_features/video-core/video-core-pip"
import { vc_pipManager } from "@/app/(main)/_features/video-core/video-core-pip"
import { vc_storedMutedAtom, vc_storedVolumeAtom } from "@/app/(main)/_features/video-core/video-core.atoms"
import { vc_dispatchAction } from "@/app/(main)/_features/video-core/video-core.utils"
import { vc_formatTime } from "@/app/(main)/_features/video-core/video-core.utils"
import { useAnimeThemeOrNull } from "@/lib/theme/anime-themes/anime-theme-provider"
import { cn } from "@/components/ui/core/styling"
import { useAtomValue } from "jotai"
import { useAtom, useSetAtom } from "jotai/react"
import { atomWithStorage } from "jotai/utils"
import { AnimatePresence, motion } from "motion/react"
import React from "react"
import { LuChevronLeft, LuChevronRight, LuVolume, LuVolume1, LuVolume2, LuVolumeOff } from "react-icons/lu"
import { RiPauseLargeLine, RiPlayLargeLine } from "react-icons/ri"
import { RxEnterFullScreen, RxExitFullScreen } from "react-icons/rx"
import { TbPictureInPicture, TbPictureInPictureOff } from "react-icons/tb"
import { FaFloppyDisk } from "react-icons/fa6"
import { toast } from "sonner"
import { vc_playbackInfo } from "@/app/(main)/_features/video-core/video-core-atoms"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { useUpdateAnimeEntryProgress } from "@/api/hooks/anime_entries.hooks"
import { useGetAnimeCollection } from "@/api/hooks/anilist.hooks"

const VIDEOCORE_CONTROL_BAR_MAIN_SECTION_HEIGHT = 48
const VIDEOCORE_CONTROL_BAR_MAIN_SECTION_HEIGHT_MINI = 28

type VideoCoreControlBarType = "default" | "classic"
const VIDEOCORE_CONTROL_BAR_TYPE: VideoCoreControlBarType = "default"

// VideoControlBar sits on the bottom of the video container
// shows up when cursor hovers bottom of the player or video is paused
export function VideoCoreControlBar(props: {
    children?: React.ReactNode
    timeRange: React.ReactNode
}) {
    const { children, timeRange } = props

    const paused = useAtomValue(vc_paused)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const cursorBusy = useAtomValue(vc_cursorBusy)
    const [hoveringControlBar, setHoveringControlBar] = useAtom(vc_hoveringControlBar)
    const containerElement = useAtomValue(vc_containerElement)
    const seeking = useAtomValue(vc_seeking)

    const isMobile = useAtomValue(vc_isMobile)

    const mainSectionHeight = isMiniPlayer ? VIDEOCORE_CONTROL_BAR_MAIN_SECTION_HEIGHT_MINI : VIDEOCORE_CONTROL_BAR_MAIN_SECTION_HEIGHT

    // when the user is approaching the control bar
    const [cursorPosition, setCursorPosition] = React.useState<"outside" | "approaching" | "hover">("outside")

    // On mobile, always show controls when paused or when tapping
    const showOnlyTimeRange = isMobile ? false : (
        VIDEOCORE_CONTROL_BAR_TYPE === "classic" ? (
                (!paused && cursorPosition === "approaching")
            ) :
            // cursor is approaching and video is not paused
            (!paused && cursorPosition === "approaching")
    )

    const controlBarTranslateY = isMobile ? (
        // On mobile, show controls when paused or interacting
        (paused || cursorBusy || hoveringControlBar) ? 0 : 300
    ) : (
        VIDEOCORE_CONTROL_BAR_TYPE === "classic" ? (cursorBusy || hoveringControlBar || paused) ? 0 : (
            showOnlyTimeRange ? mainSectionHeight : (
                cursorPosition === "hover" ? 0 : 300
            )
        ) : (
            // Full bar: cursor hovering the bar, menu open, or paused AND cursor is near/over the bottom
            (cursorBusy || hoveringControlBar || (paused && cursorPosition !== "outside")) ? 0 : (
                showOnlyTimeRange ? mainSectionHeight : (
                    cursorPosition === "hover" ? 0 : 300
                )
            )
        )
    )

    const hideShadow = isMobile ? !paused : (
        isMiniPlayer ? !paused : VIDEOCORE_CONTROL_BAR_TYPE === "classic"
            ? (!paused && cursorPosition !== "hover" && !cursorBusy)
            : (cursorPosition !== "hover" && !cursorBusy)
    )

    // On mobile, show control bar when paused or cursor busy
    const hideControlBar = isMobile ? (!paused && !cursorBusy && !hoveringControlBar) : (
        !showOnlyTimeRange && !cursorBusy && !hoveringControlBar && (VIDEOCORE_CONTROL_BAR_TYPE === "classic" ? !paused : true)
    )

    function handleVideoContainerPointerMove(e: Event) {
        if (isMobile) return

        if (!containerElement) {
            setCursorPosition("outside")
            return
        }

        const rect = containerElement.getBoundingClientRect()
        const y = e instanceof PointerEvent ? e.clientY - rect.top : 0
        const registerThreshold = !isMiniPlayer ? 150 : 100 // pixels from the bottom to start registering position
        const showOnlyTimeRangeOffset = !isMiniPlayer ? 50 : 50

        if ((y >= rect.height - registerThreshold && y < rect.height - registerThreshold + showOnlyTimeRangeOffset)) {
            setCursorPosition("approaching")
        } else if (y < rect.height - registerThreshold) {
            setCursorPosition("outside")
        } else {
            setCursorPosition("hover")
        }
    }

    function handleVideoContainerPointerLeave(_e: Event) {
        if (isMobile) return
        setCursorPosition("outside")
    }

    React.useEffect(() => {
        if (!containerElement) return
        containerElement.addEventListener("pointermove", handleVideoContainerPointerMove)
        containerElement.addEventListener("pointerleave", handleVideoContainerPointerLeave)
        containerElement.addEventListener("pointercancel", handleVideoContainerPointerLeave)
        return () => {
            containerElement.removeEventListener("pointermove", handleVideoContainerPointerMove)
            containerElement.removeEventListener("pointerup", handleVideoContainerPointerLeave)
            containerElement.removeEventListener("pointercancel", handleVideoContainerPointerLeave)
        }
    }, [containerElement, paused, isMiniPlayer, seeking, hoveringControlBar])

    React.useLayoutEffect(() => {
        if (!containerElement || isMobile) return
        const captionsOverlay = containerElement.querySelector("#video-core-captions-wrapper") as HTMLElement
        if (!captionsOverlay) return
        if (controlBarTranslateY === 0 || showOnlyTimeRange) {
            captionsOverlay.style.setProperty("--tw-translate-y", `-${showOnlyTimeRange ? 20 : 50}px`, "important")
        } else {
            captionsOverlay.style.setProperty("--tw-translate-y", "0%")
        }
        return () => {
            captionsOverlay.style.removeProperty("--tw-translate-y")
        }
    }, [controlBarTranslateY, containerElement, isMobile])

    return (
        <>
            {/* Black-to-transparent gradient behind the control bar so it stays readable
                on bright/white video frames. Sits below the control bar (lower z-index) and
                fades upward to fully transparent. Visibility is tied to the control bar. */}
            <div
                data-vc-element="control-bar-gradient"
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute left-0 right-0 bottom-0",
                    "h-40 z-[9]",
                    "transition-opacity duration-300 opacity-0",
                    !hideControlBar && "opacity-100",
                )}
                style={{
                    background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0) 100%)",
                }}
            />
            <div
                data-vc-element="control-bar"
                data-vc-state-visible={!hideControlBar}
                className={cn(
                    "absolute left-0 bottom-0 right-0 flex flex-col text-white",
                    "transition-[opacity,transform] duration-300 opacity-0",
                    "z-[10] h-28 transform-gpu",
                    !hideControlBar && "opacity-100",
                    VIDEOCORE_DEBUG_ELEMENTS && "bg-purple-500/20",
                )}
                style={{
                    transform: `translateY(${controlBarTranslateY}px)`,
                }}
                onPointerEnter={() => {
                    if (!isMobile) setHoveringControlBar(true)
                }}
                onPointerLeave={() => {
                    if (!isMobile) setHoveringControlBar(false)
                }}
                onPointerCancel={() => {
                    if (!isMobile) setHoveringControlBar(false)
                }}
            >
                <div
                    data-vc-element="control-bar-wrapper"
                    className={cn(
                        "absolute bottom-0 w-full",
                        isMobile ? "px-2" : "px-4",
                        VIDEOCORE_DEBUG_ELEMENTS && "bg-purple-800/40",
                    )}
                    // style={{
                    //     paddingTop: VIDEOCORE_CONTROL_BAR_VPADDING,
                    //     paddingBottom: VIDEOCORE_CONTROL_BAR_VPADDING,
                    // }}
                >
                    {timeRange}

                    <div
                        data-vc-element="control-bar-main-section"
                        className={cn(
                            "z-[100] relative",
                            "transform-gpu duration-100 flex items-center",
                            isMobile ? "pb-1" : "pb-2",
                        )}
                        style={{
                            height: `${mainSectionHeight}px`,
                            // "--tw-translate-y": showOnlyTimeRange ? `-${mainSectionHeight}px` : 0,
                        } as React.CSSProperties}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function VideoCoreMobileControlBar(props: {
    children?: React.ReactNode
    timeRange: React.ReactNode
    topLeftSection: React.ReactNode
    topRightSection: React.ReactNode
    bottomLeftSection: React.ReactNode
    bottomRightSection: React.ReactNode
}) {
    const { children, timeRange, topLeftSection, topRightSection, bottomLeftSection, bottomRightSection } = props

    const paused = useAtomValue(vc_paused)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const cursorBusy = useAtomValue(vc_cursorBusy)
    const containerElement = useAtomValue(vc_containerElement)
    const seeking = useAtomValue(vc_seeking)
    const isSwiping = useAtomValue(vc_isSwiping)
    const [, setHoveringControlBar] = useAtom(vc_hoveringControlBar)

    const [isSwipingDebounced, setIsSwipingDebounced] = React.useState(false)
    const sieT = React.useRef<NodeJS.Timeout>()
    React.useEffect(() => {
        if (isSwiping) {
            setIsSwipingDebounced(true)
        } else {
            sieT.current = setTimeout(() => {
                setIsSwipingDebounced(false)
            }, 200)
        }
        return () => {
            if (sieT.current) clearTimeout(sieT.current)
        }
    }, [isSwiping])
    React.useEffect(() => {
        setHoveringControlBar(false)
    }, [])

    const showShadow = paused || cursorBusy

    const bottomSectionTranslateY = (paused || cursorBusy) ? 0 : 300

    return (
        <>
            <div
                data-vc-element="mobile-control-bar-gradient-bottom"
                className={cn(
                    "vc-mobile-control-bar-bottom-gradient pointer-events-none",
                    "absolute bottom-0 left-0 right-0 w-full z-[10] h-28 transition-opacity duration-300 opacity-0",
                    "bg-gradient-to-t to-transparent",
                    !isMiniPlayer ? "from-black/40" : "from-black/80 via-black/40",
                    "h-20",
                    (showShadow || isSwiping) && "opacity-100",
                )}
            />
            <div
                data-vc-element="mobile-control-bar-gradient-top"
                className={cn(
                    "vc-mobile-control-bar-top-gradient pointer-events-none",
                    "absolute top-0 left-0 right-0 w-full z-[10] h-28 transition-opacity duration-300 opacity-0",
                    "bg-gradient-to-b to-transparent",
                    !isMiniPlayer ? "from-black/40" : "from-black/80 via-black/40",
                    "h-20",
                    (showShadow) && "opacity-100",
                )}
            />

            {/*Top*/}
            <div
                data-vc-element="mobile-control-bar-top-section"
                className={cn(
                    "vc-mobile-control-bar-top-section",
                    "absolute transition-transform left-0 right-0 top-0 w-full z-[11] transform-gpu",
                    "px-2 pt-3",
                    VIDEOCORE_DEBUG_ELEMENTS && "bg-purple-800/40",
                )}
                style={{
                    transform: `translateY(${-bottomSectionTranslateY}px)`,
                }}
            >
                <div
                    data-vc-element="mobile-control-bar-top-content"
                    className={cn(
                        "transform-gpu duration-100 flex items-center",
                    )}
                >
                    {topLeftSection}
                    <div className="flex flex-1"></div>
                    {topRightSection}
                </div>
            </div>

            {/*Bottom*/}
            <div
                data-vc-element="mobile-control-bar-bottom-section"
                className={cn(
                    "vc-mobile-control-bar-bottom-section",
                    "absolute transition-transform left-0 right-0 bottom-0 w-full z-[11] transform-gpu",
                    "px-2",
                    VIDEOCORE_DEBUG_ELEMENTS && "bg-purple-800/40",
                    isSwiping && "transition-none",
                )}
                style={{
                    transform: isSwiping ? "translateY(0px)" : `translateY(${bottomSectionTranslateY}px)`,
                }}
            >
                <div
                    data-vc-element="mobile-control-bar-bottom-content"
                    className={cn(
                        "transform-gpu duration-100 flex items-center",
                        (isSwiping || isSwipingDebounced) && "hidden",
                    )}
                >
                    {bottomLeftSection}
                    <div className="flex flex-1"></div>
                    {bottomRightSection}
                </div>
                {timeRange}
            </div>
        </>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type VideoCoreControlButtonProps = {
    icons: [string, React.ElementType][]
    state: string
    className?: string
    iconClass?: string
    onClick: () => void
    onWheel?: (e: React.WheelEvent<HTMLButtonElement>) => void
    children?: React.ReactNode
}

export function VideoCoreControlButtonIcon(props: VideoCoreControlButtonProps) {
    const { icons, state, className, iconClass, onClick, onWheel, children } = props

    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const isMobile = useAtomValue(vc_isMobile)

    // Find the single matching icon for the current state.
    // Rendering only the match (no null siblings) prevents Motion v12 AnimatePresence
    // from misinterpreting null map results as exit triggers, which caused icons to
    // stick at opacity:0 in Firefox/Opera GX.
    const match = icons.find(([s]) => s === state)
    const MatchIcon = match?.[1]

    return (
        <button
            role="button"
            data-vc-element="control-button"
            data-vc-state={state}
            style={{}}
            className={cn(
                "vc-control-button flex items-center justify-center transition-opacity relative h-full",
                "focus-visible:outline-none focus:outline-none focus-visible:opacity-50",
                isMobile ? "px-1 text-2xl" : "px-2 text-3xl hover:opacity-80",
                isMiniPlayer && !isMobile && "text-2xl",
                className,
            )}
            onClick={onClick}
            onWheel={onWheel}
        >
            <AnimatePresence initial={false} mode="popLayout">
                {match && MatchIcon && (
                    <motion.span
                        key={match[0]}
                        data-vc-element="control-button-icon"
                        data-vc-state={match[0]}
                        className="block relative"
                        style={{ color: "inherit" }}
                        initial={{ y: 0, opacity: 1 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ opacity: 0, y: 10, position: "absolute" as any }}
                        transition={{ duration: 0.15 }}
                    >
                        <MatchIcon
                            className={cn(
                                "vc-control-button-icon",
                                iconClass,
                            )}
                            style={{ width: "1em", height: "1em", color: "inherit" }}
                        />
                    </motion.span>
                )}
            </AnimatePresence>
            {children}
        </button>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function VideoCorePlayButton() {
    const paused = useAtomValue(vc_paused)
    const action = useSetAtom(vc_dispatchAction)
    const theme = useAnimeThemeOrNull()
    const icons = theme?.config.playerIconOverrides

    return (
        <VideoCoreControlButtonIcon
            icons={[
                ["playing", icons?.pause ?? RiPauseLargeLine],
                ["paused", icons?.play ?? RiPlayLargeLine],
            ]}
            state={paused ? "paused" : "playing"}
            onClick={() => {
                action({ type: "togglePlay" })
            }}
        />
    )
}

export function VideoCoreVolumeButton() {
    const volume = useAtomValue(vc_volume)
    const muted = useAtomValue(vc_isMuted)
    const setVolume = useSetAtom(vc_storedVolumeAtom)
    const setMuted = useSetAtom(vc_storedMutedAtom)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const isMobile = useAtomValue(vc_isMobile)
    const theme = useAnimeThemeOrNull()
    const icons = theme?.config.playerIconOverrides

    const [isSliding, setIsSliding] = React.useState(false)

    // Uses a power curve to give more granular control at lower volumes
    function linearToVolume(linear: number): number {
        return Math.pow(linear, 2)
    }

    function volumeToLinear(vol: number): number {
        return Math.pow(vol, 1 / 2)
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        setIsSliding(true)
    }

    function handleSetVolume(e: React.PointerEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const width = e.currentTarget.clientWidth
        const linearPosition = Math.max(0, Math.min(1, x / width))
        const nonLinearVolume = linearToVolume(linearPosition)
        setVolume(nonLinearVolume)
        setMuted(nonLinearVolume === 0)
    }

    function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
        if (isSliding) {
            e.stopPropagation()
            e.currentTarget.setPointerCapture(e.pointerId)
            setIsSliding(false)

            handleSetVolume(e)
        }
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (isSliding) {
            e.stopPropagation()

            handleSetVolume(e)
        }
    }

    function handleWheel(e: React.WheelEvent<HTMLButtonElement | HTMLDivElement>) {
        e.stopPropagation()

        const delta = -e.deltaY / 1000
        const newVolume = Math.max(0, Math.min(1, volume + delta))
        setVolume(newVolume)
        setMuted(newVolume === 0)
    }

    return (
        <div
            data-vc-element="control-volume"
            className={cn(
                "vc-control-volume group/vc-control-volume",
                "flex items-center justify-center h-full gap-2",
            )}
        >
            <VideoCoreControlButtonIcon
                icons={[
                    ["low", icons?.volumeLow ?? LuVolume],
                    ["mid", icons?.volumeMid ?? LuVolume1],
                    ["high", icons?.volumeHigh ?? LuVolume2],
                    ["muted", icons?.volumeMuted ?? LuVolumeOff],
                ]}
                state={
                    muted ? "muted" :
                        volume >= 0.5 ? "high" :
                            volume > 0.1 ? "mid" :
                                "low"
                }
                className={isMiniPlayer ? "text-[1.3rem]" : "text-2xl"}
                onClick={() => {
                    setMuted(p => {
                        if (p && volume === 0) setVolume(0.1)
                        return !p
                    })
                }}
                onWheel={handleWheel}
            />
            {!isMobile && (
                <div
                    data-vc-element="control-volume-slider-container"
                    className={cn(
                        "vc-control-volume-slider-container relative w-0 flex group-hover/vc-control-volume:w-[6rem] h-6",
                        "transition-[width] duration-300",
                    )}
                >
                    <div
                        data-vc-element="control-volume-slider"
                        className={cn(
                            "vc-control-volume-slider",
                            "flex h-full w-full relative items-center",
                            "rounded-full",
                            "cursor-pointer",
                            "transition-[width,background-color] duration-300",
                        )}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onWheel={handleWheel}
                    >
                        <div
                            data-vc-element="control-volume-slider-progress"
                            className={cn(
                                "vc-control-volume-slider-progress h-1.5",
                                "absolute bg-white",
                                "rounded-full",
                            )}
                            style={{
                                width: `${volumeToLinear(volume) * 100}%`,
                            }}
                        />
                        <div
                            data-vc-element="control-volume-slider-background"
                            className={cn(
                                "vc-control-volume-slider-progress h-1.5 w-full",
                                "absolute bg-white/20",
                                "rounded-full",
                            )}
                        />
                    </div>
                    <div className="w-4" />
                </div>
            )}
        </div>
    )
}

export function VideoCoreNextButton({ onClick }: { onClick: () => void }) {
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const theme = useAnimeThemeOrNull()
    const icons = theme?.config.playerIconOverrides
    if (isMiniPlayer) return null

    return (
        <VideoCoreControlButtonIcon
            icons={[
                ["default", icons?.skipForward ?? LuChevronRight],
            ]}
            state="default"
            onClick={onClick}
        />
    )
}


export function VideoCorePreviousButton({ onClick }: { onClick: () => void }) {
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const theme = useAnimeThemeOrNull()
    const icons = theme?.config.playerIconOverrides
    if (isMiniPlayer) return null

    return (
        <VideoCoreControlButtonIcon
            icons={[
                ["default", icons?.skipBack ?? LuChevronLeft],
            ]}
            state="default"
            onClick={onClick}
        />
    )
}

const vc_timestampType = atomWithStorage("sea-video-core-timestamp-type", "elapsed", undefined, { getOnInit: true })

export function VideoCoreTimestamp() {
    const duration = useAtomValue(vc_duration)
    const currentTime = useAtomValue(vc_currentTime)
    const [type, setType] = useAtom(vc_timestampType)
    const isMobile = useAtomValue(vc_isMobile)

    function handleSwitchType() {
        setType(p => p === "elapsed" ? "remaining" : "elapsed")
    }

    if (duration <= 1 || isNaN(duration)) return null

    return (
        <p
            data-vc-element="timestamp"
            data-vc-timestamp-type={type}
            className={cn(
                "tabular-nums font-medium opacity-100 cursor-pointer",
                isMobile ? "text-xs text-white" : "text-sm hover:opacity-80",
            )}
            onClick={handleSwitchType}
        >
            {type === "remaining" ? "-" : ""}{vc_formatTime(Math.max(0,
            Math.min(duration, type === "elapsed" ? currentTime : duration - currentTime)))} / {vc_formatTime(duration)}
        </p>
    )
}

export function VideoCorePipButton() {
    const pipManager = useAtomValue(vc_pipManager)
    const isPip = useAtomValue(vc_pip)
    const isMiniPlayer = useAtomValue(vc_miniPlayer)
    const theme = useAnimeThemeOrNull()
    const icons = theme?.config.playerIconOverrides

    if (isMiniPlayer) return null

    return (
        <VideoCoreControlButtonIcon
            icons={[
                ["default", icons?.pip ?? TbPictureInPicture],
                ["pip", icons?.pipOff ?? TbPictureInPictureOff],
            ]}
            state={isPip ? "pip" : "default"}
            onClick={() => {
                pipManager?.togglePip()
            }}
        />
    )
}

export function VideoCoreFullscreenButton() {
    const fullscreenManager = useAtomValue(vc_fullscreenManager)
    const isFullscreen = useAtomValue(vc_isFullscreen)
    const [isMiniPlayer, setMiniPlayer] = useAtom(vc_miniPlayer)
    const theme = useAnimeThemeOrNull()
    const icons = theme?.config.playerIconOverrides

    return (
        <VideoCoreControlButtonIcon
            icons={[
                ["default", icons?.fullscreenEnter ?? RxEnterFullScreen],
                ["fullscreen", icons?.fullscreenExit ?? RxExitFullScreen],
            ]}
            state={isFullscreen ? "fullscreen" : "default"}
            onClick={() => {
                setMiniPlayer(false)
                fullscreenManager?.toggleFullscreen()
            }}
        />
    )
}


export function VideoCoreBookmarkButton() {
    const playbackInfo = useAtomValue(vc_playbackInfo)
    const mediaId = playbackInfo?.media?.id
    const episodeNumber = playbackInfo?.episode?.progressNumber
    const totalEpisodes = playbackInfo?.media?.episodes ?? 0

    // showToast=false — we provide a more specific toast on actual success below
    const { mutate: updateProgress, isPending } = useUpdateAnimeEntryProgress(mediaId, episodeNumber ?? 0, false)

    const confirmUpdate = useConfirmationDialog({
        title: "Update AniList progress",
        description: episodeNumber
            ? `Update AniList to episode ${episodeNumber}?`
            : "Update AniList to this episode?",
        actionText: "Confirm",
        cancelText: "Decline",
        actionIntent: "primary",
        onConfirm: () => {
            if (!mediaId || !episodeNumber || isPending) return
            // AniList only — intentionally do NOT pass malId so MAL is never updated.
            updateProgress({
                mediaId,
                episodeNumber,
                totalEpisodes,
            }, {
                onSuccess: () => {
                    toast.success(`AniList progress updated to episode ${episodeNumber}`)
                },
                onError: (err: any) => {
                    const msg = err?.response?.data?.error || err?.message || "Unknown error"
                    toast.error("Failed to update AniList progress", { description: msg })
                },
            })
        },
    })

    if (!mediaId || !episodeNumber) return null

    return (
        <>
            <VideoCoreControlButtonIcon
                icons={[["default", FaFloppyDisk]]}
                state="default"
                onClick={() => confirmUpdate.open()}
            />
            <ConfirmationDialog {...confirmUpdate} />
        </>
    )
}


/**
 * Listens for the `video-core:episode-completed` custom event (fired at ~75% playback).
 * If the currently-played anime is in the user's PLANNING or PAUSED list,
 * shows a confirmation modal asking to move it to "Currently Watching".
 * On confirm, updates AniList progress to the just-finished episode, which
 * server-side automatically sets the list status to CURRENT.
 */
export function VideoCorePromptStartWatching() {
    const { data: animeCollection } = useGetAnimeCollection()
    const [pending, setPending] = React.useState<{
        mediaId: number
        episodeNumber: number
        totalEpisodes: number
        title: string
    } | null>(null)

    const { mutate: updateProgress } = useUpdateAnimeEntryProgress(
        pending?.mediaId,
        pending?.episodeNumber ?? 0,
        false,
    )

    React.useEffect(() => {
        function onCompleted(e: Event) {
            const detail = (e as CustomEvent).detail as {
                mediaId?: number
                episodeNumber?: number
                totalEpisodes?: number
                title?: string
            }
            if (!detail?.mediaId || !detail?.episodeNumber) return
            if (!animeCollection?.MediaListCollection?.lists) return

            // Find this anime's list status
            let status: string | undefined
            for (const list of animeCollection.MediaListCollection.lists) {
                if (list?.isCustomList) continue
                const entry = list?.entries?.find(en => en?.media?.id === detail.mediaId)
                if (entry) {
                    status = entry.status
                    break
                }
            }

            // Only prompt if the anime is in PLANNING or PAUSED
            if (status !== "PLANNING" && status !== "PAUSED") return

            setPending({
                mediaId: detail.mediaId,
                episodeNumber: detail.episodeNumber,
                totalEpisodes: detail.totalEpisodes ?? 0,
                title: detail.title ?? "this anime",
            })
        }

        window.addEventListener("video-core:episode-completed", onCompleted)
        return () => window.removeEventListener("video-core:episode-completed", onCompleted)
    }, [animeCollection])

    const confirm = useConfirmationDialog({
        title: "Start watching this anime?",
        description: pending
            ? `Move "${pending.title}" to your Currently Watching list?`
            : "",
        actionText: "Confirm",
        cancelText: "Decline",
        actionIntent: "primary",
        onConfirm: () => {
            if (!pending) return
            updateProgress({
                mediaId: pending.mediaId,
                episodeNumber: pending.episodeNumber,
                totalEpisodes: pending.totalEpisodes,
            }, {
                onSuccess: () => {
                    toast.success(`Moved "${pending.title}" to Currently Watching`)
                    setPending(null)
                },
                onError: (err: any) => {
                    const msg = err?.response?.data?.error || err?.message || "Unknown error"
                    toast.error("Failed to update AniList list status", { description: msg })
                    setPending(null)
                },
            })
        },
    })

    React.useEffect(() => {
        if (pending) confirm.open()
    }, [pending])

    return <ConfirmationDialog {...confirm} />
}
