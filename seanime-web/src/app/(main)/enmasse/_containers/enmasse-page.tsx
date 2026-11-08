"use client"

import { AnimeEnMasseActivity, EnMasseDownloaderStatus, useEnMasseStart, useEnMasseStatus, useEnMasseStop } from "@/api/hooks/enmasse.hooks"
import { useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { __anime_streamDownloadsModalIsOpenAtom } from "@/app/(main)/onlinestream/_containers/anime-downloads/anime-downloads-modal"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Switch } from "@/components/ui/switch"
import { formatNumber } from "@/lib/helpers/number"
import { useSetAtom } from "jotai/react"
import React, { useEffect, useState } from "react"
import {
    LuCheck,
    LuChevronDown,
    LuCircleCheck,
    LuClock,
    LuDownload,
    LuFilm,
    LuGauge,
    LuHourglass,
    LuListVideo,
    LuMonitorDown,
    LuPause,
    LuPlay,
    LuRefreshCw,
    LuSearch,
    LuSearchX,
    LuSkipForward,
    LuSparkles,
    LuSquare,
    LuTriangleAlert,
} from "react-icons/lu"
import { Virtuoso } from "react-virtuoso"

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Helpers
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function formatDuration(ms: number) {
    if (!isFinite(ms) || ms <= 0) return "—"
    const totalMin = Math.round(ms / 60000)
    const d = Math.floor(totalMin / 1440)
    const h = Math.floor((totalMin % 1440) / 60)
    const m = totalMin % 60
    if (d > 0) return `${d}d ${h}h`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

function timeAgo(iso: string, now: number) {
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
}

/** Re-render every few seconds for the clocks (elapsed, time ago). */
function useNow(intervalMs = 5000) {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(t)
    }, [intervalMs])
    return now
}

const PIPELINE = [
    { key: "resolve", label: "Identify", icon: LuFilm },
    { key: "search", label: "Search", icon: LuSearch },
    { key: "verify", label: "Verify", icon: LuCheck },
    { key: "queue", label: "Queue", icon: LuDownload },
] as const

function pipelineIndex(phase?: string) {
    switch (phase) {
        case "processing":
        case "torrents":
            return 0
        case "searching":
            return 1
        case "verifying":
            return 2
        case "queueing":
            return 3
    }
    return -1
}

type RunState = "running" | "waiting" | "paused" | "completed" | "idle"

function runState(status: EnMasseDownloaderStatus | undefined): RunState {
    if (!status) return "idle"
    if (status.isRunning) return status.details?.phase === "waiting" ? "waiting" : "running"
    if (status.status?.startsWith("Completed")) return "completed"
    if (status.isPaused || status.hasSavedProgress) return "paused"
    return "idle"
}

