import { WatchParty_Session } from "@/api/generated/types"
import { useGetAnimeEntry } from "@/api/hooks/anime_entries.hooks"
import { useGetMediastreamSettings } from "@/api/hooks/mediastream.hooks"
import { SeaMediaPlayerProvider } from "@/app/(main)/_features/sea-media-player/sea-media-player-provider"
import { watchPartyLastStartedAtom } from "@/app/(main)/_features/watch-party/watch-party.atoms"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { MediastreamVideoCore } from "@/app/(main)/mediastream/_lib/mediastream-videocore"
import { useMediastreamCurrentFile } from "@/app/(main)/mediastream/_lib/mediastream.atoms"
import { useMediastreamVideoCore } from "@/app/(main)/mediastream/_lib/use-mediastream-videocore"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/helpers/debug"
import { useAtom } from "jotai"
import React from "react"
import { MdOutlineSettingsRemote } from "react-icons/md"
import { toast } from "sonner"

const log = logger("WatchPartyPlayer")

export type RoomPlayRequest = { mediaId: number, path: string, nonce: number }

type Props = {
    session: WatchParty_Session
    hasRemote: boolean
    playRequest: RoomPlayRequest | null
    onOpenPicker: () => void
}

/**
 * The room's own player. It is the local (mediastream) player, embedded here instead of on
 * its page, so it works the same in the browser and in the desktop app.
 */
export function WatchPartyPlayer(props: Props) {
    const { setFilePath } = useMediastreamCurrentFile()
    const [ready, setReady] = React.useState(false)

    // Whatever the local player had open last (it's remembered per tab) must not start
    // playing in the room on its own.
    React.useLayoutEffect(() => {
        setFilePath(undefined)
        setReady(true)
        return () => setFilePath(undefined)
    }, [])

    if (!ready) return null
    return <Stage {...props} />
}

