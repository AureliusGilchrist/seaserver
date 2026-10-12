"use client"
/**
 * Fork: the popout player window's page (Electron) — a YouTube-PiP-like floating player.
 *
 * The desktop shell opens this route in a separate frameless always-on-top BrowserWindow
 * when the user pops the player out of the main window. The route deliberately lives
 * OUTSIDE the _main layout: this window's only job is playing video, so it renders no
 * sidebar, no navbar, no library loaders, no reward/cursor/Discord layers — just the
 * player with the app's own subtitle and control rendering (native decoding, no canvas
 * pipeline).
 *
 * Playback is handed off here: the page fires the native-player play request for the
 * file, the globally-scoped player drawer takes over, and the window closes itself once
 * the stream terminates.
 */
import { useDirectstreamPlayLocalFile } from "@/api/hooks/directstream.hooks"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { nativePlayer_stateAtom } from "@/app/(main)/_features/native-player/native-player.atoms"
import { NativePlayer } from "@/app/(main)/_features/native-player/native-player"
import { VideoCoreProvider } from "@/app/(main)/_features/video-core/video-core"
import { clientIdAtom, websocketConnectedAtom } from "@/app/websocket-provider"
import { AppLayoutStack } from "@/components/ui/app-layout"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { ClientPrefsHydrator } from "@/lib/sea-storage/client-prefs-hydrator"
import { AnimeThemeProvider } from "@/lib/theme/anime-themes/anime-theme-provider"
import { UICustomizeProvider } from "@/lib/ui-customize/ui-customize-provider"
import { useSearchParams } from "@/lib/navigation"
import { logger } from "@/lib/helpers/debug"
import { useAtomValue } from "jotai"
import React from "react"
import { ImSpinner2 } from "react-icons/im"
import { LuArrowUpLeft, LuX } from "react-icons/lu"


const log = logger("POPOUT PLAYER")

export default function Page() {
    return (
        <ClientPrefsHydrator>
            <AnimeThemeProvider>
                <UICustomizeProvider>
                    <div className="h-dvh w-full bg-black relative z-[1]">
                        <VideoCoreProvider key="native-player" id="native-player">
                            <PopoutPlaybackHandoff />
                            <PopoutAspectLock />
                            <PopoutWindowDrag />
                            <PopoutReturnButton />
                            <AppLayoutStack className="z-[5]">
                                <NativePlayer />
                            </AppLayoutStack>
                        </VideoCoreProvider>
                    </div>
                </UICustomizeProvider>
            </AnimeThemeProvider>
        </ClientPrefsHydrator>
    )
}

/**
 * Locks the popout window to the picture's shape.
 *
 * The video's own aspect ratio is reported to the shell the moment its metadata is known, and
 * again whenever it changes — the window is told to keep its width and height on that ratio for
 * every later resize, and to come to it immediately. A window that opened at a fixed size around
 * a 16:9 stream used to draw bars top and bottom for its whole life; this is the difference
 * between a window that contains the video and one that fits it.
 *
 * Rendered inside VideoCoreProvider so the video element atom resolves to the player's scope.
 */
function PopoutAspectLock() {
    const videoElement = useAtomValue(vc_videoElement)

    React.useEffect(() => {
        const reportRatio = window.electron?.window?.setPopoutAspectRatio
        if (!videoElement || !reportRatio) return

        // Reported once per stream, on metadata. The video's intrinsic size changes when the episode
        // changes — loadedmetadata fires for that too — and reporting on top of the element's own
        // resize event as well meant every window resize was answered with another setBounds, which
        // is a resize loop dressed up as a fitting: the window adjusts, the element re-lays out, and
        // the whole thing thrashes for the life of the stream.
        const report = () => {
            const { videoWidth, videoHeight } = videoElement
            if (!videoWidth || !videoHeight) return
            reportRatio(videoWidth / videoHeight)
        }

        report()
        videoElement.addEventListener("loadedmetadata", report)
        return () => {
            videoElement.removeEventListener("loadedmetadata", report)
        }
    }, [videoElement])

    return null
}

/**
 * Lets the frameless popout window be dragged from anywhere on the video.
 *
 * An OS drag region would swallow every click (and cover the player's top controls), so the
 * drag is done in the page instead: once the pointer travels past a small threshold the
 * window follows it, and the click that would follow the release is swallowed so a drag
 * never toggles pause. A plain click still reaches the player, and controls (buttons,
 * sliders, menus) are never treated as drag handles.
 */
