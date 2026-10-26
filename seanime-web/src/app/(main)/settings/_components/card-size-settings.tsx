"use client"
import { useGetAnimeCollection } from "@/api/hooks/anilist.hooks"
import { useGetMangaCollection } from "@/api/hooks/manga.hooks"
import { CARD_WIDTH_DEFAULT, CARD_WIDTH_MAX, CARD_WIDTH_MIN, usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { cn } from "@/components/ui/core/styling"
import { setClientSettings } from "@/lib/client-settings"
import React from "react"
import { LuBookOpen, LuLink, LuLink2Off, LuRotateCcw, LuTv } from "react-icons/lu"

/**
 * Personal -> Display -> Card size. Two widths, one for anime cards and one for manga cards, with
 * a live preview. The preview follows the slider as it moves; the rest of the app follows a moment
 * after the slider stops (one save, not one per pixel), and animates there too.
 */
export function CardSizeSettings() {
    const personal = usePersonalSettings()
    const [anime, setAnime] = React.useState(personal.animeCardWidth)
    const [manga, setManga] = React.useState(personal.mangaCardWidth)
    const [linked, setLinked] = React.useState(personal.animeCardWidth === personal.mangaCardWidth)

    // Settings changed elsewhere (another device, Reset) win over the local draft.
    React.useEffect(() => setAnime(personal.animeCardWidth), [personal.animeCardWidth])
    React.useEffect(() => setManga(personal.mangaCardWidth), [personal.mangaCardWidth])

    const commitTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
    const commit = React.useCallback((next: { animeCardWidth?: number, mangaCardWidth?: number }) => {
        clearTimeout(commitTimer.current)
        commitTimer.current = setTimeout(() => setClientSettings(prev => ({ ...prev, ...next })), 300)
    }, [])
    React.useEffect(() => () => clearTimeout(commitTimer.current), [])

    const change = (which: "anime" | "manga", v: number) => {
        if (linked) {
            setAnime(v)
            setManga(v)
            commit({ animeCardWidth: v, mangaCardWidth: v })
        } else if (which === "anime") {
            setAnime(v)
            commit({ animeCardWidth: v })
        } else {
            setManga(v)
            commit({ mangaCardWidth: v })
        }
    }

    const reset = () => {
        setAnime(CARD_WIDTH_DEFAULT)
        setManga(CARD_WIDTH_DEFAULT)
        clearTimeout(commitTimer.current)
        setClientSettings(prev => {
            const { animeCardWidth: _a, mangaCardWidth: _m, ...rest } = prev
            return rest
        })
    }

    // A real cover from each library, so the preview looks like the user's own cards.
    const { data: animeCol } = useGetAnimeCollection()
    const { data: mangaCol } = useGetMangaCollection()
    const animeSample = React.useMemo(() => {
        for (const l of animeCol?.MediaListCollection?.lists ?? []) for (const e of l?.entries ?? []) {
            if (e?.media?.coverImage?.large) return { cover: e.media.coverImage.extraLarge || e.media.coverImage.large, title: e.media.title?.userPreferred || "" }
        }
        return null
    }, [animeCol])
    const mangaSample = React.useMemo(() => {
        for (const l of mangaCol?.lists ?? []) for (const e of l?.entries ?? []) {
            if (e?.media?.coverImage?.large) return { cover: e.media.coverImage.extraLarge || e.media.coverImage.large, title: e.media.title?.userPreferred || "" }
        }
        return null
    }, [mangaCol])

    const perRow = usePerRow()

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-medium">Card size</p>
                    <p className="text-xs text-[--muted]">How big cards are everywhere: libraries, carousels, search, discover, detail pages.</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            const next = !linked
                            setLinked(next)
                            if (next) change("anime", anime)
                        }}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
                            linked ? "border-brand-400/50 bg-brand-500/15 text-brand-200" : "border-white/10 text-[--muted] hover:text-white",
                        )}
                        title="Move both sliders together"
                    >
                        {linked ? <LuLink className="size-3.5" /> : <LuLink2Off className="size-3.5" />}
                        {linked ? "Linked" : "Separate"}
                    </button>
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-[--muted] transition-colors hover:text-white"
                    >
                        <LuRotateCcw className="size-3.5" /> Reset
                    </button>
                </div>
            </div>

            <div className="grid gap-5">
                <div className="space-y-5">
                    <CardWidthSlider icon={LuTv} label="Anime cards" value={anime} perRow={perRow(anime)} onChange={v => change("anime", v)} />
                    <CardWidthSlider icon={LuBookOpen} label="Manga cards" value={manga} perRow={perRow(manga)} onChange={v => change("manga", v)} />
                </div>

                <div
                    className="sea-card-preview relative flex min-h-[20rem] items-end justify-center gap-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-black/30 px-5 pb-5 pt-8"
                    style={{ "--sea-card-w-anime": `${anime}px`, "--sea-card-w-manga": `${manga}px` } as React.CSSProperties}
                >
                    <span className="absolute left-4 top-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[--muted]">Preview</span>
                    <PreviewCard type="anime" sample={animeSample} />
                    <PreviewCard type="manga" sample={mangaSample} />
                </div>
            </div>
        </div>
    )
}

