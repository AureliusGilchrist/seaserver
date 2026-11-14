"use client"
import { getServerBaseUrl } from "@/api/client/server-url"
import { AnimeTheme, AnimeThemesSeriesAnime, themeMedia, ThemeFavorite, useGetThemeFavorites, useToggleThemeFavorite } from "@/api/hooks/anime_themes.hooks"
import { cn } from "@/components/ui/core/styling"
import { useClientSettings } from "@/lib/client-settings"
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import React from "react"
import { LuHeart, LuListMusic, LuMusic, LuPause, LuPlay, LuSkipBack, LuSkipForward, LuVideo, LuVideoOff, LuX } from "react-icons/lu"

/**
 * The app-wide openings player: one queue of animethemes.moe themes, played one after another in a
 * small bar at the bottom of the screen. The Anime Themes tab, the "play openings on anime pages"
 * setting and the favourite openings on the profile all fill it.
 */

export type ThemeTrack = {
    key: string
    mediaId: number
    themeSlug: string
    animeName: string
    songTitle: string
    artists: string
    video: string | null
    audio: string | null
    image: string
}

const queueAtom = atom<ThemeTrack[]>([])
const indexAtom = atom(0)
const playingAtom = atom(false)
const showVideoAtom = atom(false)

export const THEME_PLAYER_VOLUME_DEFAULT = 70

/**
 * Pauses the opening playing in the bar, if any. The local and online player call it when the
 * mouse comes over the video, so an opening never talks over an episode.
 */
export function usePauseOpenings() {
    const [playing, setPlaying] = useAtom(playingAtom)
    const hasQueue = useAtomValue(queueAtom).length > 0
    return React.useCallback(() => {
        if (playing && hasQueue) setPlaying(false)
    }, [playing, hasQueue])
}

/** Personal -> "Openings volume", as the 0–1 a media element takes. */
export function themePlayerVolume(v: number | undefined) {
    return Math.min(100, Math.max(0, v ?? THEME_PLAYER_VOLUME_DEFAULT)) / 100
}

export function proxied(url: string) {
    return `${getServerBaseUrl()}/api/v1/proxy?url=${encodeURIComponent(url)}`
}

export function trackFromTheme(anime: Pick<AnimeThemesSeriesAnime, "slug" | "name" | "anilistId" | "image">, theme: AnimeTheme): ThemeTrack | null {
    const { video, audio } = themeMedia(theme)
    if (!video && !audio) return null
    return {
        key: `${anime.slug}:${theme.slug}`,
        mediaId: anime.anilistId,
        themeSlug: theme.slug,
        animeName: anime.name,
        songTitle: theme.song?.title ?? "Unknown",
        artists: theme.song?.artists?.map(a => a.name).join(", ") ?? "",
        video,
        audio,
        image: anime.image,
    }
}

export function trackFromFavorite(f: ThemeFavorite): ThemeTrack | null {
    if (!f.videoUrl && !f.audioUrl) return null
    return {
        key: `fav:${f.mediaId}:${f.themeSlug}`,
        mediaId: f.mediaId,
        themeSlug: f.themeSlug,
        animeName: f.animeName,
        songTitle: f.songTitle,
        artists: f.artists,
        video: f.videoUrl || null,
        audio: f.audioUrl || null,
        image: f.image,
    }
}

/** Every theme of a series, first anime first, openings before endings. */
export function tracksFromSeries(anime: AnimeThemesSeriesAnime[] | undefined): ThemeTrack[] {
    return (anime ?? []).flatMap(a => a.themes.map(t => trackFromTheme(a, t)).filter((t): t is ThemeTrack => !!t))
}

export function useThemePlayer() {
    const setQueue = useSetAtom(queueAtom)
    const setIndex = useSetAtom(indexAtom)
    const setPlaying = useSetAtom(playingAtom)
    const queue = useAtomValue(queueAtom)
    const index = useAtomValue(indexAtom)
    const playing = useAtomValue(playingAtom)
    const current = queue[index] ?? null
    return {
        current,
        playing,
        play: React.useCallback((tracks: ThemeTrack[], start = 0) => {
            if (!tracks.length) return
            setQueue(tracks)
            setIndex(Math.min(Math.max(0, start), tracks.length - 1))
            setPlaying(true)
        }, []),
        toggle: React.useCallback(() => setPlaying(p => !p), []),
        stop: React.useCallback(() => {
            setPlaying(false)
            setQueue([])
            setIndex(0)
        }, []),
    }
}

/** A heart that favourites one theme for the profile's Favorites. */
export function ThemeFavoriteButton({ track, className }: { track: ThemeTrack, className?: string }) {
    const { data } = useGetThemeFavorites()
    const { mutate, isPending } = useToggleThemeFavorite()
    const isFavorite = !!data?.some(f => f.mediaId === track.mediaId && f.themeSlug === track.themeSlug)
    if (!track.mediaId) return null
    const label = isFavorite ? "Remove from favourite openings" : "Favourite this theme"
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={isFavorite}
            disabled={isPending}
            onClick={e => {
                e.stopPropagation()
                mutate({
                    mediaId: track.mediaId,
                    themeSlug: track.themeSlug,
                    animeName: track.animeName,
                    songTitle: track.songTitle,
                    artists: track.artists,
                    videoUrl: track.video ?? "",
                    audioUrl: track.audio ?? "",
                    image: track.image,
                })
            }}
            className={cn(
                "inline-flex items-center justify-center rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-60",
                isFavorite && "text-[--red] hover:text-[--red]",
                className,
            )}
        >
            <LuHeart className={cn("size-4", isFavorite && "fill-current")} />
        </button>
    )
}