function PopoutWindowDrag() {
    React.useEffect(() => {
        const win = window.electron?.window
        if (!win?.popoutDragStart) return

        const NO_DRAG = [
            "button", "a", "input", "select", "textarea",
            "[role='slider']", "[role='menu']", "[role='menuitem']", "[role='dialog']", "[role='listbox']",
            "[data-vc-element='time-range']", "[data-radix-popper-content-wrapper]", "[data-popout-nodrag]",
        ].join(",")
        const THRESHOLD = 4

        let pointerId: number | null = null
        let startX = 0
        let startY = 0
        let dragging = false

        const swallowNextClick = () => {
            const handler = (e: MouseEvent) => {
                e.stopPropagation()
                e.preventDefault()
            }
            window.addEventListener("click", handler, { capture: true, once: true })
            setTimeout(() => window.removeEventListener("click", handler, { capture: true }), 0)
        }

        const onDown = (e: PointerEvent) => {
            if (e.button !== 0 || !e.isPrimary) return
            if ((e.target as Element | null)?.closest?.(NO_DRAG)) return
            pointerId = e.pointerId
            startX = e.screenX
            startY = e.screenY
            dragging = false
        }

        const onMove = (e: PointerEvent) => {
            if (pointerId === null || e.pointerId !== pointerId) return
            const dx = e.screenX - startX
            const dy = e.screenY - startY
            if (!dragging) {
                if (Math.hypot(dx, dy) < THRESHOLD) return
                dragging = true
                win.popoutDragStart()
            }
            win.popoutDragMove(dx, dy)
        }

        const onUp = (e: PointerEvent) => {
            if (pointerId === null || e.pointerId !== pointerId) return
            pointerId = null
            if (dragging) {
                dragging = false
                win.popoutDragEnd()
                swallowNextClick()
            }
        }

        window.addEventListener("pointerdown", onDown, true)
        window.addEventListener("pointermove", onMove, true)
        window.addEventListener("pointerup", onUp, true)
        window.addEventListener("pointercancel", onUp, true)
        return () => {
            window.removeEventListener("pointerdown", onDown, true)
            window.removeEventListener("pointermove", onMove, true)
            window.removeEventListener("pointerup", onUp, true)
            window.removeEventListener("pointercancel", onUp, true)
        }
    }, [])

    return null
}

/**
 * "Return to Seaserver": hands the file and the exact playback position back to the main
 * window, which resumes it there, and closes the popout. Shown on mouse activity at the
 * top center, which the player's own top controls leave free.
 */
function PopoutReturnButton() {
    const videoElement = useAtomValue(vc_videoElement)
    const nativePlayerState = useAtomValue(nativePlayer_stateAtom)
    const searchParams = useSearchParams()

    const returnToMain = () => {
        let path: string | null | undefined = nativePlayerState.playbackInfo?.localFile?.path
        if (!path) {
            const encoded = searchParams.get("path")
            try {
                path = encoded ? Buffer.from(encoded, "base64").toString("utf-8") : null
            }
            catch {
                path = null
            }
        }
        if (!path || !window.electron?.window?.returnPlayerFromPopout) return

        window.electron.window.returnPlayerFromPopout({
            path,
            time: videoElement?.currentTime ?? 0,
            paused: videoElement?.paused ?? false,
        })
    }

    const [visible, setVisible] = React.useState(false)
    const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    React.useEffect(() => {
        const show = () => {
            setVisible(true)
            if (hideTimer.current) clearTimeout(hideTimer.current)
            hideTimer.current = setTimeout(() => setVisible(false), 2500)
        }
        const hide = () => {
            if (hideTimer.current) clearTimeout(hideTimer.current)
            setVisible(false)
        }
        window.addEventListener("pointermove", show, true)
        window.addEventListener("pointerdown", show, true)
        document.documentElement.addEventListener("mouseleave", hide)
        return () => {
            window.removeEventListener("pointermove", show, true)
            window.removeEventListener("pointerdown", show, true)
            document.documentElement.removeEventListener("mouseleave", hide)
            if (hideTimer.current) clearTimeout(hideTimer.current)
        }
    }, [])

    return (
        <div
            className={`fixed top-0 left-0 right-0 h-12 z-[9999] flex items-center justify-center bg-gradient-to-b from-black/80 to-transparent select-none transition-opacity duration-200 ${visible
                ? "opacity-100"
                : "opacity-0 pointer-events-none"}`}
        >
            <button
                type="button"
                data-popout-nodrag
                onClick={returnToMain}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                className="flex items-center gap-1.5 rounded-full bg-black/60 border border-white/15 text-white/90 hover:text-white hover:bg-white/15 text-xs font-medium px-3 py-1.5"
            >
                <LuArrowUpLeft className="size-3.5" />
                Return to Denshi
            </button>
            <button
                type="button"
                data-popout-nodrag
                aria-label="Close"
                onClick={() => window.close()}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-white/70 hover:text-white hover:bg-red-600"
            >
                <LuX className="size-4" />
            </button>
        </div>
    )
}

