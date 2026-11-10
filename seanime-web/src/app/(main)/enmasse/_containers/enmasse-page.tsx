"use client"

import { buildSeaQuery } from "@/api/client/requests"
import { AnimeEnMasseActivity, AnimeEnMasseReady, AnimeEnMasseReasonCount, EnMasseDownloaderStatus, useEnMasseStart, useEnMasseStatus, useEnMasseStop } from "@/api/hooks/enmasse.hooks"
import { isOnlinestreamDownloadRunning, useGetOnlinestreamDownloads } from "@/api/hooks/onlinestream_download.hooks"
import { useDownloadingAnime } from "@/app/(main)/_atoms/downloading.atoms"
import { AnimePaheAccessCard } from "@/app/(main)/enmasse/_containers/animepahe-access-card"
import {
    __anime_streamDownloadsModalIsOpenAtom,
    formatDownloadBytes,
} from "@/app/(main)/onlinestream/_containers/anime-downloads/anime-downloads-modal"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { SeaLink } from "@/components/shared/sea-link"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Switch } from "@/components/ui/switch"
import { formatNumber } from "@/lib/helpers/number"
import { useSetAtom } from "jotai/react"
import { AnimatePresence, motion } from "motion/react"
import React, { useEffect, useState } from "react"
import {
    LuArrowUpRight,
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
    LuX,
    LuZap,
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

function providerName(p?: string) {
    if (p === "animeheaven") return "AnimeHeaven"
    if (p === "animepahe") return "AnimePahe"
    if (p === "anizone") return "AniZone"
    if (p === "animegg") return "AnimeGG"
    if (p === "kickassanime") return "Kickassanime"
    return p || ""
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

/** A number that glides to its new value instead of jumping. */
function AnimatedNumber({ value, className }: { value: number, className?: string }) {
    const [shown, setShown] = useState(value)
    const fromRef = React.useRef(value)
    useEffect(() => {
        const from = fromRef.current
        if (from === value) return
        const start = performance.now()
        const duration = 700
        let raf = 0
        const step = (t: number) => {
            const k = Math.min(1, (t - start) / duration)
            const eased = 1 - Math.pow(1 - k, 3)
            setShown(Math.round(from + (value - from) * eased))
            if (k < 1) raf = requestAnimationFrame(step)
            else fromRef.current = value
        }
        raf = requestAnimationFrame(step)
        return () => {
            cancelAnimationFrame(raf)
            fromRef.current = value
        }
    }, [value])
    return <span className={className}>{formatNumber(shown)}</span>
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

type RunState = "running" | "waiting" | "offline" | "paused" | "completed" | "idle"

function runState(status: EnMasseDownloaderStatus | undefined): RunState {
    if (!status) return "idle"
    if (status.isRunning) {
        if (status.details?.phase === "offline") return "offline"
        return status.details?.phase === "waiting" ? "waiting" : "running"
    }
    if (status.status?.startsWith("Completed")) return "completed"
    if (status.isPaused || status.hasSavedProgress) return "paused"
    return "idle"
}

const stateStyle: Record<RunState, { label: string, dot: string, className: string }> = {
    running: { label: "Running", dot: "bg-emerald-400", className: "text-emerald-200 border-emerald-400/30 bg-emerald-400/10" },
    waiting: { label: "Waiting for downloads", dot: "bg-sky-400", className: "text-sky-200 border-sky-400/30 bg-sky-400/10" },
    offline: { label: "Waiting for internet", dot: "bg-amber-400", className: "text-amber-200 border-amber-400/30 bg-amber-400/10" },
    paused: { label: "Paused", dot: "bg-amber-400", className: "text-amber-200 border-amber-400/30 bg-amber-400/10" },
    completed: { label: "Completed", dot: "bg-emerald-400", className: "text-emerald-200 border-emerald-400/30 bg-emerald-400/10" },
    idle: { label: "Idle", dot: "bg-gray-500", className: "text-gray-300 border-white/10 bg-white/5" },
}

/** The run's progress: the database, then the torrent series it does not list. */
function useRunProgress(status: EnMasseDownloaderStatus | undefined) {
    const now = useNow()
    // The pass over torrent series outside the database, after it, until every one has been checked.
    const torrentPass = !!status?.isRunning && !!status?.details?.torrentTotal
        && (status.details.torrentIndex ?? 0) < status.details.torrentTotal
    const dbTotal = status?.totalCount || status?.details?.currentAnimeTotal || 0
    const dbDone = status?.processedCount || 0
    const total = torrentPass ? status!.details!.torrentTotal! : dbTotal
    const done = torrentPass ? (status!.details!.torrentIndex || 0) : dbDone
    const pct = total ? Math.min(100, (done / total) * 100) : 0
    const started = status?.startedAt ? new Date(status.startedAt).getTime() : 0
    const elapsed = started && status?.isRunning ? now - started : 0
    const perHour = elapsed > 60000 && status?.processedThisRun ? (status.processedThisRun / elapsed) * 3600000 : 0
    const remaining = perHour > 0 ? ((dbTotal - dbDone) / perHour) * 3600000 : 0
    return { torrentPass, total, done, pct, elapsed, perHour, remaining }
}

/** The covers of the series most recently queued. */
function useRecentPosters(status: EnMasseDownloaderStatus | undefined, max: number) {
    return React.useMemo(() => {
        const seen = new Set<number>()
        const out: AnimeEnMasseActivity[] = []
        for (const e of status?.recent ?? []) {
            if (e.result !== "queued" || !e.image || !e.mediaId || seen.has(e.mediaId)) continue
            seen.add(e.mediaId)
            out.push(e)
            if (out.length >= max) break
        }
        return out
    }, [status?.recent, max])
}

const panel = "rounded-3xl border border-white/[0.07] bg-gray-950/60 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]"

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
        <PageWrapper className="relative p-4 sm:p-8 space-y-6" data-enmasse-page>
            {/* Ambient page glow behind everything. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[40rem] overflow-hidden -z-10">
                <div className="absolute -top-40 left-1/4 size-[36rem] rounded-full bg-indigo-600/10 blur-[120px]" />
                <div className="absolute -top-20 right-0 size-[30rem] rounded-full bg-fuchsia-600/10 blur-[120px]" />
            </div>

            <Stage status={status} />

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-6 items-stretch">
                {/* The activity feed grows to the height of the column beside it. */}
                <div className="flex flex-col gap-6 min-w-0">
                    <JustQueued status={status} />
                    <ActivityFeed status={status} />
                </div>
                <div className="space-y-6 min-w-0">
                    <DownloadingNow />
                    <Totals status={status} />
                    <AnimePaheAccessCard />
                    <HowItWorks />
                </div>
            </div>
        </PageWrapper>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Stage: what is happening, the progress, and the controls, in one place
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function Stage({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const state = runState(status)
    const d = status?.details
    const active = !!status?.isRunning && !!status?.currentAnime
    const art = active ? status?.currentImage : undefined
    const posters = useRecentPosters(status, 3)
    const backdrop = art || posters[0]?.image
    const progress = useRunProgress(status)
    // A run that could not start, or stopped on an error, says why in plain sight.
    const startError = !status?.isRunning && status?.status && /^(Could not start|Error)/.test(status.status) ? status.status : ""

    const heading = state === "offline" ? "Waiting for the internet connection"
        : active ? status!.currentAnime!
        : state === "waiting" ? "Letting the downloads catch up"
            : state === "paused" ? "Paused, ready to pick up where it left off"
                : state === "completed" ? "Every series has been checked"
                    : "Your whole catalogue, downloaded online"

    return (
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gray-950 shadow-2xl shadow-black/40" data-enmasse-hero>
            {/* Backdrop: the series being looked up (or the latest queued), blurred, over brand light. */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.35),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(217,70,239,0.25),transparent_55%)]" />
            <AnimatePresence mode="popLayout">
                {!!backdrop && <motion.div
                    key={backdrop}
                    className="absolute inset-0 bg-cover bg-center blur-3xl saturate-150"
                    style={{ backgroundImage: `url(${backdrop})` }}
                    initial={{ opacity: 0, scale: 1.25 }}
                    animate={{ opacity: art ? 0.45 : 0.25, scale: 1.4 }}
                    exit={{ opacity: 0 }}
                    transition={{ opacity: { duration: 1.2 }, scale: { duration: 30, ease: "linear" } }}
                />}
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-r from-gray-950/95 via-gray-950/70 to-gray-950/40" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />
            {/* Fine grid for texture. */}
            <div
                className="absolute inset-0 opacity-[0.06] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
                style={{
                    backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
                    backgroundSize: "36px 36px",
                }}
            />

            <div className="relative grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)_auto] gap-8 p-6 sm:p-10 items-center">
                {/* Left: the series being looked up, or a fan of the latest queued covers. */}
                <div className="hidden md:flex justify-center">
                    <AnimatePresence mode="wait">
                        {art ? (
                            <motion.div
                                key={art}
                                initial={{ opacity: 0, y: 16, rotate: -3, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                                transition={{ duration: 0.55, ease: "easeOut" }}
                                className="relative w-40 xl:w-44 aspect-[2/3]"
                            >
                                <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-indigo-500/60 via-fuchsia-500/40 to-pink-500/30 blur-2xl" />
                                <img src={art} alt="" className="relative w-full h-full object-cover rounded-2xl ring-1 ring-white/25 shadow-2xl" />
                                {d?.phase === "torrents" && <span
                                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-fuchsia-500 px-3 py-1 text-[11px] font-semibold shadow-lg shadow-fuchsia-500/40"
                                >
                                    Replacing a torrent
                                </span>}
                            </motion.div>
                        ) : posters.length ? (
                            <motion.div key="fan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative w-56 h-60">
                                {posters.slice(0, 3).reverse().map((p, i, arr) => {
                                    const k = i - (arr.length - 1) / 2
                                    return <img
                                        key={p.mediaId}
                                        src={p.image}
                                        alt=""
                                        className="absolute top-2 left-1/2 w-32 aspect-[2/3] object-cover rounded-xl ring-1 ring-white/20 shadow-2xl"
                                        style={{ transform: `translateX(calc(-50% + ${k * 34}px)) rotate(${k * 8}deg)`, zIndex: i }}
                                    />
                                })}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="relative size-36 rounded-[2rem] bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 ring-1 ring-white/10 flex items-center justify-center"
                            >
                                <LuSparkles className="text-5xl text-indigo-200" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Middle: what is happening. */}
                <div className="min-w-0 space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200/80">
                            <LuSparkles /> Anime En Masse
                        </span>
                        <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5", stateStyle[state].className)}>
                            <span className="relative flex size-1.5">
                                {(state === "running" || state === "waiting" || state === "offline") &&
                                    <span className={cn("absolute inline-flex size-full rounded-full opacity-75 animate-ping", stateStyle[state].dot)} />}
                                <span className={cn("relative inline-flex size-1.5 rounded-full", stateStyle[state].dot)} />
                            </span>
                            {stateStyle[state].label}
                        </span>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={heading}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.35 }}
                            className="space-y-2"
                        >
                            {active && status?.currentAnimeId && status.currentAnimeId > 0 ? (
                                <SeaLink
                                    href={`/entry?id=${status.currentAnimeId}`}
                                    className="block text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight leading-[1.1] line-clamp-2 hover:text-indigo-100 transition-colors"
                                >
                                    {heading}
                                </SeaLink>
                            ) : (
                                <h1 className={cn("text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight leading-[1.1] line-clamp-2",
                                    !active && "bg-gradient-to-r from-white via-indigo-100 to-fuchsia-200 bg-clip-text text-transparent")}>
                                    {heading}
                                </h1>
                            )}
                            <p className="text-gray-300/90 max-w-2xl text-sm sm:text-base">
                                {state === "offline"
                                    ? "The server can't reach the internet. The run is holding its place and carries on by itself as soon as the connection is back; nothing is marked as not found meanwhile."
                                    : active
                                    ? [
                                        `#${formatNumber(d?.currentAnimeIndex || status?.processedCount || 0)}`,
                                        d?.expectedEpisodes ? `${d.expectedEpisodes} episodes` : "",
                                        d?.step || "",
                                    ].filter(Boolean).join("  ·  ")
                                    : state === "waiting"
                                        ? `${formatNumber(status?.ready?.length ?? 0)} series are lined up and ${formatNumber(status?.downloadQueueWaiting ?? 0)} episodes are waiting to download. Lined-up series are queued in order as soon as fewer than 10 series are waiting.`
                                        : "Finds every series your library is missing on Kickassanime, with AniZone, AnimeHeaven, AnimeGG and AnimePahe as the backups, queues it whole, and files each episode already matched: best quality, Japanese audio first, soft subtitles."}
                            </p>
                        </motion.div>
                    </AnimatePresence>

                    {active && state !== "offline" && <Pipeline status={status} />}

                    {!!startError && <div
                        className="flex gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200 max-w-2xl"
                        data-enmasse-start-error
                    >
                        <LuTriangleAlert className="flex-none mt-0.5 text-red-300" />
                        <span>{startError}</span>
                    </div>}
                    {!!d?.lastError && status?.isRunning && <p className="text-xs text-amber-300/90 flex gap-1.5 max-w-2xl">
                        <LuTriangleAlert className="flex-none mt-0.5" />{d.lastError}
                    </p>}
                </div>

                {/* Right: the progress ring and the controls. */}
                <Controls status={status} pct={progress.pct} torrentPass={progress.torrentPass} />
            </div>

            <MetricsStrip status={status} progress={progress} />
        </section>
    )
}

function Pipeline({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const d = status?.details
    const step = pipelineIndex(d?.phase)
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap">
                {PIPELINE.map((p, i) => {
                    const s = step < 0 ? "todo" : i < step ? "done" : i === step ? "now" : "todo"
                    return (
                        <React.Fragment key={p.key}>
                            {i > 0 && <span className={cn("h-px w-5 sm:w-8", i <= step ? "bg-emerald-400/60" : "bg-white/15")} />}
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all",
                                s === "done" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
                                s === "now" && "border-white/30 bg-white text-gray-950 shadow-lg shadow-fuchsia-500/30",
                                s === "todo" && "border-white/10 bg-white/[0.03] text-gray-400")}
                            >
                                {s === "done" ? <LuCheck /> : <p.icon className={cn(s === "now" && "animate-pulse")} />}
                                {p.label}
                            </span>
                        </React.Fragment>
                    )
                })}
            </div>
            {!!d?.variantsTotal && <div className="flex items-center gap-2 text-xs min-w-0 max-w-2xl">
                <span className="text-gray-400 flex-none">Spelling {d.variantIndex}/{d.variantsTotal}</span>
                <span className="truncate rounded-lg bg-black/40 border border-white/10 px-2 py-1 font-mono text-gray-200">{d.currentQuery || "—"}</span>
                {!!d.torrentsCollected && <span className="text-gray-400 flex-none">{formatNumber(d.torrentsCollected)} close</span>}
            </div>}
            {!!d?.selectedTorrent && <p className="text-xs text-emerald-300 flex items-center gap-1.5 min-w-0 max-w-2xl">
                <LuCircleCheck className="flex-none" /> <span className="truncate">Matched to {d.selectedTorrent}</span>
            </p>}
        </div>
    )
}

function Controls({ status, pct, torrentPass }: { status: EnMasseDownloaderStatus | undefined, pct: number, torrentPass: boolean }) {
    const { mutate: start, isPending: isStarting } = useEnMasseStart()
    const { mutate: stop, isPending: isStopping } = useEnMasseStop()
    const openDownloadQueue = useSetAtom(__anime_streamDownloadsModalIsOpenAtom)
    const [resume, setResume] = useState(true)
    // Stop throws the run's progress away; Pause is the one that keeps it. Asked first.
    const confirmStop = useConfirmationDialog({
        title: "Stop and reset progress?",
        description: "Stopping resets the en masse downloader: the next start begins again at the first series in the database, and the list of what it has queued, not found and skipped is cleared. Episodes already in the download queue keep downloading. To keep your place, use Pause instead.",
        actionText: "Stop and reset",
        actionIntent: "alert",
        onConfirm: () => stop({ saveProgress: false }),
    })
    const hasProgress = !!status?.hasSavedProgress || !!status?.isPaused
    const running = !!status?.isRunning

    const r = 70
    const circumference = 2 * Math.PI * r

    return (
        <div className="flex flex-col items-center gap-4 lg:pl-4">
            <ConfirmationDialog {...confirmStop} />
            <div className="relative size-44">
                {running && <div className="absolute inset-4 rounded-full bg-fuchsia-500/20 blur-2xl animate-pulse" />}
                <svg viewBox="0 0 160 160" className="relative size-full -rotate-90">
                    <defs>
                        <linearGradient id="enmasse-ring" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#818cf8" />
                            <stop offset="55%" stopColor="#d946ef" />
                            <stop offset="100%" stopColor="#f472b6" />
                        </linearGradient>
                    </defs>
                    <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
                    <circle cx="80" cy="80" r={r - 12} fill="rgba(3,7,18,0.55)" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                    <motion.circle
                        cx="80" cy="80" r={r} fill="none" stroke="url(#enmasse-ring)" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={false}
                        animate={{ strokeDashoffset: circumference * (1 - Math.max(pct, 0.5) / 100) }}
                        transition={{ duration: 1, ease: "easeOut" }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center" data-enmasse-progress>
                    <p className="text-4xl font-bold tabular-nums leading-none tracking-tight">
                        {pct.toFixed(pct < 10 ? 1 : 0)}<span className="text-lg text-gray-400">%</span>
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 mt-1.5">{torrentPass ? "of the torrents" : "of the database"}</p>
                </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 w-full min-w-[13rem]">
                {running ? (
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            intent="warning"
                            className="rounded-xl"
                            leftIcon={<LuPause />}
                            onClick={() => stop({ saveProgress: true })}
                            loading={isStopping}
                        >
                            Pause
                        </Button>
                        <Button
                            intent="alert-subtle"
                            className="rounded-xl"
                            leftIcon={<LuSquare />}
                            onClick={() => confirmStop.open()}
                            loading={isStopping}
                        >
                            Stop
                        </Button>
                    </div>
                ) : (
                    <Button
                        intent="white"
                        size="lg"
                        className="rounded-xl font-semibold shadow-xl shadow-indigo-500/25"
                        leftIcon={resume && hasProgress ? <LuRefreshCw className="text-lg" /> : <LuPlay className="text-lg" />}
                        onClick={() => start({ resume: resume && hasProgress })}
                        loading={isStarting}
                    >
                        {isStarting ? "Starting…" : resume && hasProgress ? "Resume" : hasProgress ? "Start over" : "Start"}
                    </Button>
                )}
                <Button
                    intent="gray-subtle"
                    className="rounded-xl"
                    leftIcon={<LuMonitorDown />}
                    onClick={() => openDownloadQueue(true)}
                >
                    Download queue
                    {!!status?.downloadQueueWaiting && <span className="ml-1.5 text-xs rounded-full bg-white/15 px-1.5 tabular-nums">
                        {formatNumber(status.downloadQueueWaiting)}
                    </span>}
                </Button>
                {!running && hasProgress && <div className="flex justify-center pt-1">
                    <Switch value={resume} onValueChange={setResume} label="Continue where it left off" size="sm" />
                </div>}
            </div>
        </div>
    )
}

function MetricsStrip({ status, progress }: { status: EnMasseDownloaderStatus | undefined, progress: ReturnType<typeof useRunProgress> }) {
    const items = [
        {
            icon: <LuListVideo />,
            label: progress.torrentPass ? "Torrent series checked" : "Series checked",
            value: <><AnimatedNumber value={progress.done} /><span className="text-gray-500 font-normal text-sm"> / {formatNumber(progress.total)}</span></>,
        },
        { icon: <LuClock />, label: "Running for", value: progress.elapsed ? formatDuration(progress.elapsed) : "—" },
        {
            icon: <LuGauge />,
            label: "Pace",
            value: progress.perHour ? <>{progress.perHour.toFixed(progress.perHour < 10 ? 1 : 0)}<span className="text-gray-500 font-normal text-sm"> / hour</span></> : "—",
        },
        { icon: <LuHourglass />, label: "Time left", value: progress.remaining ? formatDuration(progress.remaining) : "—" },
        { icon: <LuDownload />, label: "Waiting to download", value: <AnimatedNumber value={status?.downloadQueueWaiting ?? 0} /> },
    ]
    return (
        <div className="relative border-t border-white/[0.08] bg-black/30 backdrop-blur-md">
            <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-pink-400 shadow-[0_0_12px_rgba(217,70,239,0.8)]"
                    initial={false}
                    animate={{ width: `${progress.pct}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-white/[0.06] lg:divide-x">
                {items.map(it => (
                    <div key={it.label} className="px-6 py-4 sm:px-8">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400 flex items-center gap-1.5">{it.icon}{it.label}</p>
                        <p className="text-xl font-semibold tabular-nums mt-1">{it.value}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Just queued
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function JustQueued({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const posters = useRecentPosters(status, 18)
    if (!posters.length) return null

    return (
        <div className={cn(panel, "p-5 sm:p-6 space-y-4")} data-enmasse-posters>
            <div className="flex items-center gap-2">
                <span className="size-8 rounded-xl bg-fuchsia-500/15 text-fuchsia-300 flex items-center justify-center"><LuZap /></span>
                <div className="flex-1">
                    <h3 className="font-semibold leading-tight">Just queued</h3>
                    <p className="text-xs text-gray-400">The latest series headed for your library</p>
                </div>
            </div>
            <div className="-mx-5 sm:-mx-6 px-5 sm:px-6 flex gap-3 overflow-x-auto pb-2 snap-x [scrollbar-width:thin]">
                <AnimatePresence initial={false}>
                    {posters.map(p => (
                        <motion.div
                            key={p.mediaId}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.4 }}
                            className="flex-none w-28 sm:w-32 snap-start"
                        >
                            <SeaLink href={`/entry?id=${p.mediaId}`} className="group block space-y-2" title={p.title}>
                                <div className="relative aspect-[2/3] overflow-hidden rounded-xl ring-1 ring-white/10 shadow-lg">
                                    <img
                                        src={p.image}
                                        alt=""
                                        loading="lazy"
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                                    {!!p.episodes && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 backdrop-blur px-1.5 py-0.5 text-[10px] font-semibold">
                                        {p.episodes} ep
                                    </span>}
                                    {(p.provider === "anizone" || p.provider === "animeheaven" || p.provider === "animegg") && <span className="absolute top-1.5 right-1.5 rounded-md bg-sky-500/80 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                                        Backup
                                    </span>}
                                </div>
                                <p className="text-xs font-medium leading-snug line-clamp-2 text-gray-200 group-hover:text-white">{p.title}</p>
                            </SeaLink>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Activity
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type FeedTab = "all" | "ready" | "queued" | "torrent" | "skipped" | "not_found"

const resultStyle: Record<AnimeEnMasseActivity["result"], { label: string, className: string, rail: string, dot: string, icon: React.ElementType }> = {
    queued: { label: "Queued", className: "text-gray-200 bg-white/[0.04] ring-white/[0.08] [&>svg]:text-emerald-400", rail: "bg-emerald-400", dot: "bg-emerald-400", icon: LuCircleCheck },
    torrent: { label: "Torrent", className: "text-gray-200 bg-white/[0.04] ring-white/[0.08] [&>svg]:text-fuchsia-400", rail: "bg-fuchsia-400", dot: "bg-fuchsia-400", icon: LuDownload },
    not_found: { label: "Not found", className: "text-gray-300 bg-white/[0.04] ring-white/[0.08] [&>svg]:text-amber-400/80", rail: "bg-amber-400", dot: "bg-amber-400", icon: LuSearchX },
    skipped: { label: "Skipped", className: "text-gray-400 bg-white/[0.03] ring-white/[0.06]", rail: "bg-slate-500", dot: "bg-slate-400", icon: LuSkipForward },
}

/** The columns: every source, in the order they are tried. */
const SOURCE_COLUMNS = [
    { id: "kickassanime", label: "Kickass" },
    { id: "anizone", label: "AniZone" },
    { id: "animeheaven", label: "Heaven" },
    { id: "animegg", label: "AnimeGG" },
    { id: "animepahe", label: "Pahe" },
    { id: "torrent", label: "Torrent" },
] as const

/** The grid every row and the header share: series, result, then one column per source. */
const ACTIVITY_GRID = "xl:grid xl:grid-cols-[minmax(0,1fr)_7.25rem_repeat(6,4.85rem)] xl:items-center xl:gap-x-1.5"

type CellTone = "ok" | "sent" | "amber" | "orange" | "rose" | "violet" | "gray"

// Mostly neutral: what was queued or sent stands out, the misses stay quiet.
const cellTone: Record<CellTone, string> = {
    ok: "text-emerald-300 bg-emerald-400/[0.07] ring-emerald-400/20",
    sent: "text-fuchsia-300 bg-fuchsia-400/[0.07] ring-fuchsia-400/20",
    amber: "text-gray-300 bg-white/[0.035] ring-white/[0.06]",
    orange: "text-gray-300 bg-white/[0.035] ring-white/[0.06]",
    rose: "text-gray-300 bg-white/[0.035] ring-white/[0.06]",
    violet: "text-gray-300 bg-white/[0.035] ring-white/[0.06]",
    gray: "text-gray-500 bg-transparent ring-white/[0.05]",
}

/** A provider's reason as a cell: a short word or two and a colour. */
function reasonCell(reason: string): { text: string, tone: CellTone } {
    const counts = reason.match(/\((\d+) vs (\d+)\)/)
    if (reason.startsWith("Episode count mismatch")) return { text: counts ? `${counts[1]} vs ${counts[2]}` : "Count off", tone: "orange" }
    if (reason.startsWith("Not found")) return { text: "Not found", tone: "gray" }
    switch (reason) {
        case "No episodes":
            return { text: "No episodes", tone: "amber" }
        case "No episode list":
            return { text: "No list", tone: "amber" }
        case "Episode list doesn't fit":
            return { text: "Doesn't fit", tone: "orange" }
        case "Video source null":
            return { text: "No video", tone: "rose" }
        case "Couldn't queue":
            return { text: "Failed", tone: "rose" }
        case "Search failed":
            return { text: "Error", tone: "rose" }
        case "Refused (Cloudflare)":
            return { text: "Refused", tone: "violet" }
        case "No torrent":
            return { text: "None", tone: "gray" }
        case "No title to search":
            return { text: "No title", tone: "gray" }
    }
    return { text: reason, tone: "gray" }
}

/** What each source did for a result: a cell per source (undefined: not tried). */
function sourceCells(e: AnimeEnMasseActivity): Record<string, { text: string, tone: CellTone, title?: string } | undefined> {
    const cells: Record<string, { text: string, tone: CellTone, title?: string } | undefined> = {}
    for (const r of e.reasons ?? []) {
        if (!r.provider) continue
        const c = reasonCell(r.reason)
        cells[r.provider] = { ...c, title: r.detail || r.reason }
    }
    if (e.result === "queued" && e.provider) {
        cells[e.provider] = { text: e.episodes ? `${e.episodes} eps` : "Queued", tone: "ok", title: `Queued ${e.episodes ?? ""} episodes from ${providerName(e.provider)}` }
    }
    if (e.result === "torrent") {
        // A best guess (not SeaDex) is not matched automatically: it waits in unmatched.
        const guess = !!e.reason && e.reason !== "Torrent (SeaDex)"
        cells["torrent"] = { text: guess ? "Guess" : "Sent", tone: "sent", title: `${e.reason ?? "Torrent"}: ${e.detail ?? ""}${guess ? " (not matched automatically)" : ""}` }
    }
    return cells
}

/** Results come a page at a time; a page is this many. */
const RESULTS_PAGE = 100

/**
 * Every series' result in the run, newest first, loaded a page at a time as the list scrolls.
 * When a new result arrives everything shifts down one, so the pages are fetched again.
 */
function useResultPages(filter: string, search: string, total: number) {
    const [pages, setPages] = useState<Map<number, AnimeEnMasseActivity[]>>(new Map())
    const [count, setCount] = useState(0)
    const loading = React.useRef(new Set<number>())
    const generation = React.useRef(0)
    // The filter and search a request is for are read when it is made, never from an older
    // render: a refresh triggered right after switching tabs once fetched the previous tab's
    // pages into this one (All showing only the 18 of the tab before).
    const query = React.useRef({ filter, search })
    query.current = { filter, search }

    const load = React.useCallback(async (page: number, gen: number) => {
        if (loading.current.has(page)) return
        loading.current.add(page)
        const { filter, search } = query.current
        try {
            const res = await buildSeaQuery<{ total: number, items: AnimeEnMasseActivity[] }>({
                endpoint: "/api/v1/enmasse/results",
                method: "GET",
                params: { offset: page * RESULTS_PAGE, limit: RESULTS_PAGE, filter, search },
            })
            if (gen !== generation.current || !res) return
            setCount(res.total)
            setPages(prev => new Map(prev).set(page, res.items ?? []))
        }
        catch {
        }
        finally {
            loading.current.delete(page)
        }
    }, [])

    // A new filter or search: start over from the first page (the count too).
    const lastQuery = React.useRef<string | null>(null)
    const pagesRef = React.useRef(pages)
    pagesRef.current = pages
    useEffect(() => {
        const key = `${filter}\u0000${search}`
        generation.current++
        loading.current.clear()
        const gen = generation.current
        if (lastQuery.current !== key) {
            // Another tab or search: everything goes, so nothing of the old list shows.
            lastQuery.current = key
            setPages(new Map())
            setCount(0)
            const t = setTimeout(() => load(0, gen), search ? 300 : 0)
            return () => clearTimeout(t)
        }
        // The same list with a new result: the pages already shown are fetched again, kept on
        // screen until they arrive.
        const shown = [...pagesRef.current.keys()]
        for (const p of shown.length ? shown : [0]) load(p, gen)
    }, [filter, search, total, load])

    const ensure = React.useCallback((start: number, end: number) => {
        for (let p = Math.floor(start / RESULTS_PAGE); p <= Math.floor(end / RESULTS_PAGE); p++) {
            if (!pagesRef.current.has(p)) load(p, generation.current)
        }
    }, [load])

    const at = (i: number) => pages.get(Math.floor(i / RESULTS_PAGE))?.[i % RESULTS_PAGE]
    return { count, at, ensure, loaded: pages.has(0) }
}

function ActivityFeed({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const [tab, setTab] = useState<FeedTab>("all")
    const [search, setSearch] = useState("")
    const now = useNow(10000)
    const counts = { torrent: 0, ...(status?.results ?? { total: 0, queued: 0, skipped: 0, notFound: 0 }) }
    const ready = status?.ready ?? []

    const tabs: [FeedTab, string, number, string][] = [
        ["all", "All", counts.total, "bg-white"],
        ["ready", "Lined up", ready.length, "bg-sky-400"],
        ["queued", "Queued", counts.queued, "bg-emerald-400"],
        ["torrent", "Torrented", counts.torrent ?? 0, "bg-fuchsia-400"],
        ["not_found", "Not found", counts.notFound, "bg-amber-400"],
        ["skipped", "Skipped", counts.skipped, "bg-slate-400"],
    ]
    const tabTotal = tab === "all" ? counts.total : tab === "queued" ? counts.queued : tab === "torrent" ? (counts.torrent ?? 0)
        : tab === "skipped" ? counts.skipped : counts.notFound
    const results = useResultPages(tab === "ready" ? "all" : tab, search, tabTotal)

    return (
        <div className={cn(panel, "overflow-hidden flex flex-col flex-1 min-h-[34rem]")} data-enmasse-activity>
            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 pb-4 space-y-4">
                <div className="flex items-start gap-3 flex-wrap">
                    <span className="size-9 rounded-xl bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/20 ring-1 ring-white/10 text-indigo-200 flex items-center justify-center flex-none">
                        <LuListVideo />
                    </span>
                    <div className="flex-1 min-w-[12rem]">
                        <h3 className="font-semibold leading-tight">Activity</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Every series from the database, and what each source said</p>
                    </div>
                    {tab !== "ready" && <div className="relative w-full sm:w-64">
                        <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search titles"
                            className="w-full h-9 rounded-xl bg-black/30 ring-1 ring-white/[0.08] pl-9 pr-8 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-white/25 transition-shadow"
                        />
                        {!!search && <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 size-6 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center"
                            title="Clear"
                        >
                            <LuX />
                        </button>}
                    </div>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {tabs.map(([key, label, count, dot]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={cn("relative h-8 pl-2.5 pr-3 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-2 ring-1",
                                tab === key ? "text-gray-950 ring-transparent" : "text-gray-300 ring-white/[0.08] hover:ring-white/20 hover:text-white")}
                        >
                            {tab === key && <motion.span
                                layoutId="enmasse-tab"
                                className="absolute inset-0 rounded-full bg-white"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                            />}
                            <span className={cn("relative size-1.5 rounded-full", tab === key && key === "all" ? "bg-gray-950" : dot)} />
                            <span className="relative">{label}</span>
                            <span className={cn("relative tabular-nums", tab === key ? "text-gray-500" : "text-gray-500")}>{formatNumber(count)}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Column heads */}
            {tab !== "ready" && <div className={cn("hidden px-5 sm:px-6 py-2 border-y border-white/[0.06] bg-white/[0.015] text-[10px] uppercase tracking-[0.14em] text-gray-500", ACTIVITY_GRID)}>
                <span>Series</span>
                <span>Result</span>
                {SOURCE_COLUMNS.map(c => <span key={c.id} className="text-center truncate" title={providerName(c.id) || c.label}>{c.label}</span>)}
            </div>}

            <div className={cn("relative flex-1 min-h-[24rem]", tab === "ready" ? "border-t border-white/[0.06]" : "xl:border-t-0 border-t border-white/[0.06]")}>
                {tab === "ready" ? (
                    // Found while the download queue was full: queued in this order as room appears.
                    ready.length ? <Virtuoso
                        style={{ position: "absolute", inset: 0 }}
                        data={ready}
                        computeItemKey={(_i, r) => r.mediaId}
                        itemContent={(i, r) => <ReadyRow entry={r} position={i + 1} />}
                    /> : <EmptyFeed text="Nothing lined up. While 10 series are waiting to download, the series found next line up here." />
                ) : results.count > 0 ? (
                    <Virtuoso
                        style={{ position: "absolute", inset: 0 }}
                        totalCount={results.count}
                        increaseViewportBy={400}
                        rangeChanged={r => results.ensure(r.startIndex, r.endIndex)}
                        itemContent={i => {
                            const e = results.at(i)
                            return e ? <ActivityRow entry={e} now={now} /> : <PlaceholderRow />
                        }}
                    />
                ) : <EmptyFeed text={!results.loaded ? "Loading…"
                    : search ? "Nothing matches that title."
                        : tab === "all" ? "Results appear here as each series is checked."
                            : tab === "queued" ? "Nothing queued yet." : tab === "torrent" ? "Nothing sent to the torrent client yet."
                                : tab === "skipped" ? "Nothing skipped yet." : "Nothing missed yet."} />}
            </div>
        </div>
    )
}

function PlaceholderRow() {
    return (
        <div className={cn("px-5 sm:px-6 py-3 border-b border-white/[0.04] flex gap-3 items-center", ACTIVITY_GRID)}>
            <div className="flex gap-3 items-center min-w-0">
                <div className="w-9 h-12 rounded-lg bg-white/[0.04] flex-none animate-pulse" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/5 rounded bg-white/[0.05]" />
                    <div className="h-2.5 w-1/4 rounded bg-white/[0.04]" />
                </div>
            </div>
        </div>
    )
}

const ReadyRow = React.memo(function ReadyRow({ entry: r, position }: { entry: AnimeEnMasseReady, position: number }) {
    return (
        <div className="group relative px-5 sm:px-6 py-3 border-b border-white/[0.04] flex gap-4 items-center hover:bg-white/[0.025] transition-colors">
            <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full bg-sky-400 opacity-60" />
            <span className="w-7 text-right text-sm font-semibold text-gray-500 tabular-nums flex-none">{position}</span>
            <div className="w-9 h-12 rounded-lg overflow-hidden bg-gray-900 ring-1 ring-white/10 flex-none shadow-md">
                {r.image ? <img src={r.image} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-600"><LuFilm /></div>}
            </div>
            <div className="flex-1 min-w-0">
                <SeaLink href={`/entry?id=${r.mediaId}`} className="text-sm font-medium hover:underline line-clamp-1">{r.title}</SeaLink>
                <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">
                    Found on {providerName(r.provider)}{r.episodes ? ` · ${r.episodes} episodes` : ""}
                </p>
            </div>
            <span className="text-[11px] font-semibold rounded-full ring-1 px-2.5 py-1 inline-flex items-center gap-1.5 text-sky-200 bg-sky-400/10 ring-sky-400/25 flex-none">
                <LuClock /> Lined up
            </span>
        </div>
    )
})

const ActivityRow = React.memo(function ActivityRow({ entry: e, now }: { entry: AnimeEnMasseActivity, now: number }) {
    const style = resultStyle[e.result] ?? resultStyle.skipped
    const cells = sourceCells(e)
    const anyCell = SOURCE_COLUMNS.some(c => cells[c.id])
    const badgeText = e.result === "queued" ? "Queued" : e.result === "torrent" ? "Torrent" : (e.reason || style.label)
    // Rows newer than a few seconds slide in; older ones (scrolled back to) just appear.
    const fresh = now - new Date(e.time).getTime() < 15000
    return (
        <motion.div
            initial={fresh ? { opacity: 0, y: -6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className={cn("group relative px-5 sm:px-6 py-2.5 border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors", ACTIVITY_GRID)}
        >
            <span className={cn("absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r-full opacity-40", style.rail)} />

            {/* Series */}
            <div className="flex gap-3 items-center min-w-0">
                <div className="w-9 h-12 rounded-lg overflow-hidden bg-gray-900 ring-1 ring-white/10 flex-none shadow-md">
                    {e.image ? <img src={e.image} alt="" loading="lazy" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-gray-600"><LuFilm /></div>}
                </div>
                <div className="min-w-0 flex-1">
                    {e.mediaId && e.mediaId > 0
                        ? <SeaLink href={`/entry?id=${e.mediaId}`} className="text-sm font-medium hover:underline line-clamp-1" title={e.title}>{e.title}</SeaLink>
                        : <p className="text-sm font-medium line-clamp-1" title={e.title}>{e.title}</p>}
                    <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5 tabular-nums" title={e.detail}>
                        {timeAgo(e.time, now)}
                        {e.result === "torrent" && !!e.detail && <> · <span className="text-gray-400">{e.detail}</span></>}
                    </p>
                    {/* Narrow screens: the sources as chips. */}
                    {anyCell && <div className="xl:hidden flex flex-wrap gap-1 mt-1.5">
                        {SOURCE_COLUMNS.filter(c => cells[c.id]).map(c => {
                            const cell = cells[c.id]!
                            return <span key={c.id} title={cell.title} className={cn("text-[10px] rounded-md ring-1 px-1.5 py-0.5", cellTone[cell.tone])}>
                                <span className="opacity-60">{c.label} · </span>{cell.text}
                            </span>
                        })}
                    </div>}
                    {/* Narrow screens: the result. */}
                    <span className={cn("xl:hidden mt-1.5 text-[11px] font-semibold rounded-full ring-1 px-2 py-0.5 inline-flex items-center gap-1", style.className)}>
                        <style.icon /> {badgeText}
                    </span>
                </div>
            </div>

            {/* Result */}
            <div className="hidden xl:block min-w-0">
                <span
                    title={e.detail}
                    className={cn("max-w-full text-[11px] font-semibold rounded-full ring-1 px-2 py-1 inline-flex items-center gap-1.5", style.className)}
                >
                    <style.icon className="flex-none" /> <span className="truncate">{badgeText}</span>
                </span>
            </div>

            {/* One cell per source */}
            {e.result === "skipped" ? (
                <div className="hidden xl:flex col-span-6 items-center gap-2 text-[11px] text-gray-500 pl-1">
                    <span className="h-px flex-1 bg-white/[0.06]" />
                    <span className="truncate" title={e.detail}>not searched: {(e.reason || "skipped").toLowerCase()}</span>
                    <span className="h-px flex-1 bg-white/[0.06]" />
                </div>
            ) : SOURCE_COLUMNS.map(c => {
                const cell = cells[c.id]
                return (
                    <div key={c.id} className="hidden xl:flex justify-center min-w-0">
                        {cell
                            ? <span title={cell.title} className={cn("max-w-full truncate text-[11px] font-medium rounded-lg ring-1 px-1.5 py-1 text-center w-full", cellTone[cell.tone])}>
                                {cell.text}
                            </span>
                            : <span className="text-gray-700 text-xs" title="Not tried">—</span>}
                    </div>
                )
            })}
        </motion.div>
    )
})

function EmptyFeed({ text }: { text: string }) {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400 text-sm px-6 text-center">
            <span className="size-14 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] ring-1 ring-white/[0.08] flex items-center justify-center text-2xl text-gray-500">
                <LuListVideo />
            </span>
            {text}
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Downloading now
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/** The episode the online download queue is fetching, next to the search that feeds it. */
function DownloadingNow() {
    const { data } = useGetOnlinestreamDownloads()
    const openDownloadQueue = useSetAtom(__anime_streamDownloadsModalIsOpenAtom)
    const running = data?.running && isOnlinestreamDownloadRunning(data.running) ? data.running : undefined
    const pct = Math.round((running?.progress ?? 0) * 100)
    const counts = data?.counts

    return (
        <button
            type="button"
            onClick={() => openDownloadQueue(true)}
            className={cn(panel, "group relative w-full overflow-hidden p-5 sm:p-6 text-left transition-all hover:border-white/15 hover:-translate-y-0.5")}
            data-enmasse-downloading
        >
            {!!running?.image && <div
                className="absolute inset-0 bg-cover bg-center opacity-25 blur-2xl scale-125 saturate-150"
                style={{ backgroundImage: `url(${running.image})` }}
            />}
            <div className="absolute inset-0 bg-gradient-to-b from-gray-950/40 to-gray-950/90" />
            <div className="relative space-y-4">
                <div className="flex items-center gap-2">
                    <span className="relative flex size-2">
                        {running && <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
                        <span className={cn("relative inline-flex size-2 rounded-full", running ? "bg-emerald-400" : "bg-gray-600")} />
                    </span>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 flex-1">Downloading now</p>
                    <LuArrowUpRight className="text-gray-500 group-hover:text-white transition-colors" />
                </div>
                {running ? (
                    <div className="flex gap-4">
                        {!!running.image && <img src={running.image} alt="" className="w-14 h-20 rounded-lg object-cover ring-1 ring-white/15 shadow-lg flex-none" />}
                        <div className="min-w-0 flex-1 space-y-2">
                            <p className="font-semibold leading-snug line-clamp-2">{running.title}</p>
                            <p className="text-xs text-gray-300">
                                Episode {running.episodeNumber}
                                {running.status === "downloading" ? ` · ${pct}%` : running.status === "muxing" ? " · building the MKV" : ""}
                                {running.speed > 0 && running.status === "downloading" ? ` · ${formatDownloadBytes(running.speed)}/s` : ""}
                            </p>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <motion.div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                                    initial={false}
                                    animate={{ width: `${running.status === "downloading" ? pct : 100}%` }}
                                    transition={{ duration: 0.6 }}
                                    style={{ opacity: running.status === "downloading" ? 1 : 0.4 }}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-400">
                        {counts?.queued ? `${formatNumber(counts.queued)} episodes waiting` : "Nothing downloading right now."}
                    </p>
                )}
                {!!counts && <div className="grid grid-cols-3 gap-2 text-center">
                    {([
                        ["Waiting", counts.queued, "text-sky-300"],
                        ["Done", counts.completed, "text-emerald-300"],
                        ["Failed", counts.failed, counts.failed ? "text-amber-300" : "text-gray-500"],
                    ] as [string, number, string][]).map(([label, value, tone]) => (
                        <div key={label} className="rounded-xl bg-white/[0.04] ring-1 ring-white/[0.05] py-2">
                            <AnimatedNumber value={value} className={cn("text-lg font-bold tabular-nums", tone)} />
                            <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
                        </div>
                    ))}
                </div>}
            </div>
        </button>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Totals
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function Totals({ status }: { status: EnMasseDownloaderStatus | undefined }) {
    const d = status?.details
    // Counted from every result of the run (the old title lists only kept the last few hundred).
    const queued = status?.results?.queued ?? status?.downloadedAnime?.length ?? 0
    const missing = status?.results?.notFound ?? status?.failedAnime?.length ?? 0
    const skipped = status?.results?.skipped ?? d?.skippedCount ?? 0
    const torrented = status?.results?.torrent ?? 0
    const outcomes = queued + torrented + missing + skipped
    const rows = [
        { label: "Series queued", value: queued, icon: LuCircleCheck, tone: "text-emerald-300", bar: "bg-emerald-400", share: queued },
        { label: "Sent as torrents", value: torrented, icon: LuDownload, tone: "text-fuchsia-300", bar: "bg-fuchsia-400", share: torrented },
        { label: "Not found anywhere", value: missing, icon: LuSearchX, tone: "text-amber-300", bar: "bg-amber-400", share: missing },
        { label: "Skipped", value: skipped, icon: LuSkipForward, tone: "text-slate-300", bar: "bg-slate-400", share: skipped },
    ]

    return (
        <div className={cn(panel, "p-5 sm:p-6 space-y-5")} data-enmasse-stats>
            <div className="flex items-end justify-between gap-3">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">Episodes queued</p>
                    <AnimatedNumber
                        value={d?.episodesQueued ?? 0}
                        className="text-4xl font-bold tabular-nums tracking-tight bg-gradient-to-r from-indigo-200 via-fuchsia-200 to-pink-200 bg-clip-text text-transparent"
                    />
                </div>
                <span className="size-10 rounded-2xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center text-lg"><LuListVideo /></span>
            </div>

            {/* The outcome of every series checked, as one bar. */}
            <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.06]">
                {outcomes > 0 && rows.map(r => r.share > 0 && <motion.div
                    key={r.label}
                    className={cn("h-full", r.bar)}
                    initial={false}
                    animate={{ width: `${(r.share / outcomes) * 100}%` }}
                    transition={{ duration: 0.8 }}
                />)}
            </div>

            <div className="space-y-1">
                {rows.map(r => (
                    <div key={r.label} className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-white/[0.03] transition-colors">
                        <span className={cn("size-8 rounded-xl bg-white/[0.04] flex items-center justify-center flex-none", r.tone)}><r.icon /></span>
                        <span className="flex-1 text-sm text-gray-300">{r.label}</span>
                        <span className="text-xs text-gray-500 tabular-nums">{outcomes ? `${Math.round((r.share / outcomes) * 100)}%` : ""}</span>
                        <AnimatedNumber value={r.value} className={cn("w-16 text-right font-semibold tabular-nums", r.tone)} />
                    </div>
                ))}
            </div>

            {/* Every reason, counted: every one listed, 0 until it happens. */}
            <ReasonBreakdown title="Queued from" items={status?.results?.queuedFrom} known={QUEUED_FROM} bar="bg-emerald-400" tone="text-emerald-300" />
            <ReasonBreakdown title="Skipped because" items={status?.results?.skippedBy} known={SKIP_REASONS} bar="bg-slate-400" tone="text-slate-300" />
            <ReasonBreakdown title="Not found because" items={status?.results?.notFoundBy} known={NOT_FOUND_REASONS} bar="bg-amber-400" tone="text-amber-300" />
            <ReasonBreakdown title="What each provider said" items={status?.results?.providerMisses} bar="bg-orange-400" tone="text-orange-300" collapsed />
        </div>
    )
}

// Every reason the server can give, so each shows (with 0) before it has happened.
const QUEUED_FROM = ["Kickassanime", "AniZone", "AnimeHeaven", "AnimeGG", "AnimePahe", "Torrent (SeaDex)", "Torrent (AnimeTosho guess)", "Torrent (Nyaa guess)", "Torrent (NekoBT guess)",
    "Torrent (Tokyo Toshokan guess)", "Torrent (ACG.RIP guess)", "Torrent (Shana Project guess)", "Torrent (SubsPlease guess)"]
const SKIP_REASONS = ["In library", "Already downloading", "Already lined up", "Not aired yet", "Adult", "No AniList entry", "Nothing to download"]
const NOT_FOUND_REASONS = [
    "Video source null", "No episode list", "No episodes", "Episode count mismatch", "Episode list doesn't fit", "Couldn't queue",
    "Refused (Cloudflare)", "Search failed", "Not found", "Not on any provider", "No torrent", "No title to search",
    "AniList lookup failed", "No internet",
]

/** One group of reasons with their counts, largest first, each with a bar against the largest. */
function ReasonBreakdown({ title, items, known, bar, tone, collapsed }: {
    title: string
    items: AnimeEnMasseReasonCount[] | undefined
    known?: string[]
    bar: string
    tone: string
    collapsed?: boolean
}) {
    const [open, setOpen] = useState(!collapsed)
    const list = React.useMemo(() => {
        const counted = [...(items ?? [])]
        for (const reason of known ?? []) {
            if (!counted.some(r => r.reason === reason)) counted.push({ reason, count: 0 })
        }
        return counted
    }, [items, known])
    const total = list.reduce((a, r) => a + r.count, 0)
    const max = Math.max(1, ...list.map(r => r.count))
    return (
        <div className="space-y-2 pt-4 border-t border-white/[0.06]" data-enmasse-breakdown>
            <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-left">
                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 flex-1">{title}</p>
                <span className="text-xs text-gray-500 tabular-nums">{formatNumber(total)}</span>
                <LuChevronDown className={cn("text-gray-500 transition-transform", !open && "-rotate-90")} />
            </button>
            {open && !list.length && <p className="text-xs text-gray-500">Nothing yet.</p>}
            {open && <div className="space-y-1.5">
                {list.map(r => (
                    <div key={r.reason} className={cn("space-y-1", r.count === 0 && "opacity-45")}>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="flex-1 min-w-0 truncate text-gray-300" title={r.reason}>{r.reason}</span>
                            <span className="text-xs text-gray-500 tabular-nums">{total ? `${Math.round((r.count / total) * 100)}%` : ""}</span>
                            <span className={cn("w-12 text-right font-semibold tabular-nums", r.count ? tone : "text-gray-500")}>{formatNumber(r.count)}</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                            <motion.div
                                className={cn("h-full rounded-full opacity-70", bar)}
                                initial={false}
                                animate={{ width: `${(r.count / max) * 100}%` }}
                                transition={{ duration: 0.6 }}
                            />
                        </div>
                    </div>
                ))}
            </div>}
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// How it works
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const HOW_IT_WORKS = [
    {
        title: "Database order, torrents included",
        text: "The run goes through the anime database in its own order, from its first entry. A series you are downloading as a torrent is handled when the database reaches it: if Kickassanime has it, its torrent is paused and the series downloads online; once the episodes are in your library the torrent and its files are removed, and if the online download fails the torrent resumes. The backups (AniZone, AnimeHeaven, AnimeGG, then AnimePahe) only replace a torrent that has been stalled for 15 minutes or more. Torrent series the database doesn't list are checked at the end.",
    },
    {
        title: "Skip what you have",
        text: "Series already in your library or already downloading are skipped, along with adult entries, series that haven't aired, and anything without an AniList entry.",
    },
    {
        title: "Search every spelling",
        text: "Kickassanime is searched under the English and romaji titles, every synonym, and other spellings: season wording, punctuation, accents, '&' and 'and', and the franchise name. If it doesn't have the series, AniZone, AnimeHeaven, AnimeGG and then AnimePahe are searched the same way as backups. If none of them has it, a torrent is picked the way Enqueue Future's auto torrent does (SeaDex first) and sent to the torrent client: it lands in unmatched when it is moved and is matched into your library when it completes. An episode with no source on its provider is fetched from the others in the same order.",
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
        text: "At least 8 seconds between searches and 30 seconds per series, a 15-second pause between episode downloads, and at most 10 series waiting in the download queue. While it is full the search keeps going ahead, more gently (45 seconds a series), and lines up what it finds to be queued in order as room appears. The lined-up list is kept through pauses and restarts. Pause keeps your place, and a run the server restart interrupted picks itself back up.",
    },
]

function HowItWorks() {
    const [open, setOpen] = useState<number | null>(null)
    return (
        <div className={cn(panel, "p-5 sm:p-6 space-y-3")} data-enmasse-how>
            <h3 className="font-semibold">How it works</h3>
            <ol className="space-y-1">
                {HOW_IT_WORKS.map((s, i) => (
                    <li key={s.title}>
                        <button
                            type="button"
                            onClick={() => setOpen(o => o === i ? null : i)}
                            className="w-full flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 text-left hover:bg-white/[0.03] transition-colors"
                        >
                            <span className="size-6 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-[11px] font-bold flex items-center justify-center flex-none">
                                {i + 1}
                            </span>
                            <span className="flex-1 text-sm font-medium">{s.title}</span>
                            <LuChevronDown className={cn("text-gray-500 transition-transform", open === i && "rotate-180")} />
                        </button>
                        <AnimatePresence initial={false}>
                            {open === i && <motion.p
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden pl-9 pr-1 text-sm text-gray-400 leading-relaxed"
                            >
                                <span className="block pb-2">{s.text}</span>
                            </motion.p>}
                        </AnimatePresence>
                    </li>
                ))}
            </ol>
        </div>
    )
}
