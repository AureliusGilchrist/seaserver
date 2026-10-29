"use client"

import { getServerBaseUrl } from "@/api/client/server-url"
import { useGetMediaTrailer } from "@/api/hooks/anilist.hooks"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { useServerHMACAuth } from "@/app/(main)/_hooks/use-server-status"
import { ElectronYoutubeEmbed } from "@/app/(main)/_electron/electron-embed"
import { cn } from "@/components/ui/core/styling"
import { __isElectronDesktop__ } from "@/types/constants"
import React from "react"
import { LuVolume2, LuVolumeX } from "react-icons/lu"

// A Netflix-style preview on an episode card while it is hovered: the anime's trailer by default,
// or (Personal settings) the episode itself.
//
// The episode preview: an episode from the library, playing inside its card while the card is
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
    /** The library file, for "episode" previews. */
    path?: string
    /** The anime's YouTube trailer, for "trailer" previews (the default). */
    trailerId?: string
    /** The anime, so a dubbed trailer can be looked up when the profile watches dubs. */
    mediaId?: number
    /** Seconds to start at (the resume point); undefined starts a little way in. */
    startAt?: number
    /** Whether the card is hovered (the card owns the hover state). */
    hovered: boolean
    /** Told when the preview is (or stops being) visible, e.g. to pause a carousel. */
    onPlayingChange?: (playing: boolean) => void
}

export function EpisodeCardPreview(props: EpisodeCardPreviewProps) {
    const personal = usePersonalSettings()
    if (personal.episodePreviewSource === "trailer") {
        return props.trailerId ? <TrailerPreview {...props} trailerId={props.trailerId} /> : null
    }
    return props.path ? <FilePreview {...props} path={props.path} /> : null
}

/**
 * The anime's trailer, playing in the card: the same YouTube embed the anime cards use (Denshi's
 * local player page on desktop, youtube-nocookie elsewhere). It fades in once loaded, so the card
 * never flashes an empty player.
 */
function TrailerPreview({ trailerId: originalTrailerId, mediaId, hovered, onPlayingChange }: EpisodeCardPreviewProps & { trailerId: string }) {
    const personal = usePersonalSettings()
    const [active, setActive] = React.useState(false)
    // Sub or dub (Personal settings): a dub trailer is looked up on first hover; until it answers,
    // and when there is none, the original trailer plays. Sub turns English captions on.
    const wantDub = personal.audioPreference === "dub"
    const [lookedUp, setLookedUp] = React.useState(false)
    const { data: lookup, isFetching: lookingUp } = useGetMediaTrailer(mediaId, "dub", wantDub && lookedUp)
    const trailerId = (wantDub && lookup?.id) || originalTrailerId
    const captions = !wantDub || !lookup?.dub ? "en" : undefined
    const [visible, setVisible] = React.useState(false)
    const [sound, setSound] = React.useState(() => soundOverride ?? personal.episodePreviewSound)
    const canHover = React.useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches, [])
    const enabled = personal.episodePreviewEnabled && canHover && !unpreviewable.has(trailerId)

    const stop = React.useCallback(() => {
        setActive(false)
        setVisible(false)
    }, [])

    React.useEffect(() => {
        if (!hovered || !enabled) {
            stop()
            return
        }
        if (wantDub) setLookedUp(true) // starts the lookup during the hover delay
        const timer = setTimeout(() => {
            activeStop?.()
            activeStop = stop
            setActive(true)
        }, HOVER_DELAY_MS[personal.episodePreviewDelay] ?? 700)
        return () => clearTimeout(timer)
    }, [hovered, enabled])

    React.useEffect(() => () => {
        if (activeStop === stop) activeStop = null
    }, [stop])

    React.useEffect(() => {
        if (!visible || personal.episodePreviewMaxSeconds <= 0) return
        const t = setTimeout(stop, personal.episodePreviewMaxSeconds * 1000)
        return () => clearTimeout(t)
    }, [visible, personal.episodePreviewMaxSeconds, stop])

    React.useEffect(() => {
        onPlayingChange?.(visible)
    }, [visible])

    // Wait for the dub lookup rather than starting the original and switching mid-play.
    if (!enabled || !active || (wantDub && lookingUp && !lookup)) return null

    const onLoaded = () => {
        setTimeout(() => setVisible(true), __isElectronDesktop__ ? 1500 : 1000)
    }
    const onFailed = () => {
        unpreviewable.add(trailerId)
        stop()
    }

    return (
        <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" data-episode-card-preview="trailer">
            <div className={cn("absolute inset-0 transition-opacity duration-500", visible ? "opacity-100" : "opacity-0")}>
                {__isElectronDesktop__
                    ? <ElectronYoutubeEmbed
                        isCompact
                        trailerId={trailerId}
                        sound={sound}
                        volume={personal.episodePreviewVolume}
                        captions={captions}
                        onLoad={onLoaded}
                        onError={onFailed}
                    />
                    : <iframe
                        key={sound ? "sound" : "muted"}
                        src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1&controls=0&mute=${sound ? 0 : 1}&disablekb=1&loop=1&playlist=${trailerId}&vq=medium&enablejsapi=1${captions ? `&cc_load_policy=1&cc_lang_pref=${captions}&hl=${captions}` : ""}`}
                        className="absolute left-0 top-1/2 aspect-video h-[calc(100%+120px)] w-full -translate-y-1/2"
                        allow="autoplay"
                        onLoad={e => {
                            const frame = e.currentTarget
                            if (sound) {
                                // Volume is set through YouTube's iframe API once its player listens.
                                for (const ms of [500, 1500, 3000]) setTimeout(() => frame.contentWindow?.postMessage(
                                    JSON.stringify({ event: "command", func: "setVolume", args: [personal.episodePreviewVolume] }), "*"), ms)
                            }
                            onLoaded()
                        }}
                        onError={onFailed}
                    />}
            </div>
            {visible && <SoundButton
                sound={sound}
                onToggle={() => {
                    const next = !sound
                    soundOverride = next
                    setSound(next)
                }}
            />}
        </div>
    )
}

function SoundButton({ sound, onToggle }: { sound: boolean, onToggle: () => void }) {
    return <button
        type="button"
        className="pointer-events-auto absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/75"
        aria-label={sound ? "Mute preview" : "Unmute preview"}
        onClick={e => {
            e.stopPropagation()
            e.preventDefault()
            onToggle()
        }}
    >
        {sound ? <LuVolume2 className="size-3.5" /> : <LuVolumeX className="size-3.5" />}
    </button>
}

/** The episode itself, streamed from the library. */
function FilePreview({ path, startAt, hovered, onPlayingChange }: EpisodeCardPreviewProps & { path: string }) {
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
                <SoundButton sound={sound} onToggle={() => {
                    const next = !sound
                    soundOverride = next
                    setSound(next)
                }} />
            </>}
        </div>
    )
}
