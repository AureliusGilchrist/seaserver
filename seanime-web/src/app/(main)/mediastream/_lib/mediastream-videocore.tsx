"use client"
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

    const handlePlayEpisode = React.useCallback((which: "previous" | "next") => {
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
            <div className="relative w-full h-full aspect-video bg-black rounded-md overflow-hidden">
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
    const setRequestTranscodeForAudio = useSetAtom(vc_requestTranscodeForAudio)
    const setDirectPlayAudioUrl = useSetAtom(vc_directPlayAudioUrl)
    const setDirectPlayAudioLoading = useSetAtom(vc_directPlayAudioLoading)
    const setDirectPlayAudioElement = useSetAtom(vc_directPlayAudioElement)

    // Refs for the hidden audio element and rAF sync loop
    const audioElementRef = React.useRef<HTMLAudioElement | null>(null)
    const audioSyncRafRef = React.useRef<number>(0)
    // Guard: suppress drift correction for a short window after seeking
    const seekCooldownRef = React.useRef<number>(0)

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
            fetch(audioUrl).then(resp => {
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                return resp.blob()
            }).then(blob => {
                const blobUrl = URL.createObjectURL(blob)
                audioEl!.src = blobUrl
                audioEl!.preload = "auto"

                const onCanPlay = () => {
                    setDirectPlayAudioLoading(false)
                    toast.success("Audio track switched")
                    toast.success("Audio track ready", { id: toastId })

                    video.muted = true
                    // audioDelay: positive = audio plays ahead, negative = audio plays behind
                    const getTargetAudioTime = () => video.currentTime + (settings.audioDelay ?? 0)
                    audioEl!.currentTime = getTargetAudioTime()
                    audioEl!.playbackRate = video.playbackRate
                    if (!video.paused) audioEl!.play().catch(() => {})

                    // Hard resync on seek — set audio time once and suppress the
                    // drift-correction loop for 1 second so the two elements don't
                    // fight each other.
                    const onVideoSeeked = () => {
                        if (!audioEl) return
                        audioEl.currentTime = getTargetAudioTime()
                        seekCooldownRef.current = Date.now() + 1000
                        log.trace("Audio hard-resynced after seek")
                    }
                    // Pause audio during seeking to prevent playback at the wrong position
                    const onVideoSeeking = () => {
                        if (!audioEl) return
                        seekCooldownRef.current = Date.now() + 1000
                    }
                    // Keep playback rate in sync
                    const onVideoRateChange = () => {
                        if (!audioEl) return
                        audioEl.playbackRate = video.playbackRate
                    }

                    video.addEventListener("seeked", onVideoSeeked)
                    video.addEventListener("seeking", onVideoSeeking)
                    video.addEventListener("ratechange", onVideoRateChange)

                    const syncLoop = () => {
                        if (!audioEl || !video) return

                        // Skip drift correction during seek cooldown to prevent
                        // the micro-seeking oscillation (±0.3-0.4s bouncing)
                        if (Date.now() < seekCooldownRef.current) {
                            audioSyncRafRef.current = requestAnimationFrame(syncLoop)
                            return
                        }

                        const targetTime = getTargetAudioTime()
                        const drift = Math.abs(targetTime - audioEl.currentTime)
                        if (drift > 0.5) {
                            audioEl.currentTime = targetTime
                            log.trace(`Audio drift-corrected: ${drift.toFixed(3)}s`)
                        }
                        if (video.paused && !audioEl.paused) audioEl.pause()
                        if (!video.paused && audioEl.paused) audioEl.play().catch(() => {})
                        audioSyncRafRef.current = requestAnimationFrame(syncLoop)
                    }
                    audioSyncRafRef.current = requestAnimationFrame(syncLoop)

                    // Store cleanup references for the video event listeners
                    ;(audioEl as any).__vcSyncCleanup = () => {
                        video.removeEventListener("seeked", onVideoSeeked)
                        video.removeEventListener("seeking", onVideoSeeking)
                        video.removeEventListener("ratechange", onVideoRateChange)
                    }
                }

                audioEl!.addEventListener("canplay", onCanPlay, { once: true })
                audioEl!.load()
            }).catch(() => {
                setDirectPlayAudioLoading(false)
                toast.error("Failed to extract audio track", { id: toastId })
                setDirectPlayAudioUrl(null)
            })
        })
        return () => setRequestTranscodeForAudio(null)
    }, [handleChangeStreamType, currentStreamType, videoElement])

    // ── Stall detection: auto-switch from direct play to transcode ──
    const stallTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const hasSwitchedRef = React.useRef(false)

    React.useEffect(() => {
        if (!videoElement || !handleChangeStreamType || currentStreamType !== "direct") return

        hasSwitchedRef.current = false

        const clearStallTimer = () => {
            if (stallTimerRef.current) {
                clearTimeout(stallTimerRef.current)
                stallTimerRef.current = null
            }
        }

        const onWaiting = () => {
            if (hasSwitchedRef.current) return
            clearStallTimer()
            stallTimerRef.current = setTimeout(() => {
                if (hasSwitchedRef.current) return
                hasSwitchedRef.current = true
                log.warning("Direct play stalled for 3s, auto-switching to transcode")
                toast.info("Direct play stalling — switching to transcode")
                handleChangeStreamType("transcode")
            }, 3000)
        }

        const onPlaying = () => clearStallTimer()
        const onCanPlay = () => clearStallTimer()

        videoElement.addEventListener("waiting", onWaiting)
        videoElement.addEventListener("playing", onPlaying)
        videoElement.addEventListener("canplay", onCanPlay)

        return () => {
            clearStallTimer()
            videoElement.removeEventListener("waiting", onWaiting)
            videoElement.removeEventListener("playing", onPlaying)
            videoElement.removeEventListener("canplay", onCanPlay)
        }
    }, [videoElement, handleChangeStreamType, currentStreamType])

    return null
}
