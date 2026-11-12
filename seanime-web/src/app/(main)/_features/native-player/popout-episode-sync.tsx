/**
 * Fork (Electron, main window only): keeps the main window and the popout (pip) on one episode,
 * both ways, and takes playback back from the pip on the episode and second it ended up on.
 *
 * This used to live inside NativePlayer, but NativePlayer's VideoCoreProvider renders nothing while
 * another player is active (the local player page, or an entry page's Local Player tab) — which is
 * exactly where the pip is usually opened from. So the follow, the announce and the return listener
 * were all unmounted while it mattered. It is mounted from the main layout, outside any player.
 */
import { useDirectstreamPlayLocalFile } from "@/api/hooks/directstream.hooks"
import {
    listenForPopoutReturns,
    peekPopoutReturnTime,
    setPendingPopoutResume,
    setPopoutReturnTime,
    wasReturnedOverChannel,
} from "@/app/(main)/_features/video-core/video-core-popout-resume"
import {
    announceMainPath,
    isPopoutPlayerWindow,
    noteFollowedPopoutPath,
    onPopoutClosed,
    onPopoutPathChange,
    releasePopoutPriority,
} from "@/app/(main)/_features/video-core/video-core-single-playback"
import { __mediastream_replayRequestAtom, useMediastreamCurrentFile } from "@/app/(main)/mediastream/_lib/mediastream.atoms"
import { __anime_entryPageViewAtom } from "@/app/(main)/entry/_lib/entry-page-view.atoms"
import { clientIdAtom } from "@/app/websocket-provider"
import { useRouter } from "@/lib/navigation"
import { useAtomValue, useSetAtom } from "jotai"
import React from "react"
import { nativePlayer_stateAtom } from "./native-player.atoms"

// The drawer's terminate handler, registered by NativePlayer while it is mounted.
let terminateDrawer: (() => void) | null = null

export function registerNativeDrawerTerminate(fn: (() => void) | null) {
    terminateDrawer = fn
}

type ReturnPayload = { path: string, time: number, paused: boolean, from?: string }

