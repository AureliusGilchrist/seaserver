import type { VideoCoreChapterCue } from "@/app/(main)/_features/video-core/video-core"
import { usePlaylistManager } from "@/app/(main)/_features/playlists/_containers/global-playlist-manager"
import {
    VideoCoreControlButtonIcon,
    VideoCorePlayButton,
    VideoCoreTimestamp,
    VideoCoreVolumeButton,
} from "@/app/(main)/_features/video-core/video-core-control-bar"
import { vc_docPipWindow, vc_pipManager } from "@/app/(main)/_features/video-core/video-core-pip"
import { VideoCoreTimeRange } from "@/app/(main)/_features/video-core/video-core-time-range"
import { useVideoCorePlaylist } from "@/app/(main)/_features/video-core/video-core-playlist"
import { useAtomValue } from "jotai/react"
import React from "react"
import { createPortal } from "react-dom"
import { LuChevronLeft, LuChevronRight } from "react-icons/lu"
import { TbPictureInPictureOff } from "react-icons/tb"

/**
 * Fork: the Document Picture-in-Picture window's controls. Rendered inside
 * VideoCoreProvider (so scoped atoms resolve) and portaled into the PiP window's
 * document while one is open. Deliberately dropdown-free: Radix menus portal to the
 * main window's body, so a menu opened from here would appear in the wrong window —
 * burned-in subtitles still show, and changing tracks happens back in the app.
 */
export function VideoCoreDocumentPipPortal(props: { chapterCues?: VideoCoreChapterCue[] | null }) {
    const pipWindow = useAtomValue(vc_docPipWindow)
    const pipManager = useAtomValue(vc_pipManager)
    const { hasNextEpisode, hasPreviousEpisode, playEpisode } = useVideoCorePlaylist()

    // Global playlists take precedence over series episodes, same as the main control bar
    const { nextPlaylistEpisode, prevPlaylistEpisode, currentPlaylist, playEpisode: playPlaylistEpisode } = usePlaylistManager()

    if (!pipWindow) return null

    return createPortal(
        <div
            data-vc-element="docpip-controls"
            className="flex flex-col bg-black text-white select-none"
        >
            <div className="px-3 pt-2">
                <VideoCoreTimeRange chapterCues={props.chapterCues ?? []} />
            </div>
            <div className="flex items-center gap-2 px-3 pb-2 text-white">
                <VideoCorePlayButton />
                {currentPlaylist ? (
                    <>
                        {!!prevPlaylistEpisode && (
                            <button
                                type="button"
                                className="flex items-center justify-center px-2 text-2xl hover:opacity-80"
                                title="Previous playlist episode"
                                onClick={() => {
                                    playPlaylistEpisode("previous", true)
                                }}
                            >
                                <LuChevronLeft />
                            </button>
                        )}
                        {!!nextPlaylistEpisode && (
                            <button
                                type="button"
                                className="flex items-center justify-center px-2 text-2xl hover:opacity-80"
                                title="Next playlist episode"
                                onClick={() => {
                                    playPlaylistEpisode("next", true)
                                }}
                            >
                                <LuChevronRight />
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        {hasPreviousEpisode && (
                            <button
                                type="button"
                                className="flex items-center justify-center px-2 text-2xl hover:opacity-80"
                                title="Previous episode"
                                onClick={() => {
                                    playEpisode("previous")
                                }}
                            >
                                <LuChevronLeft />
                            </button>
                        )}
                        {hasNextEpisode && (
                            <button
                                type="button"
                                className="flex items-center justify-center px-2 text-2xl hover:opacity-80"
                                title="Next episode"
                                onClick={() => {
                                    playEpisode("next")
                                }}
                            >
                                <LuChevronRight />
                            </button>
                        )}
                    </>
                )}
                <VideoCoreVolumeButton />
                <VideoCoreTimestamp />
                <div className="flex-1" />
                <VideoCoreControlButtonIcon
                    icons={[["default", TbPictureInPictureOff]]}
                    state="default"
                    onClick={() => {
                        pipManager?.exitPip()
                    }}
                />
            </div>
        </div>,
        pipWindow.document.body,
    )
}