const stateStyle: Record<RunState, { label: string, className: string }> = {
    running: { label: "Running", className: "text-[--green] border-[--green]/40 bg-[--green]/10" },
    waiting: { label: "Waiting for downloads", className: "text-sky-300 border-sky-400/40 bg-sky-400/10" },
    paused: { label: "Paused", className: "text-[--orange] border-[--orange]/40 bg-[--orange]/10" },
    completed: { label: "Completed", className: "text-[--green] border-[--green]/40 bg-[--green]/10" },
    idle: { label: "Idle", className: "text-[--muted] border-[--border] bg-white/5" },
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Page
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function EnMassePage() {
    const [shouldPoll, setShouldPoll] = useState<boolean>(false)
    const { data: status, isLoading } = useEnMasseStatus(true, shouldPoll)
    const { addDownloadingAnime } = useDownloadingAnime()

    useEffect(() => {
        setShouldPoll(!!status?.isRunning)
    }, [status?.isRunning])

    useEffect(() => {
        if (status?.currentAnimeId && status.currentAnimeId > 0) addDownloadingAnime(status.currentAnimeId)
    }, [status?.currentAnimeId, addDownloadingAnime])

    if (isLoading) {
        return (
            <PageWrapper className="p-4 sm:p-8">
                <div className="flex justify-center items-center h-64"><LoadingSpinner /></div>
            </PageWrapper>
        )
    }

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-6" data-enmasse-page>
            <Hero status={status} />
            <ProgressPanel status={status} />
            <StatTiles status={status} />
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
                <NowCard status={status} />
                <ActivityFeed status={status} />
            </div>
            <HowItWorks />
        </PageWrapper>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Hero
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function Hero({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const { mutate: start, isPending: isStarting } = useEnMasseStart()
    const { mutate: stop, isPending: isStopping } = useEnMasseStop()
    const openDownloadQueue = useSetAtom(__anime_streamDownloadsModalIsOpenAtom)
    const [resume, setResume] = useState(true)
    const state = runState(status)
    const hasProgress = !!status?.hasSavedProgress
    // A run that could not start, or stopped on an error, says why in plain sight.
    const startError = !status?.isRunning && status?.status && /^(Could not start|Error)/.test(status.status) ? status.status : ""
    const art = status?.currentImage

    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/10" data-enmasse-hero>
            {/* Backdrop: the series being looked up, blurred, over a brand glow. */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-gray-950 to-fuchsia-950" />
            {!!art && <div
                key={art}
                className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-125 transition-opacity duration-700"
                style={{ backgroundImage: `url(${art})` }}
            />}
            <div className="absolute -top-24 -right-24 size-72 rounded-full bg-[--brand]/30 blur-3xl" />
            <div className="absolute -bottom-32 -left-16 size-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />

            <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end gap-6">
                <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-indigo-200/80">
                            <LuSparkles /> Anime En Masse
                        </span>
                        <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5",
                            stateStyle[state].className)}>
                            {(state === "running" || state === "waiting") && <span className="size-1.5 rounded-full bg-current animate-pulse" />}
                            {stateStyle[state].label}
                        </span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                        Your whole catalogue, <span
                        className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent"
                    >downloaded online</span>
                    </h1>
                    <p className="text-gray-300 max-w-2xl">
                        Finds every series your library is missing on Kickassanime (AnimeHeaven as the backup), queues it whole,
                        and files each episode in your library already matched: best quality, Japanese audio first, soft subtitles.
                    </p>
                    {!!status?.status && !startError && <p className="text-sm text-gray-400 line-clamp-1">{status.status}</p>}
                    {!!startError && <div
                        className="flex gap-2 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200 max-w-2xl"
                        data-enmasse-start-error
                    >
                        <LuTriangleAlert className="flex-none mt-0.5 text-red-300" />
                        <span>{startError}</span>
                    </div>}
                </div>

                <div className="flex flex-col items-stretch sm:items-end gap-3 flex-none">
                    <div className="flex gap-2 flex-wrap sm:justify-end">
                        <Button intent="white-subtle" leftIcon={<LuMonitorDown className="text-lg" />} onClick={() => openDownloadQueue(true)}>
                            Download queue
                            {!!status?.downloadQueueWaiting && <span
                                className="ml-1.5 text-xs rounded-full bg-white/15 px-1.5"
                            >{formatNumber(status.downloadQueueWaiting)}</span>}
                        </Button>
                        {status?.isRunning ? (
                            <>
                                <Button
                                    intent="warning"
                                    leftIcon={<LuPause className="text-lg" />}
                                    onClick={() => stop({ saveProgress: true })}
                                    loading={isStopping}
                                >
                                    Pause
                                </Button>
                                <Button
                                    intent="alert-subtle"
                                    leftIcon={<LuSquare className="text-lg" />}
                                    onClick={() => stop({ saveProgress: false })}
                                    loading={isStopping}
                                >
                                    Stop
                                </Button>
                            </>
                        ) : (
                            <Button
                                intent="primary"
                                size="lg"
                                className="shadow-lg shadow-indigo-500/30"
                                leftIcon={resume && hasProgress ? <LuRefreshCw className="text-xl" /> : <LuPlay className="text-xl" />}
                                onClick={() => start({ resume: resume && hasProgress })}
                                loading={isStarting}
                            >
                                {isStarting ? "Starting…" : resume && hasProgress ? "Resume" : hasProgress ? "Start over" : "Start"}
                            </Button>
                        )}
                    </div>
                    {!status?.isRunning && hasProgress && (
                        <Switch
                            value={resume}
                            onValueChange={setResume}
                            label="Continue where it left off"
                            size="sm"
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Progress
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function ProgressPanel({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const now = useNow()
    const total = status?.totalCount || status?.details?.currentAnimeTotal || 0
    const done = status?.processedCount || 0
    const pct = total ? Math.min(100, (done / total) * 100) : 0

    const started = status?.startedAt ? new Date(status.startedAt).getTime() : 0
    const elapsed = started && status?.isRunning ? now - started : 0
    const perHour = elapsed > 60000 && status?.processedThisRun ? (status.processedThisRun / elapsed) * 3600000 : 0
    const remaining = perHour > 0 ? ((total - done) / perHour) * 3600000 : 0

    return (
        <div className="rounded-2xl border bg-[--paper] p-5 sm:p-6 space-y-4" data-enmasse-progress>
            <div className="flex items-end gap-4 flex-wrap">
                <div>
                    <p className="text-xs uppercase tracking-wider text-[--muted]">Progress through the anime database</p>
                    <p className="text-4xl font-bold tabular-nums leading-tight">
                        {pct.toFixed(pct < 10 ? 2 : 1)}<span className="text-xl text-[--muted]">%</span>
                    </p>
                </div>
                <p className="text-sm text-[--muted] pb-1.5 tabular-nums">
                    {formatNumber(done)} of {formatNumber(total)} series
                </p>
                <div className="flex-1" />
                <div className="flex gap-5 text-sm">
                    <Metric icon={<LuClock />} label="Running for" value={elapsed ? formatDuration(elapsed) : "—"} />
                    <Metric icon={<LuGauge />} label="Pace" value={perHour ? `${perHour.toFixed(perHour < 10 ? 1 : 0)} series/h` : "—"} />
                    <Metric icon={<LuHourglass />} label="Time left" value={remaining ? formatDuration(remaining) : "—"} />
                </div>
            </div>
            <div className="relative h-3 rounded-full bg-gray-800 overflow-hidden">
                <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500 transition-[width] duration-700"
                    style={{ width: `${pct}%` }}
                />
                {status?.isRunning && <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"
                    style={{ width: `${pct}%` }}
                />}
            </div>
        </div>
    )
}

function Metric({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
    return (
        <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-[--muted] flex items-center gap-1 justify-end">{icon}{label}</p>
            <p className="font-semibold tabular-nums">{value}</p>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Stats
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function StatTiles({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const d = status?.details
    const tiles = [
        { label: "Series queued", value: status?.downloadedAnime?.length ?? 0, icon: LuCircleCheck, bg: "from-emerald-500/25", fg: "text-emerald-300" },
        { label: "Episodes queued", value: d?.episodesQueued ?? 0, icon: LuListVideo, bg: "from-indigo-500/25", fg: "text-indigo-300" },
        { label: "Not found online", value: status?.failedAnime?.length ?? 0, icon: LuSearchX, bg: "from-amber-500/25", fg: "text-amber-300" },
        { label: "Skipped", value: d?.skippedCount ?? 0, icon: LuSkipForward, bg: "from-slate-500/25", fg: "text-slate-300" },
        { label: "Waiting to download", value: status?.downloadQueueWaiting ?? 0, icon: LuDownload, bg: "from-sky-500/25", fg: "text-sky-300" },
    ]
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-enmasse-stats>
            {tiles.map(t => (
                <div key={t.label} className={cn("relative overflow-hidden rounded-xl border bg-gradient-to-br to-transparent p-4", t.bg)}>
                    <t.icon className={cn("absolute -right-2 -bottom-3 text-6xl opacity-15", t.fg)} />
                    <p className={cn("text-2xl font-bold tabular-nums", t.fg)}>{formatNumber(t.value)}</p>
                    <p className="text-xs text-gray-300 mt-0.5">{t.label}</p>
                </div>
            ))}
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Now
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function NowCard({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const d = status?.details
    const step = pipelineIndex(d?.phase)
    const active = !!status?.isRunning && !!status?.currentAnime

    return (
        <div className="rounded-2xl border bg-[--paper] overflow-hidden" data-enmasse-now>
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
                <h3 className="text-lg font-semibold flex-1">Now</h3>
                {d?.phase === "torrents" && <span className="text-xs rounded-full border border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200 px-2 py-0.5">
                    Replacing a torrent
                </span>}
            </div>

            {!active ? (
                <div className="px-5 pb-6 pt-2 text-center space-y-2">
                    <div className="mx-auto size-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl text-[--muted]"><LuSearch /></div>
                    <p className="text-[--muted] text-sm">
                        {runState(status) === "completed" ? "Every series in the database has been checked." : "Start a run to see what it's working on."}
                    </p>
                </div>
            ) : (
                <div className="px-5 pb-5 space-y-5">
                    <div className="flex gap-4">
                        <div className="w-20 h-28 rounded-lg overflow-hidden bg-gray-900 border flex-none shadow-lg">
                            {status?.currentImage
                                ? <img src={status.currentImage} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-2xl text-[--muted]"><LuFilm /></div>}
                        </div>
                        <div className="min-w-0 space-y-1">
                            {status?.currentAnimeId && status.currentAnimeId > 0
                                ? <SeaLink href={`/entry?id=${status.currentAnimeId}`} className="text-lg font-bold leading-snug hover:underline line-clamp-2">
                                    {status.currentAnime}
                                </SeaLink>
                                : <p className="text-lg font-bold leading-snug line-clamp-2">{status?.currentAnime}</p>}
                            <p className="text-sm text-[--muted]">
                                #{formatNumber(d?.currentAnimeIndex || status?.processedCount || 0)}
                                {d?.expectedEpisodes ? ` · ${d.expectedEpisodes} episodes` : ""}
                            </p>
                            <p className="text-sm text-gray-300 line-clamp-2">{d?.step}</p>
                        </div>
                    </div>

                    {/* Pipeline */}
                    <div className="grid grid-cols-4 gap-1.5">
                        {PIPELINE.map((p, i) => {
                            const state = step < 0 ? "todo" : i < step ? "done" : i === step ? "now" : "todo"
                            return (
                                <div key={p.key} className="space-y-1.5">
                                    <div className={cn("h-1.5 rounded-full",
                                        state === "done" && "bg-emerald-400/70",
                                        state === "now" && "bg-gradient-to-r from-indigo-400 to-fuchsia-400 animate-pulse",
                                        state === "todo" && "bg-gray-800")} />
                                    <p className={cn("text-xs flex items-center gap-1",
                                        state === "now" ? "text-white font-semibold" : state === "done" ? "text-emerald-300" : "text-[--muted]")}>
                                        <p.icon className="flex-none" /> {p.label}
                                    </p>
                                </div>
                            )
                        })}
                    </div>

                    {d?.phase === "waiting" ? (
                        <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-sm text-sky-100 flex gap-2">
                            <LuHourglass className="flex-none mt-0.5" />
                            Pausing the search while {formatNumber(status?.downloadQueueWaiting ?? 0)} episodes download, so it never runs far ahead.
                        </div>
                    ) : (
                        <div className="space-y-2 text-sm">
                            <Row label="Spelling">
                                {d?.variantsTotal ? (
                                    <span className="inline-flex items-center gap-2 min-w-0">
                                        <span className="text-[--muted] tabular-nums flex-none">{d.variantIndex}/{d.variantsTotal}</span>
                                        <span className="truncate rounded-md bg-white/5 border px-2 py-0.5 font-mono text-xs">{d.currentQuery || "—"}</span>
                                    </span>
                                ) : "—"}
                            </Row>
                            <Row label="Close matches">{formatNumber(d?.torrentsCollected ?? 0)}</Row>
                            <Row label="Matched to">
                                {d?.selectedTorrent
                                    ? <span className="text-emerald-300 truncate">{d.selectedTorrent}</span>
                                    : <span className="text-[--muted]">—</span>}
                            </Row>
                        </div>
                    )}

                    {!!d?.lastError && <p className="text-xs text-amber-300/90 flex gap-1.5"><LuTriangleAlert className="flex-none mt-0.5" />{d.lastError}</p>}
                </div>
            )}
        </div>
    )
}

function Row({ label, children }: { label: string, children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 min-w-0">
            <span className="w-28 flex-none text-[--muted]">{label}</span>
            <span className="min-w-0 flex-1 flex">{children}</span>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Activity
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type FeedTab = "recent" | "queued" | "missing"

const resultStyle: Record<AnimeEnMasseActivity["result"], { label: string, className: string, icon: React.ElementType }> = {
    queued: { label: "Queued", className: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30", icon: LuCircleCheck },
    not_found: { label: "Not found", className: "text-amber-300 bg-amber-400/10 border-amber-400/30", icon: LuSearchX },
    skipped: { label: "Skipped", className: "text-slate-300 bg-slate-400/10 border-slate-400/30", icon: LuSkipForward },
}

function ActivityFeed({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const [tab, setTab] = useState<FeedTab>("recent")
    const now = useNow(10000)
    const recent = status?.recent ?? []
    const queued = React.useMemo(() => [...(status?.downloadedAnime ?? [])].reverse(), [status?.downloadedAnime])
    const missing = React.useMemo(() => [...(status?.failedAnime ?? [])].reverse(), [status?.failedAnime])
    const list = tab === "queued" ? queued : missing

    return (
        <div className="rounded-2xl border bg-[--paper] overflow-hidden flex flex-col" data-enmasse-activity>
            <div className="px-5 pt-5 pb-3 flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold flex-1">Activity</h3>
                <div className="flex gap-1 rounded-full bg-white/5 p-1">
                    {([
                        ["recent", "Latest"],
                        ["queued", `Queued · ${formatNumber(queued.length)}`],
                        ["missing", `Not found · ${formatNumber(missing.length)}`],
                    ] as [FeedTab, string][]).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={cn("px-3 h-7 rounded-full text-xs font-medium transition-colors",
                                tab === key ? "bg-white text-gray-950" : "text-[--muted] hover:text-white")}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-h-[22rem]">
                {tab === "recent" ? (
                    recent.length ? <Virtuoso
                        style={{ height: "26rem" }}
                        data={recent}
                        computeItemKey={(i, e) => `${e.time}-${i}`}
                        itemContent={(_i, e) => <ActivityRow entry={e} now={now} />}
                    /> : <EmptyFeed text="Results appear here as each series is checked." />
                ) : list.length ? (
                    <Virtuoso
                        style={{ height: "26rem" }}
                        data={list}
                        itemContent={(_i, title) => (
                            <div className="px-5 py-2 border-t border-white/5 text-sm flex items-center gap-2">
                                {tab === "queued"
                                    ? <LuCircleCheck className="text-emerald-400 flex-none" />
                                    : <LuSearchX className="text-amber-400 flex-none" />}
                                <span className="truncate">{title}</span>
                            </div>
                        )}
                    />
                ) : <EmptyFeed text={tab === "queued" ? "Nothing queued yet." : "Nothing missed yet."} />}
            </div>
        </div>
    )
}

const ActivityRow = React.memo(function ActivityRow({ entry: e, now }: { entry: AnimeEnMasseActivity, now: number }) {
    const style = resultStyle[e.result] ?? resultStyle.skipped
    return (
        <div className="px-5 py-3 border-t border-white/5 flex gap-3 items-center hover:bg-white/[0.03] transition-colors">
            <div className="w-9 h-12 rounded-md overflow-hidden bg-gray-900 border flex-none">
                {e.image ? <img src={e.image} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-[--muted]"><LuFilm /></div>}
            </div>
            <div className="flex-1 min-w-0">
                {e.mediaId && e.mediaId > 0
                    ? <SeaLink href={`/entry?id=${e.mediaId}`} className="text-sm font-medium hover:underline line-clamp-1">{e.title}</SeaLink>
                    : <p className="text-sm font-medium line-clamp-1">{e.title}</p>}
                <p className="text-xs text-[--muted] line-clamp-1">
                    {e.result === "queued"
                        ? `${formatNumber(e.episodes ?? 0)} episodes queued from ${e.provider === "animeheaven" ? "AnimeHeaven" : "Kickassanime"}`
                        : e.detail}
                </p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-none">
                <span className={cn("text-[11px] font-semibold rounded-full border px-2 py-0.5 inline-flex items-center gap-1", style.className)}>
                    <style.icon /> {style.label}
                </span>
                <span className="text-[11px] text-[--muted]">{timeAgo(e.time, now)}</span>
            </div>
        </div>
    )
})

function EmptyFeed({ text }: { text: string }) {
    return (
        <div className="h-[22rem] flex flex-col items-center justify-center gap-2 text-[--muted] text-sm">
            <LuListVideo className="text-3xl opacity-60" />
            {text}
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// How it works
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function HowItWorks() {
    const [open, setOpen] = useState(false)
    const steps = [
        {
            title: "Torrents first",
            text: "Series still downloading as torrents are tried first, on Kickassanime only. If Kickassanime has one, its torrent is paused and the series downloads online; once the episodes are in your library the torrent and its files are removed, and if the online download fails the torrent resumes. AnimeHeaven, the backup, only replaces a torrent that has been stalled for 15 minutes or more (no download, no seeders).",
        },
        {
            title: "Skip what you have",
            text: "Series already in your library or already downloading are skipped, along with adult entries, series that haven't aired, and anything without an AniList entry.",
        },
        {
            title: "Search every spelling",
            text: "Kickassanime is searched under the English and romaji titles, every synonym, and other spellings: season wording, punctuation, accents, '&' and 'and', and the franchise name. If it doesn't have the series, AnimeHeaven is searched the same way as the backup.",
        },
        {
            title: "Verify the match",
            text: "A result must closely match one of the series' titles, and its episode list must fit the series, so a movie isn't mistaken for the TV series or a sequel for the original.",
        },
        {
            title: "Queue and match",
            text: "The whole series goes into the Anime Downloads queue: best quality, Japanese audio first with the English dub when there is one, soft subtitles, filed in your library and matched automatically.",
        },
        {
            title: "Gentle on the site",
            text: "At least 8 seconds between searches and 30 seconds per series, a 15-second pause between episode downloads, and no new searches while 24 or more episodes are waiting. Pause keeps your place.",
        },
    ]
    return (
        <div className="rounded-2xl border bg-[--paper]" data-enmasse-how>
            <button type="button" onClick={() => setOpen(o => !o)} className="w-full px-5 py-4 flex items-center gap-2 text-left">
                <h3 className="text-lg font-semibold flex-1">How it works</h3>
                <LuChevronDown className={cn("transition-transform", open && "rotate-180")} />
            </button>
            {open && <ol className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {steps.map((s, i) => (
                    <li key={s.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1.5">
                        <p className="text-sm font-semibold flex items-center gap-2">
                            <span
                                className="size-6 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-xs flex items-center justify-center flex-none"
                            >{i + 1}</span>
                            {s.title}
                        </p>
                        <p className="text-sm text-[--muted]">{s.text}</p>
                    </li>
                ))}
            </ol>}
        </div>
    )
}