export function PopoutEpisodeSync() {
    const clientId = useAtomValue(clientIdAtom)
    const router = useRouter()
    const nativePlayerState = useAtomValue(nativePlayer_stateAtom)
    const { filePath: mediastreamFilePath, setFilePath: setMediastreamFilePath } = useMediastreamCurrentFile()
    const { mutate: playLocalFile } = useDirectstreamPlayLocalFile()
    const setMediastreamReplay = useSetAtom(__mediastream_replayRequestAtom)
    const setEntryPageView = useSetAtom(__anime_entryPageViewAtom)

    const drawerActive = !!nativePlayerState.active
    const drawerFilePath = nativePlayerState.playbackInfo?.localFile?.path

    // When playback was last taken back from the pip; a "closed" report that follows a return is
    // not a close of its own.
    const lastReturnAt = React.useRef(0)

    const resumeFromPopout = (payload: ReturnPayload, handoffId?: string) => {
        lastReturnAt.current = Date.now()
        // The user asked for playback back here: the popout no longer has priority over it.
        releasePopoutPriority()
        setPopoutReturnTime(payload.path, payload.time)
        console.warn("[POPOUT RETURN] resuming at", payload.time, payload.path, payload.from ? `(local player ${payload.from})` : "(drawer)")
        setPendingPopoutResume(payload.time, payload.paused, handoffId)
        if (payload.from) {
            // Popped out from the local player: back to that page, on the pip's episode. The
            // drawer must not be left covering it.
            if (drawerActive) terminateDrawer?.()
            setMediastreamFilePath(payload.path)
            setMediastreamReplay({ path: payload.path, nonce: Date.now() })
            if (payload.from.startsWith("/entry")) setEntryPageView("localplayer")
            React.startTransition(() => {
                router.push(payload.from!)
            })
            return
        }
        if (!clientId) return
        playLocalFile({ path: payload.path, clientId })
    }

    // The pip was closed without "Return": the main window's player is put on the pip's episode
    // (paused, at the pip's second) so playing on here continues from where the pip stopped.
    const onClosed = (path: string, time: number) => {
        if (Date.now() - lastReturnAt.current < 60_000) return
        console.warn("[POPOUT CLOSED] the player takes the pip's place", time, path, drawerActive ? "(drawer)" : "(local player)")
        releasePopoutPriority()
        if (drawerActive) {
            if (drawerFilePath === path || !clientId) return
            if (time > 0) setPendingPopoutResume(time, true)
            playLocalFile({ path, clientId })
            return
        }
        // The local player already follows the pip's episode; the video core seeks it to the
        // pip's second (peekPopoutReturnTime) once it can.
        if (mediastreamFilePath !== path) {
            noteFollowedPopoutPath(path)
            setMediastreamFilePath(path)
        }
    }

    const latest = React.useRef({ resumeFromPopout, onClosed, setMediastreamFilePath, mediastreamFilePath })
    latest.current = { resumeFromPopout, onClosed, setMediastreamFilePath, mediastreamFilePath }

    React.useEffect(() => {
        if (typeof window === "undefined" || !window.electron?.on || isPopoutPlayerWindow()) return

        // Live return: the popout keeps playing while this window starts the stream (see
        // video-core-popout-resume). Not while this window is hidden or minimized, where the
        // stream would load in the background: the popout then falls back to the one-shot return.
        const stopListening = listenForPopoutReturns((request, id) => {
            if (document.visibilityState !== "visible") return false
            latest.current.resumeFromPopout(request, id)
            return true
        })

        // The pip is on this file: the local player's selection moves to it too (the position is
        // taken from the pip when playback returns). Delivered for the file the pip opened on as
        // well, and again if a change was missed, so it only acts on a different file.
        const stopFollowing = onPopoutPathChange(path => {
            if (path === latest.current.mediastreamFilePath) return
            console.warn("[POPOUT FOLLOW] the player follows the pip to", path, "(was", latest.current.mediastreamFilePath, ")")
            // Not announced back to the pip as a change of this window's own.
            noteFollowedPopoutPath(path)
            latest.current.setMediastreamFilePath(path)
        })

        // A "closed" report can race the return that caused it, so it is acted on a moment later.
        let closeTimer: number | undefined
        const stopClosed = onPopoutClosed((path, time) => {
            window.clearTimeout(closeTimer)
            closeTimer = window.setTimeout(() => latest.current.onClosed(path, time), 1500)
        })

        const off = window.electron.on("player:return-from-popout", (payload: ReturnPayload) => {
            if (!payload?.path) return
            // Already taken back over the channel: the shell's message only raised this window.
            if (wasReturnedOverChannel(payload.path)) return
            latest.current.resumeFromPopout(payload)
        })
        return () => {
            window.clearTimeout(closeTimer)
            stopListening()
            stopFollowing()
            stopClosed()
            off?.()
        }
    }, [])

    // The other direction: this window's episode changed — picked in the local player, started on
    // an entry page, or the drawer's stream moved on — so the pip plays it too. Changes the pip
    // caused are filtered out inside announceMainPath.
    const announcedMediastreamPath = React.useRef(mediastreamFilePath)
    React.useEffect(() => {
        if (announcedMediastreamPath.current === mediastreamFilePath) return
        announcedMediastreamPath.current = mediastreamFilePath
        if (!window.electron || isPopoutPlayerWindow()) return
        announceMainPath(mediastreamFilePath)
    }, [mediastreamFilePath])
    // The drawer has no file while it loads the next episode, so that gap counts as a change too:
    // opening the same episode again afterwards is announced. A stream the pip's close or return
    // just put here is the pip's own episode and is not sent back.
    const announcedDrawerPath = React.useRef(drawerFilePath)
    React.useEffect(() => {
        if (announcedDrawerPath.current === drawerFilePath) return
        announcedDrawerPath.current = drawerFilePath
        if (!window.electron || isPopoutPlayerWindow()) return
        if (drawerFilePath && peekPopoutReturnTime(drawerFilePath)) return
        announceMainPath(drawerFilePath)
    }, [drawerFilePath])

    return null
}
