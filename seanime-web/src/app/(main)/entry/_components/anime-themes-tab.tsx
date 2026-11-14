"use client"
import { Anime_Entry } from "@/api/generated/types"
import { AnimeThemesSeriesAnime, themeMedia, useGetAnimeThemesSeries } from "@/api/hooks/anime_themes.hooks"
import { ThemeFavoriteButton, tracksFromSeries, trackFromTheme, useThemePlayer } from "@/app/(main)/_features/anime-themes/theme-player"
import { cn } from "@/components/ui/core/styling"
import { useClientSettings } from "@/lib/client-settings"
import React from "react"
import { LuListMusic, LuMusic, LuPause, LuPlay } from "react-icons/lu"

/**
 * Anime page -> Anime Themes: every opening and ending of this anime and of the rest of its series
 * (animethemes.moe), in airing order. "Play all" plays them first to last in the player bar.
 */
export function AnimeThemesTab({ entry }: { entry: Anime_Entry }) {
    const { data, isLoading, isError } = useGetAnimeThemesSeries(entry.mediaId, entry.media?.idMal)
    const player = useThemePlayer()
    const all = React.useMemo(() => tracksFromSeries(data?.anime), [data])
    const [scope, setScope] = React.useState<"series" | "season">("series")
    const shown = React.useMemo(() => (data?.anime ?? []).filter(a => scope === "series" || a.current), [data, scope])

    if (isLoading) {
        return <p className="py-8 text-center text-sm text-[--muted]">Looking up the themes on AnimeThemes…</p>
    }
    if (isError) {
        return <p className="py-8 text-center text-sm text-[--muted]">AnimeThemes could not be reached. Try again in a moment.</p>
    }
    if (!data?.anime?.length || !all.length) {
        return <p className="py-8 text-center text-sm text-[--muted]">AnimeThemes has no openings or endings for this anime yet.</p>
    }

    const seasonTracks = tracksFromSeries(data.anime.filter(a => a.current))
    const queueTracks = scope === "series" ? all : seasonTracks

    return (
        <div className="space-y-5" data-anime-themes-tab>
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => player.play(queueTracks)}
                    disabled={!queueTracks.length}
                    className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-950/30 transition hover:bg-brand-400 disabled:opacity-40"
                >
                    <LuListMusic className="size-4" /> Play all ({queueTracks.length})
                </button>
                <div className="flex rounded-full border border-white/10 p-0.5 text-xs">
                    {(["series", "season"] as const).map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setScope(s)}
                            className={cn("rounded-full px-3 py-1.5 font-medium transition", scope === s ? "bg-white/10 text-white" : "text-[--muted] hover:text-white")}
                        >
                            {s === "series" ? "Whole series" : "This season"}
                        </button>
                    ))}
                </div>
                {!!data.series.length && <span className="text-xs text-[--muted]">Series: {data.series.join(", ")}</span>}
                <a href="https://animethemes.moe/" target="_blank" rel="noreferrer" className="ml-auto text-xs text-[--muted] hover:text-white">
                    from animethemes.moe
                </a>
            </div>

            {shown.map(anime => <AnimeThemesGroup key={anime.slug} anime={anime} queue={queueTracks} />)}
        </div>
    )
}

function AnimeThemesGroup({ anime, queue }: { anime: AnimeThemesSeriesAnime, queue: ReturnType<typeof tracksFromSeries> }) {
    const player = useThemePlayer()
    return (
        <section className={cn("rounded-2xl border p-3 sm:p-4", anime.current ? "border-brand-300/30 bg-brand-500/[0.06]" : "border-white/[0.08] bg-black/20")}>
            <header className="mb-2 flex items-center gap-3">
                {anime.image && <img src={anime.image} alt="" className="h-12 w-9 shrink-0 rounded-md object-cover" loading="lazy" />}
                <div className="min-w-0">
                    <h3 className="truncate font-semibold text-white">{anime.name}</h3>
                    <p className="text-xs text-[--muted]">
                        {[anime.season, anime.year || null].filter(Boolean).join(" ")}
                        {anime.current && <span className="ml-2 rounded bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-200">This anime</span>}
                    </p>
                </div>
            </header>
            {anime.themes.length === 0 && <p className="px-1 py-2 text-xs text-[--muted]">No themes listed.</p>}
            <div className="space-y-1">
                {anime.themes.map(theme => {
                    const track = trackFromTheme(anime, theme)
                    const { resolution } = themeMedia(theme)
                    const isCurrent = !!track && player.current?.key === track.key
                    const entry = theme.entries?.[0]
                    return (
                        <div
                            key={theme.slug}
                            className={cn("flex items-center gap-3 rounded-xl px-2 py-1.5 transition", isCurrent ? "bg-white/10" : "hover:bg-white/5")}
                        >
                            <button
                                type="button"
                                disabled={!track}
                                aria-label={isCurrent && player.playing ? "Pause" : "Play"}
                                onClick={() => {
                                    if (!track) return
                                    if (isCurrent) return player.toggle()
                                    // Plays from here through the rest of the list.
                                    const at = queue.findIndex(t => t.key === track.key)
                                    player.play(at >= 0 ? queue : [track], Math.max(0, at))
                                }}
                                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-200 transition hover:bg-brand-500/30 disabled:opacity-30"
                            >
                                {isCurrent && player.playing ? <LuPause className="size-3.5" /> : <LuPlay className="size-3.5" />}
                            </button>
                            <span className="w-11 shrink-0 text-xs font-bold text-brand-200">{theme.slug}</span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-white">{theme.song?.title ?? "Unknown"}</p>
                                <p className="truncate text-xs text-[--muted]">
                                    {theme.song?.artists?.map(a => a.name).join(", ")}
                                    {entry?.episodes ? ` · Ep ${entry.episodes}` : ""}
                                    {entry?.spoiler ? " · Spoiler" : ""}
                                </p>
                            </div>
                            {resolution && <span className="hidden text-xs text-[--muted] sm:inline">{resolution}p</span>}
                            {track && <ThemeFavoriteButton track={track} />}
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

/**
 * Personal -> "Automatically play openings on anime pages": the page's series starts playing,
 * first theme first, once per page visit. Mounted outside the tabs so it runs whichever tab is open.
 */
export function AnimeThemesAutoplay({ entry }: { entry: Anime_Entry }) {
    const { autoPlayThemesOnDetails } = useClientSettings()
    const { data } = useGetAnimeThemesSeries(autoPlayThemesOnDetails ? entry.mediaId : null, entry.media?.idMal)
    const player = useThemePlayer()
    const startedFor = React.useRef<number | null>(null)
    React.useEffect(() => {
        if (!autoPlayThemesOnDetails || !data || startedFor.current === entry.mediaId) return
        const tracks = tracksFromSeries(data.anime)
        if (!tracks.length) return
        startedFor.current = entry.mediaId
        player.play(tracks)
    }, [autoPlayThemesOnDetails, data, entry.mediaId])
    return null
}

export { LuMusic as AnimeThemesTabIcon }