/**
 * Waits for the app to connect, then starts the handed-off stream, and closes the window
 * when it terminates. Rendered inside VideoCoreProvider so its atoms resolve to the
 * player's scope.
 */
function PopoutPlaybackHandoff() {
    const searchParams = useSearchParams()
    const encodedPath = searchParams.get("path")

    const clientId = useAtomValue(clientIdAtom)
    const isConnected = useAtomValue(websocketConnectedAtom)
    const nativePlayerState = useAtomValue(nativePlayer_stateAtom)
    const [handoffError, setHandoffError] = React.useState<string | null>(null)
    const { mutate: playLocalFile } = useDirectstreamPlayLocalFile()

    React.useEffect(() => {
        document.body.setAttribute("data-player-page", "true")
        return () => document.body.removeAttribute("data-player-page")
    }, [])

    // Fire the play request once this window's websocket is connected.
    //
    // It must be the websocket, not the server status: the status atom is populated by the
    // app's main layout, which this window deliberately does not render — waiting on it meant
    // the handoff never fired and the window sat on its spinner forever. Waiting for the
    // socket also matters for correctness: the server pushes the stream's events to this
    // client id, and events sent before the socket is up would simply be missed.
    const startedFor = React.useRef<string | null>(null)
    React.useEffect(() => {
        if (!encodedPath || !clientId || !isConnected || !playLocalFile) return

        const key = encodedPath
        if (startedFor.current === key) return
        startedFor.current = key

        let filePath: string | null = null
        try {
            filePath = Buffer.from(encodedPath, "base64").toString("utf-8")
        }
        catch {
            log.error("Failed to decode popout path parameter")
        }
        if (!filePath) return

        log.info("Starting popout playback", filePath)
        playLocalFile({ path: filePath, clientId }, {
            onError: (error: any) => {
                // Most likely causes: the profile session was rejected (401) or the server is
                // unreachable. Say so instead of leaving the spinner up forever — this window
                // has no other UI to explain itself with.
                const message = error?.response?.status === 401
                    ? "Your session has ended. Sign in again in the main window, then pop the player out once more."
                    : "The server could not start this stream. Check that it is running, then try again from the main window."
                log.error("Popout playback handoff failed", error)
                setHandoffError(message)
            },
        })
    }, [encodedPath, clientId, isConnected, playLocalFile])

    // Close the window once the handed-off stream is terminated (or fails to start)
    const wasActiveRef = React.useRef(false)
    React.useEffect(() => {
        if (nativePlayerState.active) {
            wasActiveRef.current = true
            return
        }
        if (!wasActiveRef.current) return

        // Give the terminate transition a beat so its message reaches the server first
        const timeout = setTimeout(() => {
            log.info("Popout stream ended — closing window")
            window.close()
        }, 1500)
        return () => clearTimeout(timeout)
    }, [nativePlayerState.active])

    if (!encodedPath) {
        return (
            <div className="h-dvh w-full flex items-center justify-center bg-black text-white/70 text-sm">
                Nothing to play.
            </div>
        )
    }

    if (handoffError) {
        return (
            <div className="h-dvh w-full flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
                <p className="text-white/80 text-sm max-w-md">{handoffError}</p>
                <button
                    type="button"
                    className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-white/80 hover:bg-white/10"
                    onClick={() => window.close()}
                >
                    Close
                </button>
            </div>
        )
    }

    return (
        <div className="absolute inset-0 flex items-center justify-center">
            <LoadingSpinner
                title="Starting popout player..."
                spinner={<ImSpinner2 className="size-16 text-white animate-spin" />}
            />
        </div>
    )
}
