"use client"

import { getServerBaseUrl } from "@/api/client/server-url"
import { useGetMediaTrailer } from "@/api/hooks/anilist.hooks"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { clearActivePreview, registerActivePreview } from "@/app/(main)/_features/anime/_lib/preview-handoff"
import { useServerHMACAuth } from "@/app/(main)/_hooks/use-server-status"
import { ElectronYoutubeEmbed } from "@/app/(main)/_electron/electron-embed"
import { controlYoutubeFrame, TRAILER_FADE_MS } from "@/app/(main)/_electron/youtube-control"
import { cn } from "@/components/ui/core/styling"
import { releaseVideoElement } from "@/lib/helpers/release-video-element"
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
    /** What this card previews, overriding Personal settings: episode cards play the episode itself;
     * Continue Watching follows the setting (the trailer by default). */
    kind?: "trailer" | "episode"
    /** Seconds to start at (the resume point); undefined starts a little way in. */
    startAt?: number
    /** Whether the card is hovered (the card owns the hover state). */
    hovered: boolean
    /** Told when the preview is (or stops being) visible, e.g. to pause a carousel. */
    onPlayingChange?: (playing: boolean) => void
}

export function EpisodeCardPreview(props: EpisodeCardPreviewProps) {
    const personal = usePersonalSettings()
    // Logged once per session per reason: a preview that never even attempts must say why in
    // Denshi's log, or "it doesn't work" has nothing to go on (the mid-play failures warn below).
    if (!personal.episodePreviewEnabled) previewWarnOnce("previews are DISABLED by Personal settings")
    if (!props.path && !props.trailerId) {
        previewWarnOnce(`card has neither a file nor a trailer to preview (kind ${props.kind ?? personal.episodePreviewSource})`)
    }
    if ((props.kind ?? personal.episodePreviewSource) === "trailer") {
        return props.trailerId ? <TrailerPreview {...props} trailerId={props.trailerId} /> : null
    }
    return props.path ? <FilePreview {...props} path={props.path} /> : null
}

const _previewWarnedOnce = new Set<string>()

