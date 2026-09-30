"use client"
/**
 * Fork: the popout player window's entry page (Electron). The desktop shell opens this
 * route in a separate always-on-top BrowserWindow when the user pops the player out of
 * the main window; playback is handed off to this client.
 *
 * It plays the file through the native-player flow (directstream into the globally
 * mounted player), so subtitles and the full control bar render natively here — no
 * canvas pipeline. The page closes itself once the stream terminates.
 */
import { useDirectstreamPlayLocalFile } from "@/api/hooks/directstream.hooks"
import { nativePlayer_stateAtom } from "@/app/(main)/_features/native-player/native-player.atoms"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { clientIdAtom } from "@/app/websocket-provider"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useSearchParams } from "@/lib/navigation"
import { logger } from "@/lib/helpers/debug"
import { useAtomValue } from "jotai"
import React from "react"
import { ImSpinner2 } from "react-icons/im"

const log = logger("POPOUT PLAYER")

export default function Page() {
    const searchParams = useSearchParams()
    const encodedPath = searchParams.get("path")

    const serverStatus = useServerStatus()
    const clientId = useAtomValue(clientIdAtom)
    const nativePlayerState = useAtomValue(nativePlayer_stateAtom)
    const { mutate: playLocalFile } = useDirectstreamPlayLocalFile()

    React.useEffect(() => {
        document.body.setAttribute("data-player-page", "true")
        return () => document.body.removeAttribute("data-player-page")
    }, [])

    // Fire the play request once the app is connected to the server
    const startedFor = React.useRef<string | null>(null)
    React.useEffect(() => {
        if (!encodedPath || !serverStatus || !clientId || !playLocalFile) return

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
        playLocalFile({ path: filePath, clientId })
    }, [encodedPath, serverStatus, clientId, playLocalFile])

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

    return (
        <div className="h-dvh w-full flex items-center justify-center bg-black">
            <LoadingSpinner
                title="Starting popout player..."
                spinner={<ImSpinner2 className="size-16 text-white animate-spin" />}
            />
        </div>
    )
}
