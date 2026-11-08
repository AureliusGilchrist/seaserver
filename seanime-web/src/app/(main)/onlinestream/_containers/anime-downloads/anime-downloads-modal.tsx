"use client"
import { AL_BaseAnime } from "@/api/generated/types"
import { useGetAnimeCollection } from "@/api/hooks/anilist.hooks"
import {
    isOnlinestreamDownloadActive,
    isOnlinestreamDownloadRunning,
    OnlinestreamDownload_HistoryEntry,
    OnlinestreamDownload_Item,
    useGetOnlinestreamDownloadHistory,
    useGetOnlinestreamDownloads,
    useOnlinestreamDownloadQueueAction,
    useOnlinestreamDownloadsListener,
} from "@/api/hooks/onlinestream_download.hooks"
import { MediaEntryCard } from "@/app/(main)/_features/media/_components/media-entry-card"
import { SeaLink } from "@/components/shared/sea-link"
import { Button, IconButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { ProgressBar } from "@/components/ui/progress-bar"
import { formatNumber } from "@/lib/helpers/number"
import { atom } from "jotai"
import { useAtom } from "jotai/react"
import React from "react"
import {
    LuArrowUpToLine,
    LuCheck,
    LuChevronDown,
    LuCircleAlert,
    LuClock,
    LuDownload,
    LuFilm,
    LuGauge,
    LuHardDrive,
    LuLoaderCircle,
    LuPause,
    LuPlay,
    LuRotateCcw,
    LuCaptions,
    LuTrash2,
    LuTriangleAlert,
    LuX,
} from "react-icons/lu"
import { MdClear } from "react-icons/md"
import { Virtuoso, VirtuosoGrid } from "react-virtuoso"

export const __anime_streamDownloadsModalIsOpenAtom = atom(false)

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Formatting
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function formatDownloadBytes(n: number) {
    if (!n || n < 0) return "0 MB"
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
    return `${Math.round(n / 1024)} KB`
}

const audioNames: Record<string, string> = {
    jpn: "Japanese", eng: "English", spa: "Spanish", por: "Portuguese", fre: "French", ger: "German", ita: "Italian",
    rus: "Russian", ara: "Arabic", chi: "Chinese", kor: "Korean", hin: "Hindi",
}

/** "Japanese + English audio" */
function formatAudioTracks(tracks: string[]) {
    const names = tracks.map(t => audioNames[t] ?? t.toUpperCase())
    return `${names.join(" + ")} audio`
}

function formatSpeed(bps: number) {
    if (!bps || bps <= 0) return "—"
    return `${formatDownloadBytes(bps)}/s`
}

function formatEta(seconds: number) {
    if (!seconds || seconds <= 0) return "—"
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`
    return `${s}s`
}

const STEPS: { key: OnlinestreamDownload_Item["status"], label: string }[] = [
    { key: "fetching", label: "Source" },
    { key: "downloading", label: "Download" },
    { key: "muxing", label: "MKV" },
    { key: "registering", label: "Library" },
]

const statusText: Record<OnlinestreamDownload_Item["status"], string> = {
    queued: "Waiting",
    fetching: "Fetching the source",
    downloading: "Downloading",
    muxing: "Building the MKV",
    registering: "Adding to the library",
    completed: "In your library",
    failed: "Failed",
    cancelled: "Cancelled",
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Modal
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/** Mounted once in the main layout; opened from the "Anime Downloads" buttons. */
export function AnimeStreamDownloadsModal() {
    const [isOpen, setIsOpen] = useAtom(__anime_streamDownloadsModalIsOpenAtom)

    // The one listener for the queue event: keeps the queue fresh everywhere and toasts once.
    useOnlinestreamDownloadsListener()

    return (
        <Modal
            open={isOpen}
            onOpenChange={setIsOpen}
            contentClass="max-w-6xl"
            title="Anime downloads"
            description="Episodes downloaded through your streaming providers, saved to the library as MKV with soft subtitles."
            data-anime-downloads-modal
        >
            {isOpen && <div className="py-4 space-y-8" data-anime-downloads-modal-content>
                <AnimeDownloadQueue />
                <AnimeDownloadedList />
            </div>}
        </Modal>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Queue
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type QueueFilter = "all" | "waiting" | "failed" | "done"

type QueueGroup = {
    mediaId: number
    title: string
    image?: string
    items: OnlinestreamDownload_Item[]
}

type Row =
    | { kind: "group", group: QueueGroup }
    | { kind: "item", item: OnlinestreamDownload_Item }

export function AnimeDownloadQueue() {
    const { data, isLoading, isError } = useGetOnlinestreamDownloads()
    const { mutate: act, isPending } = useOnlinestreamDownloadQueueAction()
    const [filter, setFilter] = React.useState<QueueFilter>("all")
    const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set())

    const items = data?.items ?? []
    const paused = !!data?.paused
    const running = items.find(isOnlinestreamDownloadRunning)

    const counts = React.useMemo(() => ({
        waiting: items.filter(i => i.status === "queued").length,
        failed: items.filter(i => i.status === "failed").length,
        done: items.filter(i => i.status === "completed").length,
        cancelled: items.filter(i => i.status === "cancelled").length,
    }), [items])

    const filtered = React.useMemo(() => items.filter(i => {
        switch (filter) {
            case "waiting":
                return isOnlinestreamDownloadActive(i)
            case "failed":
                return i.status === "failed" || i.status === "cancelled"
            case "done":
                return i.status === "completed"
            default:
                return true
        }
    }), [items, filter])

    // Grouped by series, in queue order of each series' first episode.
    const rows = React.useMemo<Row[]>(() => {
        const groups = new Map<number, QueueGroup>()
        for (const it of filtered) {
            let g = groups.get(it.mediaId)
            if (!g) {
                g = { mediaId: it.mediaId, title: it.title, image: it.image, items: [] }
                groups.set(it.mediaId, g)
            }
            g.items.push(it)
        }
        const out: Row[] = []
        for (const g of groups.values()) {
            out.push({ kind: "group", group: g })
            if (!collapsed.has(g.mediaId)) {
                for (const it of g.items) out.push({ kind: "item", item: it })
            }
        }
        return out
    }, [filtered, collapsed])

    const toggleGroup = (id: number) => setCollapsed(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    return (
        <div className="space-y-4" data-anime-download-queue-container>
            <div className="flex w-full items-center flex-wrap gap-2" data-anime-download-queue-header>
                <h3>Queue</h3>
                <span
                    className={cn(
                        "text-xs font-semibold px-2.5 py-1 rounded-full border",
                        paused ? "text-[--orange] border-[--orange]/40 bg-[--orange]/10"
                            : running ? "text-[--green] border-[--green]/40 bg-[--green]/10"
                                : "text-[--muted] border-[--border]",
                    )}
                >
                    {paused ? "Stopped" : data?.blocked ? "Waiting for disk" : running ? "Downloading" : counts.waiting ? "Starting" : "Idle"}
                </span>
                <div className="flex flex-1" />
                {!isLoading && !isError && <div className="flex gap-2 items-center flex-wrap" data-anime-download-queue-header-actions>
                    {counts.failed > 0 && <Button
                        intent="warning-outline"
                        size="sm"
                        disabled={isPending}
                        leftIcon={<LuRotateCcw />}
                        onClick={() => act({ action: "reset-errored" })}
                    >
                        Retry failed ({counts.failed})
                    </Button>}
                    {(counts.done + counts.failed + counts.cancelled) > 0 && <Button
                        intent="gray-subtle"
                        size="sm"
                        disabled={isPending}
                        onClick={() => act({ action: "clear-finished" })}
                    >
                        Clear finished
                    </Button>}
                    {!!items.length && <Button
                        intent="alert-subtle"
                        size="sm"
                        disabled={isPending}
                        leftIcon={<MdClear className="text-xl" />}
                        onClick={() => act({ action: "clear-all" })}
                    >
                        Clear all
                    </Button>}
                    {paused ? <Button
                        intent="success"
                        size="sm"
                        disabled={isPending}
                        leftIcon={<LuPlay />}
                        onClick={() => act({ action: "start" })}
                    >
                        Start
                    </Button> : (running || counts.waiting > 0) && <Button
                        intent="alert-subtle"
                        size="sm"
                        disabled={isPending}
                        leftIcon={<LuPause />}
                        onClick={() => act({ action: "stop" })}
                    >
                        Stop
                    </Button>}
                </div>}
            </div>

            {!!data?.blocked && <div className="flex gap-3 rounded-xl border border-[--orange]/50 bg-[--orange]/10 p-4 text-sm" data-anime-download-blocked>
                <LuTriangleAlert className="text-xl text-[--orange] flex-none mt-0.5" />
                <div className="space-y-1">
                    <p className="font-semibold text-[--orange]">Downloads are waiting for the server's disk</p>
                    <p className="text-gray-300">{data.blocked}</p>
                    <p className="text-[--muted]">Nothing is lost: waiting episodes keep their place and start on their own once the disk is usable.</p>
                </div>
            </div>}

            {running && <NowDownloadingCard item={running} paused={paused} />}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-anime-download-queue-stats>
                <StatTile label="Waiting" value={counts.waiting} icon={<LuClock />} />
                <StatTile label="Done" value={counts.done} icon={<LuCheck />} tone="green" />
                <StatTile label="Failed" value={counts.failed} icon={<LuCircleAlert />} tone={counts.failed ? "orange" : undefined} />
                <StatTile label="Series" value={new Set(items.map(i => i.mediaId)).size} icon={<LuFilm />} />
            </div>

            <Card className="p-4 space-y-3" data-anime-download-queue-card>
                <div className="flex gap-1.5 flex-wrap">
                    {([
                        ["all", `All (${items.length})`],
                        ["waiting", `Active (${items.filter(isOnlinestreamDownloadActive).length})`],
                        ["failed", `Failed (${counts.failed + counts.cancelled})`],
                        ["done", `Done (${counts.done})`],
                    ] as [QueueFilter, string][]).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setFilter(key)}
                            className={cn(
                                "px-3 h-8 rounded-full text-sm border transition-colors",
                                filter === key ? "bg-[--brand] border-transparent text-white" : "border-[--border] text-[--muted] hover:text-[--foreground]",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {isLoading ? <LoadingSpinner /> : isError ? (
                    <p className="text-center text-[--muted] text-sm">Could not fetch the download queue</p>
                ) : !rows.length ? (
                    <div className="py-10 text-center space-y-2">
                        <LuDownload className="text-4xl mx-auto text-[--muted]" />
                        <p className="text-[--muted] text-sm">
                            {items.length ? "Nothing matches this filter" : "Nothing in the queue. Use Download in the online player to add episodes or a whole series."}
                        </p>
                    </div>
                ) : (
                    // Virtualized: a few full series in the queue are hundreds of rows.
                    <Virtuoso
                        style={{ height: "min(46vh, 32rem)" }}
                        data={rows}
                        computeItemKey={(_i, row) => row.kind === "group" ? `g-${row.group.mediaId}` : row.item.id}
                        itemContent={(_i, row) => row.kind === "group"
                            ? <QueueGroupHeader
                                group={row.group}
                                allItems={items.filter(i => i.mediaId === row.group.mediaId)}
                                collapsed={collapsed.has(row.group.mediaId)}
                                onToggle={() => toggleGroup(row.group.mediaId)}
                            />
                            : <QueueItemRow item={row.item} />}
                    />
                )}
            </Card>
        </div>
    )
}

function StatTile({ label, value, icon, tone }: { label: string, value: number, icon: React.ReactNode, tone?: "green" | "orange" }) {
    return (
        <div className="rounded-xl border bg-[--paper] px-3 py-2.5 flex items-center gap-3">
            <div
                className={cn("text-xl rounded-lg p-2 bg-gray-800/60",
                    tone === "green" && "text-[--green]", tone === "orange" && "text-[--orange]", !tone && "text-[--muted]")}
            >
                {icon}
            </div>
            <div>
                <p className="text-xl font-bold leading-none">{formatNumber(value)}</p>
                <p className="text-xs text-[--muted] mt-1">{label}</p>
            </div>
        </div>
    )
}

function StepIndicator({ status }: { status: OnlinestreamDownload_Item["status"] }) {
    const current = STEPS.findIndex(s => s.key === status)
    return (
        <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
                <React.Fragment key={s.key}>
                    <div
                        className={cn(
                            "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
                            i < current && "border-[--green]/40 text-[--green]",
                            i === current && "border-[--brand] bg-[--brand]/15 text-white",
                            i > current && "border-[--border] text-[--muted]",
                        )}
                    >
                        {i < current ? <LuCheck /> : i === current ? <span className="size-1.5 rounded-full bg-[--brand] animate-pulse" /> : null}
                        {s.label}
                    </div>
                    {i < STEPS.length - 1 && <div className={cn("h-px w-3", i < current ? "bg-[--green]/50" : "bg-[--border]")} />}
                </React.Fragment>
            ))}
        </div>
    )
}

function NowDownloadingCard({ item, paused }: { item: OnlinestreamDownload_Item, paused: boolean }) {
    const { mutate: act, isPending } = useOnlinestreamDownloadQueueAction()
    const pct = Math.round((item.progress ?? 0) * 100)
    const art = item.banner || item.image

    return (
        <div className="relative overflow-hidden rounded-xl border" data-anime-download-now-card>
            {!!art && <div
                className="absolute inset-0 bg-cover bg-center opacity-25 blur-sm scale-110"
                style={{ backgroundImage: `url(${art})` }}
            />}
            <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/85 to-gray-950/50" />
            <div className="relative flex gap-4 p-4">
                {!!item.image && <img
                    src={item.image}
                    alt=""
                    className="hidden sm:block w-24 h-36 object-cover rounded-lg shadow-lg flex-none"
                />}
                <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs uppercase tracking-wider text-[--brand] font-semibold">
                                {paused ? "Stopping" : "Now downloading"}
                            </p>
                            <SeaLink href={`/entry?id=${item.mediaId}`} className="text-lg font-bold hover:underline line-clamp-1">
                                {item.title}
                            </SeaLink>
                            <p className="text-sm text-gray-300 line-clamp-1">
                                Episode {item.episodeNumber}{item.episodeTitle && !/^episode\s*\d+$/i.test(item.episodeTitle) ? ` — ${item.episodeTitle}` : ""}
                            </p>
                        </div>
                        <IconButton
                            size="sm"
                            intent="alert-subtle"
                            icon={<LuX />}
                            title="Cancel this episode"
                            disabled={isPending}
                            onClick={() => act({ action: "cancel", id: item.id })}
                        />
                    </div>

                    <StepIndicator status={item.status} />

                    <div className="space-y-1">
                        <ProgressBar
                            size="md"
                            value={item.status === "downloading" ? pct : undefined}
                            isIndeterminate={item.status !== "downloading"}
                        />
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300">
                            <span>
                                {statusText[item.status]}
                                {item.status === "downloading" && item.phase ? ` ${item.phase === "English dub" ? "the English dub" : "Japanese"}` : ""}
                                {item.status === "downloading" ? ` · ${pct}%` : ""}
                            </span>
                            {item.segmentsTotal > 0 && <span>{formatNumber(item.segmentsDone)} / {formatNumber(item.segmentsTotal)} segments</span>}
                            <span className="flex items-center gap-1"><LuHardDrive /> {formatDownloadBytes(item.bytes)}</span>
                            {item.status === "downloading" && <span className="flex items-center gap-1"><LuGauge /> {formatSpeed(item.speed)}</span>}
                            {item.status === "downloading" && <span className="flex items-center gap-1"><LuClock /> {formatEta(item.etaSeconds)} left</span>}
                            {item.status !== "fetching" && <span className="flex items-center gap-1"><LuCaptions /> {item.subtitleCount} subtitle track{item.subtitleCount === 1
                                ? ""
                                : "s"}</span>}
                        </div>
                    </div>

                    <p className="text-xs text-[--muted]">
                        {item.provider}{item.server ? ` / ${item.server}` : ""}{item.quality ? ` · ${item.quality}` : ""}
                        {" · "}{item.audioTracks?.length ? formatAudioTracks(item.audioTracks) : "Japanese audio, plus the English dub if available"}
                        {item.attempts > 1 ? ` · attempt ${item.attempts}` : ""}
                    </p>
                    {!!item.warnings?.length && <ul className="text-xs text-[--orange] space-y-0.5">
                        {item.warnings.map((w, i) => <li key={i} className="flex gap-1"><LuTriangleAlert className="flex-none mt-0.5" /> {w}</li>)}
                    </ul>}
                </div>
            </div>
        </div>
    )
}

function QueueGroupHeader({ group, allItems, collapsed, onToggle }: {
    group: QueueGroup,
    allItems: OnlinestreamDownload_Item[],
    collapsed: boolean,
    onToggle: () => void
}) {
    const { mutate: act, isPending } = useOnlinestreamDownloadQueueAction()
    const done = allItems.filter(i => i.status === "completed").length
    const failed = allItems.filter(i => i.status === "failed").length
    const retryable = allItems.filter(i => i.status === "failed" || i.status === "cancelled").length
    const runningItem = allItems.find(isOnlinestreamDownloadRunning)
    // Series progress: finished episodes plus the fraction of the one downloading.
    const fraction = allItems.length
        ? (done + (runningItem?.status === "downloading" ? runningItem.progress : 0)) / allItems.length
        : 0

    return (
        <div className="pt-3 pb-2">
            <div className="flex items-center gap-3 rounded-lg bg-gray-900/70 border px-3 py-2">
                {!!group.image && <img src={group.image} alt="" className="w-9 h-12 object-cover rounded flex-none" />}
                <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                        <SeaLink href={`/entry?id=${group.mediaId}`} className="font-semibold hover:underline line-clamp-1">{group.title}</SeaLink>
                        {!!runningItem && <span className="size-2 rounded-full bg-[--green] animate-pulse flex-none" />}
                    </div>
                    <div className="flex items-center gap-2">
                        <ProgressBar size="sm" value={Math.round(fraction * 100)} className="flex-1 max-w-64" />
                        <span className="text-xs text-[--muted] whitespace-nowrap">
                            {done} / {allItems.length} episodes{failed ? ` · ${failed} failed` : ""}
                        </span>
                    </div>
                </div>
                {retryable > 0 && <Button
                    size="sm"
                    intent="warning-subtle"
                    leftIcon={<LuRotateCcw />}
                    disabled={isPending}
                    title="Retry every failed or cancelled episode of this series"
                    onClick={() => act({ action: "retry-media", mediaId: group.mediaId })}
                >
                    Retry {retryable}
                </Button>}
                <IconButton
                    size="sm"
                    intent="gray-basic"
                    icon={<LuTrash2 />}
                    title="Remove this series' waiting and finished episodes"
                    disabled={isPending}
                    onClick={() => act({ action: "clear-media", mediaId: group.mediaId })}
                />
                <IconButton
                    size="sm"
                    intent="gray-basic"
                    icon={<LuChevronDown className={cn("transition-transform", collapsed && "-rotate-90")} />}
                    title={collapsed ? "Show episodes" : "Hide episodes"}
                    onClick={onToggle}
                />
            </div>
        </div>
    )
}

function QueueItemRow({ item }: { item: OnlinestreamDownload_Item }) {
    const { mutate: act, isPending } = useOnlinestreamDownloadQueueAction()
    const running = isOnlinestreamDownloadRunning(item)
    const pct = Math.round((item.progress ?? 0) * 100)

    const icon = item.status === "completed" ? <LuCheck className="text-[--green]" />
        : item.status === "failed" ? <LuCircleAlert className="text-[--orange]" />
            : item.status === "cancelled" ? <LuX className="text-[--muted]" />
                : running ? <LuLoaderCircle className="animate-spin text-[--brand]" />
                    : <LuClock className="text-[--muted]" />

    return (
        <div className="pl-4 pb-1.5" data-anime-download-queue-item>
            <div
                className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 border border-transparent transition-colors",
                    running && "bg-white/5 border-[--brand]/30",
                    item.status === "failed" && "bg-[--orange]/5 border-[--orange]/30",
                    !running && item.status !== "failed" && "hover:bg-gray-900/60",
                )}
            >
                <div className="text-lg flex-none w-5 flex justify-center">{icon}</div>
                <div className="flex-1 min-w-0">
                    <p className={cn("text-sm line-clamp-1", item.status === "cancelled" && "text-[--muted] line-through")}>
                        <span className="font-medium">Episode {item.episodeNumber}</span>
                        {item.episodeTitle && !/^episode\s*\d+$/i.test(item.episodeTitle) &&
                            <span className="text-[--muted]"> — {item.episodeTitle}</span>}
                    </p>
                    <p className={cn("text-xs line-clamp-2", item.status === "failed" ? "text-[--orange]" : "text-[--muted]")}>
                        {item.status === "failed" ? (item.error || "Failed")
                            : item.status === "completed" ? `${formatDownloadBytes(item.bytes)}${item.audioTracks?.length
                                    ? ` · ${formatAudioTracks(item.audioTracks)}`
                                    : ""} · ${item.subtitleCount} subtitle track${item.subtitleCount === 1
                                    ? ""
                                    : "s"}${item.hardsubbed ? " · hardsubbed" : ""}`
                                : running ? `${statusText[item.status]}${item.status === "downloading" && item.phase === "English dub"
                                        ? " the English dub"
                                        : ""}${item.status === "downloading" ? ` · ${pct}% · ${formatSpeed(item.speed)}` : ""}`
                                    : `${statusText[item.status]} · ${item.provider}${item.server ? ` / ${item.server}` : ""}`}
                    </p>
                    {item.status === "downloading" && <ProgressBar size="sm" value={pct} className="mt-1" />}
                </div>
                <div className="flex gap-1 flex-none opacity-80 group-hover:opacity-100">
                    {item.status === "queued" && <IconButton
                        size="xs"
                        intent="gray-basic"
                        icon={<LuArrowUpToLine />}
                        title="Download next"
                        disabled={isPending}
                        onClick={() => act({ action: "move-to-top", id: item.id })}
                    />}
                    {(item.status === "failed" || item.status === "cancelled") && <IconButton
                        size="xs"
                        intent="gray-basic"
                        icon={<LuRotateCcw />}
                        title="Retry"
                        disabled={isPending}
                        onClick={() => act({ action: "retry", id: item.id })}
                    />}
                    {isOnlinestreamDownloadActive(item) && <IconButton
                        size="xs"
                        intent="gray-basic"
                        icon={<LuX />}
                        title="Cancel"
                        disabled={isPending}
                        onClick={() => act({ action: "cancel", id: item.id })}
                    />}
                    {!running && <IconButton
                        size="xs"
                        intent="gray-basic"
                        icon={<LuTrash2 />}
                        title="Remove from the list"
                        disabled={isPending}
                        onClick={() => act({ action: "remove", id: item.id })}
                    />}
                </div>
            </div>
        </div>
    )
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Downloaded
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type DownloadedSeries = {
    mediaId: number
    title: string
    image?: string
    episodes: number
    bytes: number
    lastAt: string
    media?: AL_BaseAnime
}

export function AnimeDownloadedList() {
    const { data: history, isLoading } = useGetOnlinestreamDownloadHistory()
    const { data: collection } = useGetAnimeCollection()

    const mediaMap = React.useMemo(() => {
        const map = new Map<number, AL_BaseAnime>()
        collection?.MediaListCollection?.lists?.forEach(l => l.entries?.forEach(e => {
            if (e?.media?.id) map.set(e.media.id, e.media)
        }))
        return map
    }, [collection])

    const series = React.useMemo<DownloadedSeries[]>(() => {
        const bySeries = new Map<number, DownloadedSeries>()
        for (const h of (history ?? []) as OnlinestreamDownload_HistoryEntry[]) {
            let s = bySeries.get(h.mediaId)
            if (!s) {
                s = { mediaId: h.mediaId, title: h.title, image: h.image, episodes: 0, bytes: 0, lastAt: h.completedAt, media: mediaMap.get(h.mediaId) }
                bySeries.set(h.mediaId, s)
            }
            s.episodes++
            s.bytes += h.bytes || 0
        }
        return [...bySeries.values()]
    }, [history, mediaMap])

    const totalBytes = series.reduce((a, s) => a + s.bytes, 0)
    const totalEpisodes = series.reduce((a, s) => a + s.episodes, 0)

    return (
        <div className="space-y-4" data-anime-downloaded-list-container>
            <div className="flex w-full items-center gap-2">
                <h3>Downloaded</h3>
                <div className="flex flex-1" />
                {!!series.length && <p className="text-sm text-[--muted]">
                    {formatNumber(totalEpisodes)} episode{totalEpisodes === 1 ? "" : "s"} · {series.length} series · {formatDownloadBytes(totalBytes)}
                </p>}
            </div>

            {isLoading ? <LoadingSpinner /> : !series.length ? (
                <p className="text-center text-[--muted] italic py-4">No episodes downloaded from streaming providers yet</p>
            ) : (
                <VirtuosoGrid
                    style={{ height: "56vh" }}
                    data={series}
                    computeItemKey={(_i, s) => String(s.mediaId)}
                    listClassName="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4"
                    itemClassName="col-span-1"
                    itemContent={(_i, s) => {
                        const badge = <p
                            className="font-semibold text-white bg-gray-950 z-[-1] absolute right-0 w-fit whitespace-nowrap px-4 py-1.5 text-center !bg-opacity-90 text-sm lg:text-base rounded-none rounded-bl-lg"
                        >{s.episodes} episode{s.episodes === 1 ? "" : "s"}</p>
                        if (s.media) {
                            return <MediaEntryCard
                                media={s.media}
                                type="anime"
                                hideUnseenCountBadge
                                hideAnilistEntryEditButton
                                overlay={badge}
                            />
                        }
                        return (
                            <SeaLink href={`/entry?id=${s.mediaId}`} className="block group">
                                <div className="relative aspect-[6/8] rounded-md overflow-hidden border bg-gray-900">
                                    {!!s.image && <img src={s.image} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />}
                                    <div className="absolute top-0 right-0 z-[1]">{badge}</div>
                                </div>
                                <p className="mt-2 text-sm font-medium line-clamp-2">{s.title}</p>
                                <p className="text-xs text-[--muted]">{formatDownloadBytes(s.bytes)}</p>
                            </SeaLink>
                        )
                    }}
                />
            )}
        </div>
    )
}
