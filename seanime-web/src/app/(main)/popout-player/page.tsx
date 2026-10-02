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
import { ElectronWindowTitleBar } from "@/app/(main)/_electron/electron-window-title-bar"
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

const log = logger("POPOUT PLAYER")

export default function Page() {
    return (
        <ClientPrefsHydrator>
            <AnimeThemeProvider>
                <UICustomizeProvider>
                    <ElectronWindowTitleBar />
                    <div className="h-dvh w-full bg-black relative z-[1]">
                        <VideoCoreProvider key="native-player" id="native-player">
                            <PopoutPlaybackHandoff />
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
