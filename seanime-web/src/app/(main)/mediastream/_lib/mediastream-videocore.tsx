"use client"
import React from "react"
import { Anime_Episode } from "@/api/generated/types"
import { VideoCore, VideoCoreChapterCue, VideoCoreProvider } from "@/app/(main)/_features/video-core/video-core"
import { VideoCoreLifecycleState } from "@/app/(main)/_features/video-core/video-core.atoms"
import { useSkipData } from "@/app/(main)/_features/sea-media-player/aniskip"

type MediastreamVideoCoreProps = {
    lifecycleState: VideoCoreLifecycleState
    episode: Anime_Episode | undefined
    hasNextEpisode: boolean
    hasPreviousEpisode: boolean
    playNextEpisode: () => void
    playPreviousEpisode: () => void
    handleTerminateStream: () => void
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
