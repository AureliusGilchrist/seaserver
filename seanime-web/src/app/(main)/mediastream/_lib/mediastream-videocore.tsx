"use client"
import { VideoCorePlayEpisodeRequest } from "@/app/(main)/_features/video-core/video-core-playlist"
import { attachHiddenAudioSync } from "@/app/(main)/_features/video-core/hidden-audio-sync"
import React from "react"
import { Anime_Episode, Mediastream_StreamType } from "@/api/generated/types"
import { getServerBaseUrl } from "@/api/client/server-url"
import { VideoCore, VideoCoreChapterCue, VideoCoreProvider } from "@/app/(main)/_features/video-core/video-core"
import { VideoCoreLifecycleState, vc_settings } from "@/app/(main)/_features/video-core/video-core.atoms"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_requestTranscodeForAudio } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_directPlayAudioUrl, vc_directPlayAudioLoading, vc_directPlayAudioElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { getMediastreamSessionId } from "@/app/(main)/mediastream/_lib/mediastream.atoms"
import { useSkipData } from "@/app/(main)/_features/sea-media-player/aniskip"
import { useAchievementActivityHeartbeat } from "@/api/hooks/achievement.hooks"
import { useGetMediastreamSettings } from "@/api/hooks/mediastream.hooks"
import { useAtomValue } from "jotai"
import { useSetAtom } from "jotai/react"
import { toast } from "sonner"
import { logger } from "@/lib/helpers/debug"

const log = logger("MEDIASTREAM-VC")

type MediastreamVideoCoreProps = {
    lifecycleState: VideoCoreLifecycleState
    episode: Anime_Episode | undefined
    hasNextEpisode: boolean
    hasPreviousEpisode: boolean
    playNextEpisode: () => void
    playPreviousEpisode: () => void
    handleTerminateStream: () => void
    handleChangeStreamType?: (type: Mediastream_StreamType) => void
    currentStreamType?: Mediastream_StreamType
}

/**
 * Adapter component that bridges the mediastream page with VideoCore.
 * Replaces SeaMediaPlayer (Vidstack) for a unified Jellyfin-like player experience.
 */
export function MediastreamVideoCore(props: MediastreamVideoCoreProps) {
    const {
        lifecycleState,
        episode,
        hasNextEpisode,
        hasPreviousEpisode,
        playNextEpisode,
        playPreviousEpisode,
        handleTerminateStream,
        handleChangeStreamType,
        currentStreamType,
    } = props

    // AniSkip data for skip opening/ending
    const { data: aniSkipData } = useSkipData(
        lifecycleState?.playbackInfo?.media?.idMal,
        episode?.progressNumber ?? -1,
    )

    // A given episode number never comes here: the local player's playlist plays files directly.
    const handlePlayEpisode = React.useCallback((which: VideoCorePlayEpisodeRequest) => {
        if (which === "next" && hasNextEpisode) {
            playNextEpisode()
        } else if (which === "previous" && hasPreviousEpisode) {
            playPreviousEpisode()
        }
    }, [hasNextEpisode, hasPreviousEpisode, playNextEpisode, playPreviousEpisode])

    return (
        <VideoCoreProvider id="mediastream">
            <MediastreamDirectPlayEffects
                handleChangeStreamType={handleChangeStreamType}
                currentStreamType={currentStreamType}
            />
            <div className="relative w-full h-full bg-black rounded-md overflow-hidden">
                <VideoCore
                    id="mediastream"
                    state={lifecycleState}
                    aniSkipData={aniSkipData}
                    onTerminateStream={handleTerminateStream}
                    onPlayEpisode={handlePlayEpisode}
                    inline
                />
            </div>
        </VideoCoreProvider>
    )
}

/**
 * Rendered inside VideoCoreProvider so that scoped atoms
 * (vc_videoElement, vc_requestTranscodeForAudio) resolve to the correct scope.
 */
