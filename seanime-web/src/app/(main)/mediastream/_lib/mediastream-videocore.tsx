"use client"
import React from "react"
import { Anime_Episode, Mediastream_StreamType } from "@/api/generated/types"
import { getServerBaseUrl } from "@/api/client/server-url"
import { VideoCore, VideoCoreChapterCue, VideoCoreProvider } from "@/app/(main)/_features/video-core/video-core"
import { VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { vc_videoElement } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_requestTranscodeForAudio } from "@/app/(main)/_features/video-core/video-core-atoms"
import { vc_directPlayAudioUrl, vc_directPlayAudioLoading } from "@/app/(main)/_features/video-core/video-core-atoms"
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

    const videoElement = useAtomValue(vc_videoElement)
    const setRequestTranscodeForAudio = useSetAtom(vc_requestTranscodeForAudio)
    const setDirectPlayAudioUrl = useSetAtom(vc_directPlayAudioUrl)
    const setDirectPlayAudioLoading = useSetAtom(vc_directPlayAudioLoading)

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
                audioElementRef.current.pause()
                audioElementRef.current.removeAttribute("src")
                audioElementRef.current.remove()
                audioElementRef.current = null
            }
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
            toast.info("Extracting audio track...")
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
            }

            // Stop any previous sync loop
            if (audioSyncRafRef.current) {
                cancelAnimationFrame(audioSyncRafRef.current)
                audioSyncRafRef.current = 0
            }

            audioEl.src = audioUrl
            audioEl.preload = "auto"

            const video = videoElement
            if (!video) return

            const onCanPlay = () => {
                setDirectPlayAudioLoading(false)
                toast.success("Audio track switched")

                // Mute video, sync audio position
                video.muted = true
                audioEl!.currentTime = video.currentTime
                if (!video.paused) audioEl!.play().catch(() => {})

                // Start rAF sync loop
                const syncLoop = () => {
                    if (!audioEl || !video) return
                    const drift = Math.abs(video.currentTime - audioEl.currentTime)
                    if (drift > 0.3) {
                        audioEl.currentTime = video.currentTime
                    }
                    if (video.paused && !audioEl.paused) audioEl.pause()
                    if (!video.paused && audioEl.paused) audioEl.play().catch(() => {})
                    audioSyncRafRef.current = requestAnimationFrame(syncLoop)
                }
                audioSyncRafRef.current = requestAnimationFrame(syncLoop)

                audioEl!.removeEventListener("canplay", onCanPlay)
            }

            const onError = () => {
                setDirectPlayAudioLoading(false)
                toast.error("Failed to extract audio track")
                setDirectPlayAudioUrl(null)
                audioEl!.removeEventListener("error", onError)
            }

            audioEl.addEventListener("canplay", onCanPlay, { once: true })
            audioEl.addEventListener("error", onError, { once: true })
            audioEl.load()
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
