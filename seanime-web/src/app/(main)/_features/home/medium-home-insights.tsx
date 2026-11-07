"use client"

import { useGetProfileMissingEpisodes } from "@/api/hooks/anime_entries.hooks"
import { useGetHomeCounts, useGetMangaDownloadSize } from "@/api/hooks/home-counts.hooks"
import { useLandingAnimeStats, useLandingMangaStats } from "@/app/(main)/_features/home/landing-widget-views"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"

type Metric = { label: string, value: number | string | null, detail: string }

function Insights({ medium, metrics }: { medium: "Anime" | "Manga", metrics: Metric[] }) {
    const profile = useServerStatus()?.currentProfile
    return (
        <div className="space-y-4" data-medium-home-insights={medium.toLowerCase()}>
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/25 p-5 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-7">
                <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-[--brand]/20 blur-3xl" />
                <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-[--brand]">{medium} home</p>
                <h1 className="relative mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                    {profile?.name ? `Welcome back, ${profile.name}` : "Welcome back"}
                </h1>
                <p className="relative mt-2 text-sm text-white/70">Your {medium.toLowerCase()} collection and activity, at a glance.</p>
            </section>
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-black/40 via-black/25 to-brand-950/25 p-5 shadow-2xl shadow-black/25 backdrop-blur-md sm:p-7">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[--brand]">Your numbers</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{medium} library insights</h2>
                <p className="mt-1 text-sm text-white/60">Personal AniList progress alongside server-wide storage.</p>
                <div className={`mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 ${medium === "Anime" ? "2xl:grid-cols-8" : "2xl:grid-cols-7"}`}>
                    {metrics.map(metric => (
                        <div key={metric.label} className="min-w-0 rounded-2xl border border-white/[0.08] bg-black/25 p-3.5 shadow-lg shadow-black/10 backdrop-blur-md">
                            <p className="break-words text-2xl font-extrabold tabular-nums text-white">{metric.value === null ? "—" : typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}</p>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/75">{metric.label}</p>
                            <p className="mt-1 text-[11px] text-white/50">{metric.detail}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}

export function AnimeHomeInsights() {
    const profile = useServerStatus()?.currentProfile
    const { stats, isLoading, isError } = useLandingAnimeStats()
    const { data: counts, isError: countsError } = useGetHomeCounts()
    const missing = useGetProfileMissingEpisodes(profile?.id)
    const personalDetail = !profile?.id ? "Sign in to a profile" : isLoading ? "Loading personal AniList..." : isError ? "Could not load profile's AniList" : stats ? "Your AniList" : "Personal AniList unavailable"
    const diskDetail = countsError ? "Could not load server totals" : counts ? "Server-wide" : "Loading server totals..."
    return <Insights medium="Anime" metrics={[
        { label: "Titles in library", value: stats?.onLists ?? null, detail: `${personalDetail} · including planning` },
        { label: "Watching", value: stats?.current ?? null, detail: stats ? "Includes rewatching" : personalDetail },
        { label: "Planning", value: stats?.planning ?? null, detail: personalDetail },
        { label: "Completed", value: stats?.completed ?? null, detail: personalDetail },
        { label: "Episodes watched", value: stats?.progress ?? null, detail: personalDetail },
        { label: "Local anime files", value: counts?.animeFiles ?? null, detail: diskDetail },
        { label: "Library size", value: counts?.animeSize || null, detail: counts?.animeSize ? "Server library folders at startup" : "Server library size unavailable" },
        { label: "Missing episodes", value: missing.data ? (missing.data.episodes?.length ?? 0) : null, detail: !profile?.id ? "Sign in to a profile" : missing.isError ? "Could not load missing episodes" : missing.data ? "Local shows on your list · excludes silenced" : "Loading..." },
    ]} />
}

export function MangaHomeInsights() {
    const profile = useServerStatus()?.currentProfile
    const { stats, isLoading, isError } = useLandingMangaStats()
    const { data: counts, isError: countsError } = useGetHomeCounts()
    const size = useGetMangaDownloadSize()
    const personalDetail = !profile?.id ? "Sign in to a profile" : isLoading ? "Loading personal AniList..." : isError ? "Could not load profile's AniList" : stats ? "Your AniList" : "Personal AniList unavailable"
    return <Insights medium="Manga" metrics={[
        { label: "Titles in collection", value: stats?.onLists ?? null, detail: `${personalDetail} · including planning` },
        { label: "Reading", value: stats?.current ?? null, detail: stats ? "Includes rereading" : personalDetail },
        { label: "Planning", value: stats?.planning ?? null, detail: personalDetail },
        { label: "Completed", value: stats?.completed ?? null, detail: personalDetail },
        { label: "Chapters read", value: stats?.progress ?? null, detail: personalDetail },
        { label: "Downloaded chapters", value: counts?.mangaAvailable ? counts.mangaChapters : null, detail: countsError ? "Could not load server totals" : counts?.mangaAvailable ? "Server-wide" : counts ? "Downloader unavailable" : "Loading server totals..." },
        { label: "Download size", value: !size.isError && size.data?.ready ? size.data.size : null, detail: size.isError ? "Could not read download directory" : size.data?.ready ? "Server download folder · cached 5 min" : "Calculating server storage..." },
    ]} />
}
