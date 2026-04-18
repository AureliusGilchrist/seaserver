// Atoms with no dependencies
import { VideoCore_VideoPlaybackInfo } from "@/api/generated/types"
import { atom } from "jotai"
import { derive } from "jotai-derive"

export const vc_menuOpen = atom<string | null>(null)
export const vc_menuSectionOpen = atom<string | null>(null)
export const vc_menuSubSectionOpen = atom<string | null>(null)

export const vc_activePlayerId = atom<string | null>(null)
export const vc_isMobile = atom(false)
export const vc_isSwiping = atom(false) // Mobile swipe state
export const vc_swipeSeekTime = atom<number | null>(null) // Mobile swipe seek time
export const vc_videoSize = atom({ width: 1, height: 1 })
export const vc_realVideoSize = atom({ width: 0, height: 0 })
export const vc_duration = atom(1)
export const vc_currentTime = atom(0)
export const vc_playbackRate = atom(1)
export const vc_readyState = atom(0)
export const vc_buffering = atom(false)
export const vc_isMuted = atom(false)
export const vc_volume = atom(1)
export const vc_subtitleDelay = atom(0)
export const vc_isFullscreen = atom(false)
export const vc_seeking = atom(false)
export const vc_seekingTargetProgress = atom(0) // 0-100
export const vc_timeRanges = atom<TimeRanges | null>(null)
export const vc_closestBufferedTime = derive([vc_timeRanges, vc_currentTime], (tr, currentTime) => {
    if (!tr) return 0
    let closest = 0
    for (let i = 0; i < tr.length; i++) {
        const start = tr.start(i)
        const end = tr.end(i)
        if (currentTime >= start && currentTime <= end) {
            return end
        }
        if (end >= currentTime && closest > end) {
            closest = end
        }
    }
    return closest
})
export const vc_ended = atom(false)
export const vc_paused = atom(true)
export const vc_miniPlayer = atom(false)

export const vc_hoveringControlBar = atom(false)

export const vc_cursorBusy = derive([vc_hoveringControlBar, vc_menuOpen], (f1, f2) => {
    return f1 || !!f2
})
export const vc_cursorPosition = atom({ x: 0, y: 0 })
export const vc_busy = atom(true)
export const vc_videoElement = atom<HTMLVideoElement | null>(null)
export const vc_containerElement = atom<HTMLDivElement | null>(null)
export const vc_previousPausedState = atom(false)
export const vc_lastKnownProgress = atom<{ mediaId: number, progressNumber: number, time: number } | null>(null)
export const vc_skipOpeningTime = atom<number | null>(null)
export const vc_skipEndingTime = atom<number | null>(null)

// Shared playback info atom — synced by VideoCore from its props so menus work for all playback modes
export const vc_playbackInfo = atom<VideoCore_VideoPlaybackInfo | null>(null)

// Callback atom set by mediastream adapter to switch from direct play to transcode.
// Audio track switching doesn't work in direct play (browser audioTracks API is unreliable),
// so the audio menu triggers this to reload the stream in transcode/HLS mode.
export const vc_requestTranscodeForAudio = atom<((trackIndex?: number) => void) | null>(null)

// Direct-play audio override: when set, the video element is muted and a hidden <audio>
// element plays a server-extracted AAC track synced to the video via requestAnimationFrame.
export const vc_directPlayAudioUrl = atom<string | null>(null)
export const vc_directPlayAudioLoading = atom(false)