function MediastreamDirectPlayEffects({
    handleChangeStreamType,
    currentStreamType,
}: {
    handleChangeStreamType?: (type: Mediastream_StreamType) => void
    currentStreamType?: Mediastream_StreamType
}) {
    const videoElement = useAtomValue(vc_videoElement)
    const settings = useAtomValue(vc_settings)
    // Read by the hidden-audio sync on every pass, so changing the delay mid-episode applies at once.
    const audioDelayRef = React.useRef(settings.audioDelay ?? 0)
    audioDelayRef.current = settings.audioDelay ?? 0
    const setRequestTranscodeForAudio = useSetAtom(vc_requestTranscodeForAudio)
    const setDirectPlayAudioUrl = useSetAtom(vc_directPlayAudioUrl)
    const setDirectPlayAudioLoading = useSetAtom(vc_directPlayAudioLoading)
    const setDirectPlayAudioElement = useSetAtom(vc_directPlayAudioElement)

    // Achievement: server-authoritative active-engagement heartbeat
    // (only while video is actually playing AND tab is visible).
    useAchievementActivityHeartbeat("anime", React.useCallback(() => {
        const v = videoElement
        if (!v) return false
        if (v.paused || v.ended) return false
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return false
        return true
    }, [videoElement]))

    // Refs for the hidden audio element and rAF sync loop
    const audioElementRef = React.useRef<HTMLAudioElement | null>(null)
    const audioSyncRafRef = React.useRef<number>(0)

    // Cleanup hidden audio element on unmount
    React.useEffect(() => {
        return () => {
            if (audioSyncRafRef.current) {
                cancelAnimationFrame(audioSyncRafRef.current)
                audioSyncRafRef.current = 0
            }
            if (audioElementRef.current) {
                // Clean up video event listeners attached during sync setup
                if ((audioElementRef.current as any).__vcSyncCleanup) {
                    (audioElementRef.current as any).__vcSyncCleanup()
                }
                audioElementRef.current.pause()
                if ((audioElementRef.current as any).__vcBlobUrl) URL.revokeObjectURL((audioElementRef.current as any).__vcBlobUrl)
                audioElementRef.current.removeAttribute("src")
                audioElementRef.current.remove()
                audioElementRef.current = null
            }
            setDirectPlayAudioElement(null)
        }
    }, [])

    // Wire the audio track switch callback: extract audio via FFmpeg and sync with hidden <audio>
    React.useEffect(() => {
        if (!handleChangeStreamType || currentStreamType !== "direct") {
            setRequestTranscodeForAudio(null)
            return
        }

        const clientId = getMediastreamSessionId()

        setRequestTranscodeForAudio(() => (trackIndex?: number) => {
            if (trackIndex == null || trackIndex < 0) return

            log.info(`Audio track switch requested — extracting track ${trackIndex} via FFmpeg`)
            const toastId = toast.loading("Extracting audio track...")
            setDirectPlayAudioLoading(true)

            const baseUrl = getServerBaseUrl()
            const audioUrl = `${baseUrl}/api/v1/mediastream/audio/${encodeURIComponent(clientId)}?track=${trackIndex}`
            setDirectPlayAudioUrl(audioUrl)

            // Create or reuse the hidden audio element
            let audioEl = audioElementRef.current
            if (!audioEl) {
                audioEl = document.createElement("audio")
                audioEl.style.display = "none"
                document.body.appendChild(audioEl)
                audioElementRef.current = audioEl
                setDirectPlayAudioElement(audioEl)
            }

            // Stop any previous sync loop
            if (audioSyncRafRef.current) {
                cancelAnimationFrame(audioSyncRafRef.current)
                audioSyncRafRef.current = 0
            }

            const video = videoElement
            if (!video) return

            // Use fetch() to wait for the full extraction, then point <audio> at the cached URL.
            // This prevents the browser from aborting the HTTP connection (which would kill FFmpeg).
            // Tear down the previous track's sync before starting a new one: its listeners and
            // blob URL were left behind on every switch.
            if ((audioEl as any).__vcSyncCleanup) {
                ;(audioEl as any).__vcSyncCleanup()
                ;(audioEl as any).__vcSyncCleanup = undefined
            }

            fetch(audioUrl).then(resp => {
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                return resp.blob()
            }).then(blob => {
                const blobUrl = URL.createObjectURL(blob)
                if ((audioEl as any).__vcBlobUrl) URL.revokeObjectURL((audioEl as any).__vcBlobUrl)
                ;(audioEl as any).__vcBlobUrl = blobUrl
                audioEl!.src = blobUrl
                audioEl!.preload = "auto"

                const onCanPlay = () => {
                    setDirectPlayAudioLoading(false)
                    toast.success("Audio track ready", { id: toastId })

                    video.muted = true
                    // Event-driven sync with gentle drift correction (see hidden-audio-sync.ts).
                    // audioDelay: positive = audio plays ahead, negative = audio plays behind.
                    const detach = attachHiddenAudioSync(video, audioEl!, () => audioDelayRef.current, msg => log.info(msg))
                    ;(audioEl as any).__vcSyncCleanup = detach
                }

                audioEl!.addEventListener("canplay", onCanPlay, { once: true })
                audioEl!.load()
            }).catch(() => {
                setDirectPlayAudioLoading(false)
                toast.error("Failed to extract audio track", { id: toastId })
                setDirectPlayAudioUrl(null)
            })
        })
        return () => {
            setRequestTranscodeForAudio(null)
            if (audioSyncRafRef.current) {
                cancelAnimationFrame(audioSyncRafRef.current)
                audioSyncRafRef.current = 0
            }
        }
    }, [handleChangeStreamType, currentStreamType, videoElement])

    // ── Diagnostics: log playback-position jumps nobody asked for ──
    // The picture has been seen to hitch back/forward while audio carries on. A real jump in
    // currentTime would show up here; if this stays quiet, the hitch is purely in rendering.
    React.useEffect(() => {
        if (!videoElement) return
        let lastTime = videoElement.currentTime
        let lastAt = performance.now()
        let seeking = false
        // While buffering the clock stands still; that is not a jump.
        let stalled = false
        const reset = () => {
            lastTime = videoElement.currentTime
            lastAt = performance.now()
        }
        const onSeeking = () => { seeking = true }
        const onSeeked = () => {
            seeking = false
            reset()
        }
        const onWaiting = () => { stalled = true }
        const onPlaying = () => {
            stalled = false
            reset()
        }
        const onTimeUpdate = () => {
            const now = performance.now()
            if (seeking || stalled || videoElement.paused || videoElement.readyState < 3) {
                reset()
                return
            }
            const expected = lastTime + ((now - lastAt) / 1000) * videoElement.playbackRate
            const jump = videoElement.currentTime - expected
            if (Math.abs(jump) > 0.5) {
                log.warning(`Unrequested position jump of ${jump.toFixed(2)}s at ${videoElement.currentTime.toFixed(2)}s`)
            }
            lastTime = videoElement.currentTime
            lastAt = now
        }
        videoElement.addEventListener("seeking", onSeeking)
        videoElement.addEventListener("seeked", onSeeked)
        videoElement.addEventListener("waiting", onWaiting)
        videoElement.addEventListener("playing", onPlaying)
        videoElement.addEventListener("timeupdate", onTimeUpdate)
        return () => {
            videoElement.removeEventListener("seeking", onSeeking)
            videoElement.removeEventListener("seeked", onSeeked)
            videoElement.removeEventListener("waiting", onWaiting)
            videoElement.removeEventListener("playing", onPlaying)
            videoElement.removeEventListener("timeupdate", onTimeUpdate)
        }
    }, [videoElement])

    // ── Stall detection: auto-switch from direct play to transcode ──
    const stallTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const hasSwitchedRef = React.useRef(false)
    // "Direct play only" means exactly that: these fallbacks never override it. They used to — a
    // few seconds of buffering at the start of an episode (the server still reading the file)
    // switched to transcoding, which on this server thrashed encoder heads, paused, drifted the
    // audio and lost the resume position.
    const { data: mediastreamSettings } = useGetMediastreamSettings(true)
    const directPlayOnly = !!mediastreamSettings?.directPlayOnly

    React.useEffect(() => {
        if (!videoElement || !handleChangeStreamType || currentStreamType !== "direct") return

        hasSwitchedRef.current = false

        const clearStallTimer = () => {
            if (stallTimerRef.current) {
                clearTimeout(stallTimerRef.current)
                stallTimerRef.current = null
            }
        }

        // Only a long, real stall switches: a few seconds of buffering is normal for direct play
        // (start of an episode, a seek on a busy disk) and recovers on its own.
        const STALL_SWITCH_MS = 20_000
        const onWaiting = () => {
            if (hasSwitchedRef.current || directPlayOnly) return
            clearStallTimer()
            stallTimerRef.current = setTimeout(() => {
                if (hasSwitchedRef.current || !videoElement.isConnected) return
                // Still no progress? Buffered data arriving means it's slow, not stuck.
                if (videoElement.readyState >= 3) return
                hasSwitchedRef.current = true
                log.warning(`Direct play stalled for ${STALL_SWITCH_MS / 1000}s, auto-switching to transcode`)
                toast.info("Direct play stalling — switching to transcode")
                handleChangeStreamType("transcode")
            }, STALL_SWITCH_MS)
        }

        const onPlaying = () => clearStallTimer()
        const onCanPlay = () => clearStallTimer()

        // A file the device can't demux or decode never fires "waiting" — it errors, or simply
        // never gets as far as its metadata. Both used to leave an endless spinner (notably on the
        // Android client, whose WebView can't play many MKV/HEVC files directly).
        const switchToTranscode = (reason: string) => {
            if (hasSwitchedRef.current) return
            // Only for the element that is actually playing: a leftover element from a previous
            // episode must never switch the current one's stream type.
            if (!videoElement.isConnected) return
            if (directPlayOnly) {
                hasSwitchedRef.current = true
                log.warning(`Direct play failed (${reason}); direct play only is on, not switching`)
                toast.error("This file couldn't be played directly. Transcoding is off in Direct play only mode.")
                return
            }
            hasSwitchedRef.current = true
            clearStallTimer()
            log.warning(`Direct play failed (${reason}), switching to transcode`)
            toast.info("This device can't play the file directly — switching to transcode")
            handleChangeStreamType("transcode")
        }
        const onError = () => switchToTranscode(`video error ${videoElement.error?.code ?? "unknown"}`)
        const metadataWatchdog = setTimeout(() => {
            if (!directPlayOnly && videoElement.readyState < 1) switchToTranscode("no metadata after 12s")
        }, 12_000)

        videoElement.addEventListener("waiting", onWaiting)
        videoElement.addEventListener("playing", onPlaying)
        videoElement.addEventListener("canplay", onCanPlay)
        videoElement.addEventListener("error", onError)

        return () => {
            clearStallTimer()
            clearTimeout(metadataWatchdog)
            videoElement.removeEventListener("waiting", onWaiting)
            videoElement.removeEventListener("playing", onPlaying)
            videoElement.removeEventListener("canplay", onCanPlay)
            videoElement.removeEventListener("error", onError)
        }
    }, [videoElement, handleChangeStreamType, currentStreamType, directPlayOnly])

    return null
}