/** console.warn that keeps only the first message of each kind (previews render per-card, so the log would flood). */
function previewWarnOnce(reason: string) {
    if (_previewWarnedOnce.has(reason)) return
    _previewWarnedOnce.add(reason)
    previewWarn(reason, "session")
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
    const wantDub = personal.trailerLanguage === "english" || (personal.trailerLanguage === "follow" && personal.audioPreference === "dub")
    const [lookedUp, setLookedUp] = React.useState(false)
    // Both languages are looked up: English finds the dub trailer, Japanese the original PV (AniList's
    // trailer isn't always the Japanese one). AniList's trailer plays while it answers or if nothing is found.
    const { data: lookup, isFetching: lookingUp } = useGetMediaTrailer(mediaId, wantDub ? "dub" : "sub", lookedUp)
    const trailerId = lookup?.id || originalTrailerId
    // English captions on a Japanese trailer (the original, or the fallback when no dub was found).
    const captions = personal.trailerCaptions && (!wantDub || !lookup?.dub) ? "en" : undefined
    const [visible, setVisible] = React.useState(false)
    const [sound, setSound] = React.useState(() => soundOverride ?? personal.episodePreviewSound)
    const canHover = useCanHover()
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
        setLookedUp(true) // starts the lookup during the hover delay
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
    if (!enabled || !active || (lookingUp && !lookup)) return null

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
                        src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1&controls=0&mute=1&disablekb=1&loop=1&playlist=${trailerId}&vq=medium&enablejsapi=1${captions ? `&cc_load_policy=1&cc_lang_pref=${captions}` : ""}`}
                        className="absolute left-0 top-1/2 aspect-video h-[calc(100%+120px)] w-full -translate-y-1/2"
                        allow="autoplay"
                        onLoad={e => {
                            // Starts muted (autoplay), then the sound fades in once it plays.
                            controlYoutubeFrame(e.currentTarget, { sound, volume: personal.episodePreviewVolume, fadeMs: TRAILER_FADE_MS })
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
    // The element the ref last pointed at. React nulls the ref when the <video> unmounts, *before*
    // the unmount cleanup below runs, so that cleanup must reach the element through this ref —
    // otherwise a detached <video> keeps streaming and holds a connection to the server (the same
    // failure video-core fixed for its own <video>; see video-core.tsx "lastVideoElRef").
    const videoElRef = React.useRef<HTMLVideoElement | null>(null)
    const setVideoEl = React.useCallback((el: HTMLVideoElement | null) => {
        // Never null it out: the unmount call happens before the cleanup effect can read the ref.
        if (el) videoElRef.current = el
    }, [])
    const [src, setSrc] = React.useState<string | null>(null)
    const [visible, setVisible] = React.useState(false)
    const [progress, setProgress] = React.useState(0)
    const [sound, setSound] = React.useState(() => soundOverride ?? personal.episodePreviewSound)

    const canHover = useCanHover()
    const enabled = personal.episodePreviewEnabled && canHover && !!path && !unpreviewable.has(path)

    const stop = React.useCallback(() => {
        const v = videoElRef.current
        if (v) {
            clearActivePreview(v)
            releaseVideoElement(v)
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

    // Unmounting (the card scrolled away, the page changed, the player opened over the list) stops
    // it too — and releases the element, which by now React has detached from the document.
    React.useEffect(() => () => {
        if (activeStop === stop) activeStop = null
        stop()
        videoElRef.current = null
    }, [stop])

    // A preview that never shows a frame (unsupported codec, unreachable file) gives up quietly.
    React.useEffect(() => {
        if (!src || visible) return
        const t = setTimeout(() => {
            const v = videoElRef.current
            previewWarn(`no picture after ${FIRST_FRAME_TIMEOUT_MS / 1000}s (readyState ${v?.readyState}, ${v?.videoWidth}x${v?.videoHeight}, error ${v?.error?.code ?? "none"})`, path)
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

    // Sound toggled while it plays fades in (or cuts out); before it plays, the fade on start does it.
    React.useEffect(() => {
        const v = videoElRef.current
        if (!v || !visible) return
        fadeInAudio(v, sound ? personal.episodePreviewVolume / 100 : 0)
    }, [sound, personal.episodePreviewVolume])

    if (!enabled || !src) return null

    const onLoadedMetadata = () => {
        const v = videoElRef.current
        if (!v || !isFinite(v.duration) || v.duration <= 0) return
        const target = personal.episodePreviewStart === "resume" && startAt && startAt > 0
            ? Math.max(0, startAt - 3)
            : v.duration * 0.1
        v.currentTime = Math.min(target, Math.max(0, v.duration - 5))
        void v.play().catch((err: any) => {
            previewWarn(`play() refused: ${err?.name ?? ""} ${err?.message ?? ""}`, path)
            unpreviewable.add(path)
            stop()
        })
    }

    return (
        <div className="pointer-events-none absolute inset-0 z-[2]" data-episode-card-preview>
            <video
                ref={setVideoEl}
                src={src}
                muted // starts silent; the sound fades in once it plays
                playsInline
                preload="metadata"
                disablePictureInPicture
                className={cn("size-full object-cover transition-opacity duration-500", visible ? "opacity-100" : "opacity-0")}
                onLoadedMetadata={onLoadedMetadata}
                onPlaying={() => {
                    const v = videoElRef.current
                    if (v && v.videoWidth > 0) {
                        setVisible(true)
                        registerActivePreview(path, v)
                        fadeInAudio(v, sound ? personal.episodePreviewVolume / 100 : 0)
                    }
                }}
                onTimeUpdate={() => {
                    const v = videoElRef.current
                    if (!v) return
                    if (v.duration) setProgress(v.currentTime / v.duration)
                    // Frames are playing: show it (the "playing" event can fire before the decoder
                    // reports a picture size).
                    if (!visible && v.videoWidth > 0 && !v.paused) {
                        setVisible(true)
                        registerActivePreview(path, v)
                        fadeInAudio(v, sound ? personal.episodePreviewVolume / 100 : 0)
                    }
                }}
                onError={() => {
                    const e = videoElRef.current?.error
                    previewWarn(`video error ${e?.code ?? "?"} ${e?.message ?? ""}`, path)
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

/** Eases a video's volume from silent up to `target` (0–1); 0 mutes it. */
function fadeInAudio(v: HTMLVideoElement, target: number) {
    const w = v as HTMLVideoElement & { __seaFade?: number }
    if (w.__seaFade) cancelAnimationFrame(w.__seaFade)
    if (target <= 0) {
        v.muted = true
        return
    }
    v.volume = 0
    v.muted = false
    const start = performance.now()
    const step = (now: number) => {
        const p = Math.min(1, (now - start) / FADE_IN_MS)
        v.volume = Math.max(0, Math.min(1, target * p * p))
        if (p < 1) w.__seaFade = requestAnimationFrame(step)
    }
    w.__seaFade = requestAnimationFrame(step)
}

const FADE_IN_MS = 2500

/** Logged as a warning so it reaches Denshi's log (main.log): why a preview didn't show. */
function previewWarn(reason: string, what: string) {
    console.warn(`[EpisodeCardPreview] ${reason} — ${what}`)
}

/**
 * Whether the pointer can hover. "(hover: hover)" describes the primary input only, and on a laptop
 * with a touchscreen that can be the touch screen — which turned every preview off on a machine
 * with a perfectly good mouse. Any hover-capable pointer counts, and the desktop app always does.
 */
function useCanHover() {
    return React.useMemo(() => {
        if (typeof window === "undefined") return false
        if (__isElectronDesktop__) return true
        return !!window.matchMedia?.("(any-hover: hover)").matches || !!window.matchMedia?.("(hover: hover)").matches
    }, [])
}
