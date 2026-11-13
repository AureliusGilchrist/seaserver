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
                <div className="absolute inset-0 overflow-hidden">
                    {/* Cover art wash */}
                    {mi?.mediaImage && (
                        <img src={mi.mediaImage} alt="" className="absolute inset-0 size-full object-cover blur-2xl scale-110 opacity-25" />
                    )}
                    {/* Spotlight from above, a faint floor glow, and a vignette */}
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_42%,rgb(var(--color-brand-500)/0.14),transparent_70%)]" />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(255,255,255,0.035),transparent_70%)]" />
                    <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_65%)]" />
                    <div className="absolute inset-0 shadow-[inset_0_0_160px_40px_rgba(0,0,0,0.85)]" />

                    <div className="relative h-full flex flex-col items-center justify-center gap-6 text-center px-6">
                        <div className="relative">
                            <div className="absolute -inset-4 rounded-full bg-brand-500/30 blur-3xl animate-pulse" />
                            <div className="absolute -inset-4 rounded-full border border-brand-400/15 animate-[ping_3s_ease-out_infinite]" />
                            <div className="absolute -inset-2 rounded-full border border-white/[0.06]" />
                            <div className="relative size-20 rounded-full bg-gradient-to-b from-brand-400/40 to-brand-700/30 ring-1 ring-white/20 flex items-center justify-center shadow-[0_10px_40px_-6px] shadow-brand-500/60">
                                <MdOutlineSettingsRemote className="size-9 text-white drop-shadow" />
                            </div>
                        </div>

                        {hasRemote
                            ? <>
                                <div className="flex flex-col gap-2">
                                    <p className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent">
                                        You have the remote
                                    </p>
                                    <p className="text-sm sm:text-base text-gray-300/80 max-w-md">Pick an episode and it starts on everyone's screen at once.</p>
                                </div>
                                <Button
                                    intent="primary"
                                    size="lg"
                                    className="rounded-full px-7 font-semibold shadow-xl shadow-brand-500/40"
                                    leftIcon={<MdOutlineSettingsRemote className="size-5" />}
                                    onClick={onOpenPicker}
                                >
                                    Pick something to watch
                                </Button>
                            </>
                            : mi && mi.streamType !== "localfile"
                                ? <div className="flex flex-col gap-1.5">
                                    <p className="text-2xl font-black tracking-tight">{mi.mediaTitle}</p>
                                    {mi.episodeNumber > 0 && <p className="text-brand-200 font-medium">Episode {mi.episodeNumber}</p>}
                                    <p className="text-sm text-gray-300/80 max-w-md">The remote holder is playing this outside the room player.</p>
                                </div>
                                : <div className="flex flex-col gap-1.5">
                                    <p className="text-2xl sm:text-3xl font-black tracking-tight">Waiting for the remote</p>
                                    <p className="text-sm sm:text-base text-gray-300/80 max-w-md">
                                        <span className="text-white font-semibold">{session.participants?.find(p => p.isSource)?.username ?? "The host"}</span>
                                        {" "}is picking something to watch
                                        <span className="inline-flex w-5 justify-start"><span className="animate-pulse">…</span></span>
                                    </p>
                                </div>}

                        {!transcodeEnabled && (
                            <p className="text-xs text-amber-200/90 max-w-md rounded-xl bg-amber-500/10 border border-amber-400/20 px-4 py-2">
                                The room player uses the server's local player. Turn on media streaming in the server
                                settings if files won't start.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
