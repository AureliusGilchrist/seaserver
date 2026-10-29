"use client"

import { getServerBaseUrl } from "@/api/client/server-url"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { useServerHMACAuth } from "@/app/(main)/_hooks/use-server-status"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuVolume2, LuVolumeX } from "react-icons/lu"

// A Netflix-style preview of an episode from the library, playing inside its card while the card is
// hovered. The file is streamed straight from the library (GET /mediastream/file, which supports
// range requests and starts no playback session), so a preview never touches the real player.
// Files the device can't decode (HEVC without hardware support, say) quietly stay on the image.

const HOVER_DELAY_MS = { short: 400, normal: 700, long: 1200 } as const
const FIRST_FRAME_TIMEOUT_MS = 4000

/** Files that failed to preview this session: hovering them again just shows the image. */
const unpreviewable = new Set<string>()
/** Sound toggled on a card overrides the setting for the rest of the session. */
let soundOverride: boolean | null = null
/** One preview at a time: starting one stops whichever was playing. */
let activeStop: (() => void) | null = null

export type EpisodeCardPreviewProps = {
    path: string
    /** Seconds to start at (the resume point); undefined starts a little way in. */
    startAt?: number
    /** Whether the card is hovered (the card owns the hover state). */
    hovered: boolean
    /** Told when the preview is (or stops being) visible, e.g. to pause a carousel. */
    onPlayingChange?: (playing: boolean) => void
}

export function EpisodeCardPreview({ path, startAt, hovered, onPlayingChange }: EpisodeCardPreviewProps) {
    const personal = usePersonalSettings()
    const { getHMACTokenQueryParam } = useServerHMACAuth()
    const videoRef = React.useRef<HTMLVideoElement>(null)
    const [src, setSrc] = React.useState<string | null>(null)
    const [visible, setVisible] = React.useState(false)
    const [progress, setProgress] = React.useState(0)
    const [sound, setSound] = React.useState(() => soundOverride ?? personal.episodePreviewSound)

    const canHover = React.useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches, [])
    const enabled = personal.episodePreviewEnabled && canHover && !!path && !unpreviewable.has(path)

    const stop = React.useCallback(() => {
        const v = videoRef.current
        if (v) {
            v.pause()
            // Dropping the source closes the connection to the server at once.
            v.removeAttribute("src")
            v.load()
        }
        setSrc(null)
        setVisible(false)
        setProgress(0)
    }, [])

    // Hover intent, then build the URL (the auth token is fetched asynchronously).
    React.useEffect(() => {
        if (!hovered || !enabled) {
            stop()
            return
        }
        let cancelled = false
        const timer = setTimeout(async () => {
            const endpoint = "/api/v1/mediastream/file"
            const token = await getHMACTokenQueryParam(endpoint, "&")
            if (cancelled) return
            activeStop?.()
            activeStop = stop
            setSrc(`${getServerBaseUrl()}${endpoint}?path=${encodeURIComponent(path)}${token}`)
        }, HOVER_DELAY_MS[personal.episodePreviewDelay] ?? 700)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [hovered, enabled, path])

    // Unmounting (the card scrolled away, the page changed) stops it too.
    React.useEffect(() => () => {
        if (activeStop === stop) activeStop = null
        stop()
    }, [stop])

    // A preview that never shows a frame (unsupported codec, unreachable file) gives up quietly.
    React.useEffect(() => {
        if (!src || visible) return
        const t = setTimeout(() => {
            unpreviewable.add(path)
            stop()
        }, FIRST_FRAME_TIMEOUT_MS)
        return () => clearTimeout(t)
    }, [src, visible, path, stop])

    // Stops on its own after the configured length.
    React.useEffect(() => {
        if (!visible || personal.episodePreviewMaxSeconds <= 0) return
        const t = setTimeout(stop, personal.episodePreviewMaxSeconds * 1000)
        return () => clearTimeout(t)
    }, [visible, personal.episodePreviewMaxSeconds, stop])

    React.useEffect(() => {
        onPlayingChange?.(visible)
    }, [visible])

    React.useEffect(() => {
        const v = videoRef.current
        if (!v) return
        v.muted = !sound
        v.volume = Math.max(0, Math.min(1, personal.episodePreviewVolume / 100))
    }, [sound, personal.episodePreviewVolume, src])

    if (!enabled || !src) return null

    const onLoadedMetadata = () => {
        const v = videoRef.current
        if (!v || !isFinite(v.duration) || v.duration <= 0) return
        const target = personal.episodePreviewStart === "resume" && startAt && startAt > 0
            ? Math.max(0, startAt - 3)
            : v.duration * 0.1
        v.currentTime = Math.min(target, Math.max(0, v.duration - 5))
        void v.play().catch(() => {
            unpreviewable.add(path)
            stop()
        })
    }

    return (
        <div className="pointer-events-none absolute inset-0 z-[2]" data-episode-card-preview>
            <video
                ref={videoRef}
                src={src}
                muted={!sound}
                playsInline
                preload="metadata"
                disablePictureInPicture
                className={cn("size-full object-cover transition-opacity duration-500", visible ? "opacity-100" : "opacity-0")}
                onLoadedMetadata={onLoadedMetadata}
                onPlaying={() => {
                    const v = videoRef.current
                    if (v && v.videoWidth > 0) setVisible(true)
                }}
                onTimeUpdate={() => {
                    const v = videoRef.current
                    if (v?.duration) setProgress(v.currentTime / v.duration)
                }}
                onError={() => {
                    unpreviewable.add(path)
                    stop()
                }}
            />
            {visible && <>
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
                    <div className="h-full bg-brand-400 transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                </div>
                <button
                    type="button"
                    className="pointer-events-auto absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/75"
                    aria-label={sound ? "Mute preview" : "Unmute preview"}
                    onClick={e => {
                        e.stopPropagation()
                        e.preventDefault()
                        const next = !sound
                        soundOverride = next
                        setSound(next)
                    }}
                >
                    {sound ? <LuVolume2 className="size-3.5" /> : <LuVolumeX className="size-3.5" />}
                </button>
            </>}
        </div>
    )
}