function CardWidthSlider({ icon: Icon, label, value, perRow, onChange }: {
    icon: React.ElementType
    label: string
    value: number
    perRow: number
    onChange: (v: number) => void
}) {
    const pct = ((value - CARD_WIDTH_MIN) / (CARD_WIDTH_MAX - CARD_WIDTH_MIN)) * 100
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.05] text-[--muted]"><Icon className="size-4" /></span>
                    {label}
                </span>
                <span className="text-xs tabular-nums text-[--muted]">
                    <span className="font-semibold text-white">{value}px</span> · ≈ {perRow} per row
                </span>
            </div>
            <div className="group relative h-6">
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-600 to-brand-400" style={{ width: `${pct}%` }} />
                </div>
                <div
                    className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgb(var(--color-brand-500)/0.25)] transition-transform group-hover:scale-110 group-active:scale-125"
                    style={{ left: `calc(${pct}% - 8px)` }}
                />
                <input
                    type="range"
                    aria-label={label}
                    min={CARD_WIDTH_MIN}
                    max={CARD_WIDTH_MAX}
                    step={2}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </div>
            <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-[--muted]">
                <span>Smaller</span>
                <span>Larger</span>
            </div>
        </div>
    )
}

function PreviewCard({ type, sample }: { type: "anime" | "manga", sample: { cover: string, title: string } | null }) {
    return (
        <div className={cn(type === "manga" ? "sea-card-manga" : "sea-card-anime", "shrink-0")} style={{ width: "min(var(--sea-card-w), 15rem)" }}>
            <div className="relative aspect-[6/8] overflow-hidden rounded-[--radius-md] bg-gray-900 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
                {sample ? (
                    <img src={sample.cover} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
                ) : (
                    <div className={cn("absolute inset-0 bg-gradient-to-br", type === "manga" ? "from-fuchsia-600/50 to-indigo-900" : "from-brand-500/50 to-slate-900")} />
                )}
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
                <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-white/90 backdrop-blur">
                    {type}
                </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-medium" data-media-entry-card-title-section-title>
                {sample?.title || (type === "manga" ? "Manga title" : "Anime title")}
            </p>
        </div>
    )
}

/** Roughly how many cards of a width fit across the main content area on this screen. */
function usePerRow() {
    const [width, setWidth] = React.useState(() => typeof window === "undefined" ? 1600 : window.innerWidth)
    React.useEffect(() => {
        const on = () => setWidth(window.innerWidth)
        window.addEventListener("resize", on)
        return () => window.removeEventListener("resize", on)
    }, [])
    return (cardWidth: number) => {
        const content = Math.max(320, width - (width >= 1024 ? 160 : 32))
        const gap = 16
        const fitted = Math.floor((content + gap) / (cardWidth + gap))
        return Math.max(2, fitted)
    }
}