function Stage({ session, hasRemote, playRequest, onOpenPicker }: Props) {
    const serverStatus = useServerStatus()
    const { data: mediastreamSettings } = useGetMediastreamSettings(true)
    const [lastStarted, setLastStarted] = useAtom(watchPartyLastStartedAtom)
    const { filePath } = useMediastreamCurrentFile()

    const mi = session.mediaInfo
    const [mediaId, setMediaId] = React.useState<number | null>(mi?.streamType === "localfile" ? mi.mediaId : null)
    const { data: entry } = useGetAnimeEntry(mediaId)

    const episodes = React.useMemo(() => {
        const eps = entry?.episodes ?? []
        return [
            ...eps.filter(ep => ep.type === "main"),
            ...eps.filter(ep => ep.type === "special"),
            ...eps.filter(ep => ep.type === "nc"),
        ]
    }, [entry?.episodes])

    const {
        lifecycleState,
        episode: currentEpisode,
        mediaContainer,
        hasNextEpisode,
        hasPreviousEpisode,
        playNextEpisode,
        playPreviousEpisode,
        onPlayFile,
        handleTerminateStream,
        handleChangeStreamType,
    } = useMediastreamVideoCore({ episodes, mediaId })

    // Stop the stream when the room is left.
    const terminateRef = React.useRef(handleTerminateStream)
    terminateRef.current = handleTerminateStream
    React.useEffect(() => () => terminateRef.current(), [])

    // Queue a file until the player settings are known (they pick direct play vs transcode).
    const [pending, setPending] = React.useState<{ mediaId: number, path: string } | null>(null)
    React.useEffect(() => {
        if (!pending || !mediastreamSettings) return
        setPending(null)
        log.info("Starting", pending)
        setMediaId(pending.mediaId)
        onPlayFile(pending.path)
    }, [pending, mediastreamSettings, onPlayFile])

    // The remote holder picked something.
    React.useEffect(() => {
        if (!playRequest) return
        setPending({ mediaId: playRequest.mediaId, path: playRequest.path })
    }, [playRequest?.nonce])

    // Followers start whatever the remote holder started.
    React.useEffect(() => {
        if (hasRemote || !mi || mi.streamType !== "localfile" || !mi.localFilePath) return
        if (lastStarted.id !== session.id || lastStarted.epoch >= session.epoch) return
        setLastStarted({ id: session.id, epoch: session.epoch })
        if (filePath === mi.localFilePath && lifecycleState.active) return
        log.info("Following the remote", { mediaId: mi.mediaId, episode: mi.episodeNumber })
        setPending({ mediaId: mi.mediaId, path: mi.localFilePath })
    }, [hasRemote, mi?.localFilePath, session.epoch, session.id, lastStarted])

    // Followers: playback is the remote holder's call. Clicks on the picture and the
    // timeline, and the play/seek shortcuts, are swallowed (anything that slips through is
    // pulled back in line by the server within a second).
    const containerRef = React.useRef<HTMLDivElement>(null)
    React.useEffect(() => {
        if (hasRemote) return
        const el = containerRef.current
        if (!el) return
        let lastHint = 0
        const hint = () => {
            if (Date.now() - lastHint < 3000) return
            lastHint = Date.now()
            toast.info("Only whoever has the remote can control playback", { id: "wp-remote-hint" })
        }
        const onPointer = (e: Event) => {
            const t = e.target as HTMLElement | null
            if (t?.closest("[data-vc-element=\"video\"], [data-vc-element=\"time-range\"], video")) {
                e.stopPropagation()
                e.preventDefault()
                if (e.type === "click") hint()
            }
        }
        const BLOCKED = new Set([" ", "k", "K", "j", "J", "l", "L", "ArrowLeft", "ArrowRight", "MediaPlayPause", "MediaTrackNext", "MediaTrackPrevious", "n", "N", "p", "P"])
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
            if (!BLOCKED.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return
            e.stopImmediatePropagation()
            e.preventDefault()
            hint()
        }
        el.addEventListener("click", onPointer, true)
        el.addEventListener("pointerdown", onPointer, true)
        window.addEventListener("keydown", onKey, true)
        return () => {
            el.removeEventListener("click", onPointer, true)
            el.removeEventListener("pointerdown", onPointer, true)
            window.removeEventListener("keydown", onKey, true)
        }
    }, [hasRemote])

    const transcodeEnabled = !serverStatus || !!serverStatus.mediastreamSettings?.transcodeEnabled
    // Not loadingState: the container query reads as pending even while there's no file to ask for.
    const showPlayer = lifecycleState.active || !!pending || !!filePath

    return (
        <div ref={containerRef} className="absolute inset-0">
            <SeaMediaPlayerProvider
                media={entry?.media as any}
                progress={{
                    currentProgress: entry?.listData?.progress ?? 0,
                    currentEpisodeNumber: currentEpisode?.progressNumber ?? null,
                    currentEpisodeTitle: currentEpisode?.displayTitle || currentEpisode?.episodeTitle || null,
                }}
            >
                {showPlayer && (
                    <MediastreamVideoCore
                        lifecycleState={lifecycleState}
                        episode={currentEpisode}
                        hasNextEpisode={hasRemote && !!hasNextEpisode}
                        hasPreviousEpisode={hasRemote && !!hasPreviousEpisode}
                        playNextEpisode={playNextEpisode}
                        playPreviousEpisode={playPreviousEpisode}
                        handleTerminateStream={handleTerminateStream}
                        handleChangeStreamType={handleChangeStreamType}
                        currentStreamType={mediaContainer?.streamType}
                    />
                )}
            </SeaMediaPlayerProvider>

            {!showPlayer && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
                    <MdOutlineSettingsRemote className="size-14 text-[--brand] opacity-80" />
                    {!transcodeEnabled && (
                        <p className="text-sm text-amber-300 max-w-md">
                            The room player uses the server's local player. Turn on media streaming in the server
                            settings if files won't start.
                        </p>
                    )}
                    {hasRemote
                        ? <>
                            <p className="text-lg font-semibold">You have the remote</p>
                            <p className="text-sm text-[--muted] max-w-md">Pick an episode and it starts for everyone in the room.</p>
                            <Button intent="primary" onClick={onOpenPicker}>Pick something to watch</Button>
                        </>
                        : mi && mi.streamType !== "localfile"
                            ? <>
                                <p className="text-lg font-semibold">{mi.mediaTitle}{mi.episodeNumber > 0 && ` · Episode ${mi.episodeNumber}`}</p>
                                <p className="text-sm text-[--muted] max-w-md">The remote holder is playing this outside the room player.</p>
                            </>
                            : <>
                                <p className="text-lg font-semibold">Waiting for the remote</p>
                                <p className="text-sm text-[--muted] max-w-md">
                                    {session.participants?.find(p => p.isSource)?.username ?? "The host"} is picking something to watch.
                                </p>
                            </>}
                </div>
            )}
        </div>
    )
}