/** The bar itself. Mounted once, in the main layout. */
export function ThemePlayerBar() {
    const [queue, setQueue] = useAtom(queueAtom)
    const [index, setIndex] = useAtom(indexAtom)
    const [playing, setPlaying] = useAtom(playingAtom)
    const [showVideo, setShowVideo] = useAtom(showVideoAtom)
    const [showList, setShowList] = React.useState(false)
    const mediaRef = React.useRef<HTMLMediaElement | null>(null)
    const current = queue[index] ?? null
    const volume = themePlayerVolume(useClientSettings().themePlayerVolume)
    React.useEffect(() => {
        if (mediaRef.current) mediaRef.current.volume = volume
    }, [volume])

    // Audio when there is an audio rip and the video is hidden; the video otherwise.
    const useVideo = !!current && (showVideo || !current.audio)
    const src = current ? proxied((useVideo ? current.video : current.audio) ?? current.video ?? "") : ""

    // Loading a new source fires "pause" on its own; that one is not the user pausing.
    const srcChangedAt = React.useRef(0)
    React.useEffect(() => {
        srcChangedAt.current = Date.now()
    }, [src])

    React.useEffect(() => {
        const el = mediaRef.current
        if (!el || !current) return
        if (playing) el.play().catch(() => setPlaying(false))
        else el.pause()
    }, [playing, src])

    const next = React.useCallback(() => {
        if (index + 1 < queue.length) setIndex(index + 1)
        else setPlaying(false)
    }, [index, queue.length])

    if (!current) return null

    const stop = () => {
        setPlaying(false)
        setQueue([])
        setIndex(0)
        setShowList(false)
    }

    const mediaProps = {
        ref: (el: HTMLMediaElement | null) => {
            mediaRef.current = el
            if (el) el.volume = volume
        },
        src,
        autoPlay: playing,
        onEnded: next,
        onPlay: () => setPlaying(true),
        onPause: (e: React.SyntheticEvent<HTMLMediaElement>) => {
            if (Date.now() - srcChangedAt.current < 1500) return
            if (!(e.currentTarget as HTMLMediaElement).ended) setPlaying(false)
        },
        // A dead link skips to the next theme rather than stopping the run.
        onError: next,
    }

    return (
        <div
            data-theme-player-bar
            className="fixed bottom-4 right-4 z-[90] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-gray-950/80 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
            {useVideo && showVideo
                ? <video {...mediaProps} className="aspect-video w-full bg-black" playsInline />
                : <audio {...mediaProps} className="hidden" />}
            <div className="flex items-center gap-3 p-3">
                <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-black/40">
                    {current.image
                        ? <img src={current.image} alt="" className="size-full object-cover" />
                        : <LuMusic className="m-3 size-5 text-white/50" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                        <span className="mr-1.5 rounded bg-brand-500/20 px-1 py-0.5 text-[10px] font-bold text-brand-200">{current.themeSlug}</span>
                        {current.songTitle}
                    </p>
                    <p className="truncate text-xs text-white/55">{[current.artists, current.animeName].filter(Boolean).join(" · ")}</p>
                </div>
                <ThemeFavoriteButton track={current} />
                <button type="button" aria-label="Close" onClick={stop} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                    <LuX className="size-4" />
                </button>
            </div>
            <div className="flex items-center justify-between gap-1 border-t border-white/[0.06] px-3 py-1.5">
                <span className="text-[11px] tabular-nums text-white/45">{index + 1} / {queue.length}</span>
                <div className="flex items-center gap-1">
                    <button type="button" aria-label="Previous" disabled={index === 0} onClick={() => setIndex(index - 1)} className="rounded-full p-1.5 text-white/75 hover:bg-white/10 disabled:opacity-30">
                        <LuSkipBack className="size-4" />
                    </button>
                    <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
                        {playing ? <LuPause className="size-4" /> : <LuPlay className="size-4" />}
                    </button>
                    <button type="button" aria-label="Next" disabled={index + 1 >= queue.length} onClick={() => setIndex(index + 1)} className="rounded-full p-1.5 text-white/75 hover:bg-white/10 disabled:opacity-30">
                        <LuSkipForward className="size-4" />
                    </button>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        aria-label={showVideo ? "Hide video" : "Show video"}
                        title={showVideo ? "Hide video" : "Show video"}
                        disabled={!current.video}
                        onClick={() => setShowVideo(!showVideo)}
                        className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                        {showVideo ? <LuVideoOff className="size-4" /> : <LuVideo className="size-4" />}
                    </button>
                    <button type="button" aria-label="Queue" title="Queue" onClick={() => setShowList(!showList)} className={cn("rounded-full p-1.5 hover:bg-white/10", showList ? "text-white" : "text-white/60")}>
                        <LuListMusic className="size-4" />
                    </button>
                </div>
            </div>
            {showList && (
                <ol className="max-h-56 overflow-y-auto border-t border-white/[0.06] py-1">
                    {queue.map((t, i) => (
                        <li key={`${t.key}-${i}`}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIndex(i)
                                    setPlaying(true)
                                }}
                                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/5", i === index ? "text-white" : "text-white/60")}
                            >
                                <span className="w-9 shrink-0 font-bold text-brand-200">{t.themeSlug}</span>
                                <span className="min-w-0 flex-1 truncate">{t.songTitle}</span>
                                <span className="max-w-[40%] shrink-0 truncate text-white/40">{t.animeName}</span>
                            </button>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    )
}
