import { getServerBaseUrl } from "@/api/client/server-url"
import { Anime_Episode, Mediastream_StreamType, MKVParser_ChapterInfo, MKVParser_Metadata, MKVParser_TrackInfo, Nullish } from "@/api/generated/types"
import { useHandleCurrentMediaContinuity } from "@/api/hooks/continuity.hooks"
import { useGetMediastreamSettings, useMediastreamShutdownTranscodeStream, useRequestMediastreamMediaContainer } from "@/api/hooks/mediastream.hooks"
import { usePlaylistManager } from "@/app/(main)/_features/playlists/_containers/global-playlist-manager"
import { useIsCodecSupported } from "@/app/(main)/_features/sea-media-player/hooks"
import { VideoCoreChapterCue } from "@/app/(main)/_features/video-core/video-core"
import { VideoCore_VideoPlaybackInfo, VideoCore_VideoSubtitleTrack, VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { vc_watchContinuityAtom } from "@/app/(main)/_features/video-core/video-core.atoms"
import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { getMediastreamSessionId, useMediastreamCurrentFile } from "@/app/(main)/mediastream/_lib/mediastream.atoms"
import { logger } from "@/lib/helpers/debug"
import { WSEvents } from "@/lib/server/ws-events"
import { useAtomValue } from "jotai"
import React from "react"
import { toast } from "sonner"

const log = logger("MEDIASTREAM-VC")

type UseMediastreamVideoCoreProps = {
    episodes: Anime_Episode[]
    mediaId: Nullish<string | number>
}

/**
 * Hook that manages mediastream playback state for VideoCore.
 * Replaces the Vidstack-specific `useHandleMediastream`.
 */
export function useMediastreamVideoCore(props: UseMediastreamVideoCoreProps) {
    const { episodes, mediaId } = props
    const { filePath, setFilePath } = useMediastreamCurrentFile()

    const { data: mediastreamSettings, isFetching: mediastreamSettingsLoading } = useGetMediastreamSettings(true)

    // Stream state
    const [url, setUrl] = React.useState<string | undefined>(undefined)
    const [streamType, setStreamType] = React.useState<Mediastream_StreamType>("transcode")
    const [playbackErrored, setPlaybackErrored] = React.useState(false)
    const prevUrlRef = React.useRef<string | undefined>(undefined)

    // When true, the auto-switch logic won't revert transcode back to direct play.
    // Set when the user explicitly requests transcode (e.g. for audio switching).
    const userForcedTranscodeRef = React.useRef(false)

    // Per-tab session ID for multi-client stream isolation
    const mediastreamSessionId = React.useMemo(() => getMediastreamSessionId(), [])
    const vcWatchContinuity = useAtomValue(vc_watchContinuityAtom)

    // Watch history (for continuity/resume)
    const { waitForWatchHistory } = useHandleCurrentMediaContinuity(mediaId, vcWatchContinuity)

    // Fetch media container
    const { data: _mediaContainer, isError: isMediaContainerError, isPending, isFetching, refetch } = useRequestMediastreamMediaContainer({
        path: filePath,
        streamType: streamType,
        clientId: mediastreamSessionId,
    }, !!mediastreamSettings && !mediastreamSettingsLoading && !waitForWatchHistory)

    const mediaContainer = React.useMemo(() => (!isPending && !isFetching) ? _mediaContainer : undefined, [_mediaContainer, isPending, isFetching])

    const { mutate: shutdownTranscode } = useMediastreamShutdownTranscodeStream()
    const { isCodecSupported } = useIsCodecSupported()

    const isStreamError = !!mediaContainer && !url

    // ── URL Management ──────────────────────────────────────────────────

    function changeUrl(newUrl: string | undefined) {
        log.info("[changeUrl]", newUrl)
        if (prevUrlRef.current !== newUrl) {
            setPlaybackErrored(false)
        }
        setUrl(prevUrl => {
            if (prevUrl === newUrl) return prevUrl
            prevUrlRef.current = prevUrl
            return newUrl
        })
    }

    React.useEffect(() => {
        if (isPending) {
            changeUrl(undefined)
        }
    }, [isPending])

    // Handle stream URL from media container
    React.useEffect(() => {
        log.info("Media container changed", mediaContainer)

        // Don't process until settings are loaded
        if (!mediastreamSettings || mediastreamSettingsLoading) return

        const codecSupported = isCodecSupported(mediaContainer?.mediaInfo?.mimeCodec ?? "")

        log.info("Settings loaded", {
            disableAutoSwitchToDirectPlay: mediastreamSettings.disableAutoSwitchToDirectPlay,
            directPlayOnly: mediastreamSettings.directPlayOnly,
            codecSupported,
            streamType: mediaContainer?.streamType,
        })

        // Auto-switch to direct play if codec is supported
        if (mediaContainer?.streamType === "transcode") {
            // If the user explicitly forced transcode (e.g. for audio switching),
            // skip auto-switching back to direct play.
            if (userForcedTranscodeRef.current) {
                log.info("User forced transcode, skipping auto-switch to direct play")
            } else {
                if (!codecSupported && mediastreamSettings.directPlayOnly) {
                    log.warning("Codec not supported for direct play")
                    toast.warning("Codec not supported for direct play")
                    changeUrl(undefined)
                    return
                }
                if (!mediastreamSettings.disableAutoSwitchToDirectPlay && !mediastreamSettings.directPlayOnly) {
                    if (codecSupported) {
                        log.info("Auto-switching to direct play")
                        setStreamType("direct")
                        changeUrl(undefined)
                        return
                    }
                } else if (mediastreamSettings.directPlayOnly) {
                    if (codecSupported) {
                        log.info("Direct play only mode, switching to direct play")
                        setStreamType("direct")
                        changeUrl(undefined)
                        return
                    } else {
                        log.warning("Direct play only mode but codec not supported")
                        toast.warning("Codec not supported for direct play")
                        changeUrl(undefined)
                        return
                    }
                }
            }
        }

        // Auto-switch to transcode if codec not supported for direct play
        if (mediaContainer?.streamType === "direct") {
            if (!codecSupported) {
                log.warning("Codec not supported, switching to transcode")
                setStreamType("transcode")
                changeUrl(undefined)
                return
            }
        }

        if (mediaContainer?.streamUrl) {
            const newUrl = `${getServerBaseUrl()}${mediaContainer.streamUrl}`
            log.info("Stream URL:", newUrl, "type:", mediaContainer.streamType)
            changeUrl(newUrl)
        } else {
            changeUrl(undefined)
        }
    }, [mediaContainer?.streamUrl, mediastreamSettings?.disableAutoSwitchToDirectPlay, mediastreamSettings, mediastreamSettingsLoading])

    // ── WebSocket: shutdown stream ──────────────────────────────────────

    useWebsocketMessageListener<string | null>({
        type: WSEvents.MEDIASTREAM_SHUTDOWN_STREAM,
        onMessage: msg => {
            if (msg) toast.error(msg)
            log.warning("Shutdown stream event received")
            changeUrl(undefined)
        },
    })

    // ── Episode Navigation ──────────────────────────────────────────────

    const currentEpisodeIndex = episodes.findIndex(ep => !!ep.localFile?.path && ep.localFile?.path === filePath)
    const { currentPlaylist, playEpisode: playPlaylistEpisode, nextPlaylistEpisode, prevPlaylistEpisode } = usePlaylistManager()

    const nextFile = currentEpisodeIndex === -1 ? undefined : episodes?.[currentEpisodeIndex + 1]
    const prevFile = currentEpisodeIndex === -1 ? undefined : episodes?.[currentEpisodeIndex - 1]

    const hasNextEpisode = !!nextFile || (currentPlaylist && !!nextPlaylistEpisode)
    const hasPreviousEpisode = !!prevFile || (currentPlaylist && !!prevPlaylistEpisode)

    const episode = React.useMemo(() => {
        return episodes.find(ep => !!ep.localFile?.path && ep.localFile?.path === filePath)
    }, [episodes, filePath])

    const onPlayFile = React.useCallback((filepath: string) => {
        log.info("Playing file", filepath)
        userForcedTranscodeRef.current = false
        changeUrl(undefined)
        setFilePath(filepath)
    }, [])

    const playNextEpisode = React.useCallback(() => {
        log.info("Playing next episode")
        if (currentPlaylist) {
            playPlaylistEpisode("next", true)
            return
        }
        if (nextFile?.localFile?.path) {
            onPlayFile(nextFile.localFile.path)
        }
    }, [currentPlaylist, nextFile, playPlaylistEpisode, onPlayFile])

    const playPreviousEpisode = React.useCallback(() => {
        log.info("Playing previous episode")
        if (currentPlaylist) {
            playPlaylistEpisode("previous", false)
            return
        }
        if (prevFile?.localFile?.path) {
            onPlayFile(prevFile.localFile.path)
        }
    }, [currentPlaylist, prevFile, playPlaylistEpisode, onPlayFile])

    // ── Map to VideoCore Types ──────────────────────────────────────────

    const subtitleEndpointUri = React.useMemo(() => {
        if (mediaContainer?.streamUrl) {
            return `${getServerBaseUrl()}/api/v1/mediastream/subs/${mediastreamSessionId}`
        }
        return ""
    }, [mediaContainer?.streamUrl, mediastreamSessionId])

    // Map mediastream subtitles → VideoCore subtitle tracks
    const subtitleTracks = React.useMemo<VideoCore_VideoSubtitleTrack[]>(() => {
        if (!mediaContainer?.mediaInfo?.subtitles || !subtitleEndpointUri) return []

        let trackIndex = 1000
        return mediaContainer.mediaInfo.subtitles.map((sub) => {
            const isASS = sub.codec === "ass" || sub.codec === "ssa" || sub.extension === ".ass" || sub.extension === ".ssa"
            const track: VideoCore_VideoSubtitleTrack = {
                index: trackIndex++,
                src: subtitleEndpointUri + sub.link,
                label: sub.title || sub.language || `Track ${sub.index}`,
                language: sub.language || "",
                type: sub.extension?.replace(".", "") || "ass",
                default: sub.isDefault,
                useLibassRenderer: isASS,
            }
            return track
        })
    }, [mediaContainer?.mediaInfo?.subtitles, subtitleEndpointUri])

    // Map mediastream chapters → VideoCore chapter cues
    const chapterCues = React.useMemo<VideoCoreChapterCue[]>(() => {
        return mediaContainer?.mediaInfo?.chapters?.map(ch => ({
            startTime: ch.startTime,
            endTime: ch.endTime,
            text: ch.name,
        })) || []
    }, [mediaContainer?.mediaInfo?.chapters])

    // Pre-resolve font URLs for the subtitle manager
    const fontUrls = React.useMemo<string[]>(() => {
        if (!mediaContainer?.mediaInfo?.fonts?.length) return []
        return mediaContainer.mediaInfo.fonts.map(name => `${getServerBaseUrl()}/api/v1/mediastream/att/${mediastreamSessionId}/${name}`)
    }, [mediaContainer?.mediaInfo?.fonts, mediastreamSessionId])

    // Determine VideoCore stream type
    const vcStreamType = React.useMemo<string>(() => {
        if (!url) return "unknown"
        if (mediaContainer?.streamType === "transcode") return "hls"
        return "native"
    }, [url, mediaContainer?.streamType])

    // Synthesize MKV metadata from mediastream MediaInfo for AudioManager
    const mkvMetadata = React.useMemo<MKVParser_Metadata | undefined>(() => {
        const audios = mediaContainer?.mediaInfo?.audios
        const chapterList = mediaContainer?.mediaInfo?.chapters

        if (!audios?.length && !chapterList?.length) return undefined

        const audioTracks: MKVParser_TrackInfo[] = (audios ?? []).map((audio) => ({
            number: audio.index,
            uid: audio.index,
            type: "audio" as const,
            codecID: `A_${audio.codec.toUpperCase()}`,
            name: audio.title,
            language: audio.language,
            default: audio.isDefault,
            forced: audio.isForced,
            enabled: true,
        }))

        const chapters: MKVParser_ChapterInfo[] = (mediaContainer?.mediaInfo?.chapters ?? []).map((ch, i) => ({
            uid: i,
            start: ch.startTime,
            end: ch.endTime,
            text: ch.name,
        }))

        return {
            duration: mediaContainer?.mediaInfo?.duration ?? 0,
            timecodeScale: 1000000,
            audioTracks: audioTracks,
            chapters: chapters.length > 0 ? chapters : undefined,
        }
    }, [mediaContainer?.mediaInfo?.audios, mediaContainer?.mediaInfo?.duration, mediaContainer?.mediaInfo?.chapters])

    // Build the VideoCore playback info
    const playbackInfo = React.useMemo<VideoCore_VideoPlaybackInfo | null>(() => {
        if (!url || !episode) return null

        const info: VideoCore_VideoPlaybackInfo = {
            id: `mediastream-${mediaId}-${filePath}`,
            playbackType: "localfile",
            streamUrl: url,
            mkvMetadata: mkvMetadata,
            media: episode?.baseAnime as any,
            episode: episode,
            localFile: episode?.localFile,
            subtitleTracks: subtitleTracks,
            streamType: vcStreamType,
        }

        // Attach pre-resolved font URLs for subtitle manager
        ;(info as any)._mediastreamFontUrls = fontUrls

        return info
    }, [url, episode, mediaId, filePath, subtitleTracks, vcStreamType, fontUrls, mkvMetadata, mediaContainer?.streamType])

    // Build the lifecycle state
    const lifecycleState = React.useMemo<VideoCoreLifecycleState>(() => ({
        active: !!url && !!episode,
        playbackInfo: playbackInfo,
        playbackError: (isMediaContainerError || isStreamError) ? "Playback error" : null,
        loadingState: isPending ? "Extracting video metadata..." : null,
    }), [url, episode, playbackInfo, isMediaContainerError, isStreamError, isPending])

    // ── Stream Management ───────────────────────────────────────────────

    const handleTerminateStream = React.useCallback(() => {
        log.info("Terminating stream")
        if (mediaContainer?.streamType === "transcode") {
            shutdownTranscode({ clientId: mediastreamSessionId })
        }
        changeUrl(undefined)
    }, [mediaContainer?.streamType, shutdownTranscode, mediastreamSessionId])

    const handleChangeStreamType = React.useCallback((type: Mediastream_StreamType) => {
        log.info("Changing stream type to", type)
        if (type === "transcode") {
            userForcedTranscodeRef.current = true
        } else {
            userForcedTranscodeRef.current = false
        }
        setStreamType(type)
        changeUrl(undefined)
    }, [])

    return {
        lifecycleState,
        chapterCues,
        episode,
        mediaContainer: _mediaContainer,
        isCodecSupported,
        hasNextEpisode,
        hasPreviousEpisode,
        playNextEpisode,
        playPreviousEpisode,
        onPlayFile,
        handleTerminateStream,
        handleChangeStreamType,
        disabledAutoSwitchToDirectPlay: mediastreamSettings?.disableAutoSwitchToDirectPlay,
    }
}
