import { Onlinestream_Episode, Onlinestream_VideoSource } from "@/api/generated/types"
import {
    isOnlinestreamDownloadActive,
    isOnlinestreamDownloadRunning,
    OnlinestreamDownload_ExistingEpisode,
    useGetOnlinestreamDownloadExisting,
    useGetOnlinestreamDownloads,
    useGetOnlinestreamDownloadSeries,
    useOnlinestreamDownload,
    useOnlinestreamDownloadSeries,
} from "@/api/hooks/onlinestream_download.hooks"
import { vc_subtitleManager } from "@/app/(main)/_features/video-core/video-core"
import { __anime_streamDownloadsModalIsOpenAtom } from "@/app/(main)/onlinestream/_containers/anime-downloads/anime-downloads-modal"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Modal } from "@/components/ui/modal"
import { ProgressBar } from "@/components/ui/progress-bar"
import { useAtomValue, useSetAtom } from "jotai/react"
import React from "react"
import { LuArrowLeft, LuCheck, LuDownload, LuLibrary, LuListChecks, LuMonitorDown, LuReplace, LuTriangleAlert } from "react-icons/lu"
import { toast } from "sonner"

type DownloadParams = {
    mediaId: number
    provider: string | null | undefined
    dubbed: boolean
    server: string | undefined
    quality: string | undefined
}

/** The subtitle the player is showing, which becomes the downloaded file's default track. */
function useShownSubtitleLanguage() {
    const subtitleManager = useAtomValue(vc_subtitleManager)
    return React.useCallback((videoSource?: Onlinestream_VideoSource) => {
        try {
            const track = subtitleManager?.getTrack(subtitleManager.getSelectedTrackNumberOrNull())
            const label = track?.label || track?.language
            if (label) return label
        }
        catch {
        }
        return videoSource?.subtitles?.find(s => s.isDefault)?.language
    }, [subtitleManager])
}

/** A download waiting on the overwrite question. */
type PendingDownload = {
    kind: "episodes" | "series"
    episodes: number[]
    existing: OnlinestreamDownload_ExistingEpisode[]
    videoSource?: Onlinestream_VideoSource
}

/**
 * Queues episodes for download with the provider and server selected in the player. When some of
 * them are already in the library it first asks: overwrite them all, choose which, or go back.
 * Render `prompt` somewhere in the page for the question to show.
 */
export function useOnlinestreamEpisodeDownloader(params: DownloadParams) {
    const shownSubtitle = useShownSubtitleLanguage()
    const { mutate, isPending } = useOnlinestreamDownload()
    const { mutate: mutateSeries, isPending: isQueueingSeries } = useOnlinestreamDownloadSeries()
    const { data: existing, refetch: refetchExisting } = useGetOnlinestreamDownloadExisting(params.mediaId)
    const [pending, setPending] = React.useState<PendingDownload | null>(null)

    const send = React.useCallback((p: PendingDownload, overwrite: number[]) => {
        if (!params.provider || !params.mediaId) return
        const overwriteSet = new Set(overwrite)
        const existingSet = new Set(p.existing.map(e => e.episodeNumber))
        if (p.kind === "series") {
            mutateSeries({
                mediaId: params.mediaId,
                provider: params.provider,
                dubbed: params.dubbed,
                server: params.server || p.videoSource?.server || "",
                quality: params.quality || p.videoSource?.quality || "",
                subtitleLanguage: shownSubtitle(p.videoSource),
                overwriteEpisodes: overwrite,
            })
            return
        }
        // Episodes in the library that were not picked for overwriting are left out.
        const episodes = p.episodes.filter(n => !existingSet.has(n) || overwriteSet.has(n))
        if (!episodes.length) {
            toast.info("Nothing to download")
            return
        }
        mutate({
            mediaId: params.mediaId,
            episodeNumbers: episodes,
            provider: params.provider,
            dubbed: params.dubbed,
            server: params.server || p.videoSource?.server || "",
            quality: params.quality || p.videoSource?.quality || "",
            sourceUrl: episodes.length === 1 ? p.videoSource?.url : undefined,
            subtitleLanguage: shownSubtitle(p.videoSource),
            overwriteEpisodes: overwrite.filter(n => episodes.includes(n)),
        })
    }, [params.provider, params.mediaId, params.dubbed, params.server, params.quality, shownSubtitle, mutate, mutateSeries])

    const request = React.useCallback(async (kind: PendingDownload["kind"], episodes: number[], videoSource?: Onlinestream_VideoSource) => {
        if (!params.provider || !params.mediaId || !episodes.length) return
        // Fresh: an episode may have been added or removed since the page loaded.
        const latest = (await refetchExisting()).data ?? existing ?? []
        const wanted = new Set(episodes)
        const inLibrary = latest.filter(e => wanted.has(e.episodeNumber))
        const p: PendingDownload = { kind, episodes, existing: inLibrary, videoSource }
        if (!inLibrary.length) {
            send(p, [])
            return
        }
        setPending(p)
    }, [params.provider, params.mediaId, existing, refetchExisting, send])

    const download = React.useCallback((episodeNumbers: number[], videoSource?: Onlinestream_VideoSource) =>
        request("episodes", episodeNumbers, videoSource), [request])
    const downloadSeries = React.useCallback((episodeNumbers: number[], videoSource?: Onlinestream_VideoSource) =>
        request("series", episodeNumbers, videoSource), [request])

    const prompt = <OverwritePrompt
        pending={pending}
        onClose={() => setPending(null)}
        onConfirm={overwrite => {
            if (pending) send(pending, overwrite)
            setPending(null)
        }}
    />

    return { download, downloadSeries, isPending: isPending || isQueueingSeries, prompt, existing }
}

/** Asks what to do with episodes that are already in the library: overwrite all, choose, or go back. */
export function OverwritePrompt({ pending, onClose, onConfirm }: {
    pending: PendingDownload | null
    onClose: () => void
    onConfirm: (overwrite: number[]) => void
}) {
    const [choosing, setChoosing] = React.useState(false)
    const [chosen, setChosen] = React.useState<Set<number>>(new Set())

    React.useEffect(() => {
        setChoosing(false)
        setChosen(new Set())
    }, [pending])

    const existing = pending?.existing ?? []
    const others = (pending?.episodes.length ?? 0) - existing.length
    const toggle = (n: number) => setChosen(prev => {
        const next = new Set(prev)
        if (next.has(n)) next.delete(n)
        else next.add(n)
        return next
    })

    return (
        <Modal
            open={!!pending}
            onOpenChange={v => !v && onClose()}
            title={existing.length === 1 ? `Episode ${existing[0].episodeNumber} is already in your library` : `${existing.length} episodes are already in your library`}
            description={choosing
                ? "Pick the episodes to replace. The others stay as they are and are not downloaded."
                : "Overwrite the old files with the new download, or choose which ones to replace."}
            contentClass="max-w-lg max-sm:w-[calc(100vw-1.5rem)]"
        >
            <div className="space-y-4">
                {!choosing ? (
                    <ul className="max-h-56 overflow-y-auto space-y-1.5 text-sm">
                        {existing.map(e => (
                            <li key={e.episodeNumber} className="flex gap-2">
                                <span className="font-medium whitespace-nowrap">Episode {e.episodeNumber}</span>
                                <span className="text-[--muted] truncate min-w-0" title={e.files.join("\n")}>{e.files.join(", ")}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <Button size="xs" intent="gray-subtle" onClick={() => setChosen(new Set(existing.map(e => e.episodeNumber)))}>All</Button>
                            <Button size="xs" intent="gray-subtle" onClick={() => setChosen(new Set())}>None</Button>
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                            {existing.map(e => {
                                const on = chosen.has(e.episodeNumber)
                                return (
                                    <button
                                        key={e.episodeNumber}
                                        type="button"
                                        onClick={() => toggle(e.episodeNumber)}
                                        className={cn(
                                            "w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                            on ? "border-[--brand] bg-[--brand]/10" : "hover:bg-[--subtle]",
                                        )}
                                    >
                                        <span
                                            className={cn("size-5 flex-none rounded border flex items-center justify-center",
                                                on && "bg-[--brand] border-transparent text-white")}
                                        >
                                            {on && <LuCheck className="text-xs" />}
                                        </span>
                                        <span className="font-medium whitespace-nowrap">Episode {e.episodeNumber}</span>
                                        <span className="text-[--muted] truncate min-w-0">{e.files.join(", ")}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {others > 0 && <p className="text-xs text-[--muted]">
                    The other {others} episode{others === 1 ? "" : "s"} {others === 1 ? "is" : "are"} not in your library and will be downloaded either way.
                </p>}

                {!choosing ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button intent="gray-subtle" className="flex-1" leftIcon={<LuArrowLeft />} onClick={onClose}>
                            Go back
                        </Button>
                        <Button intent="primary-subtle" className="flex-1" leftIcon={<LuListChecks />} onClick={() => setChoosing(true)}>
                            Choose…
                        </Button>
                        <Button
                            intent="alert"
                            className="flex-1"
                            leftIcon={<LuReplace />}
                            onClick={() => onConfirm(existing.map(e => e.episodeNumber))}
                        >
                            Overwrite all
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button intent="gray-subtle" className="flex-1" leftIcon={<LuArrowLeft />} onClick={() => setChoosing(false)}>
                            Back
                        </Button>
                        <Button
                            intent="alert"
                            className="flex-1"
                            leftIcon={<LuReplace />}
                            disabled={chosen.size === 0 && others === 0}
                            onClick={() => onConfirm([...chosen].sort((a, b) => a - b))}
                        >
                            {chosen.size ? `Overwrite ${chosen.size} and download` : "Download without overwriting"}
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    )
}

type OnlinestreamDownloadButtonProps = DownloadParams & {
    currentEpisodeNumber: number | null
    episodes: Onlinestream_Episode[] | undefined
    videoSource: Onlinestream_VideoSource | undefined
}

export function OnlinestreamDownloadButton(props: OnlinestreamDownloadButtonProps) {
    const { mediaId, provider, currentEpisodeNumber, episodes, videoSource } = props
    const { data: queue } = useGetOnlinestreamDownloads(!!provider)
    const { download, downloadSeries, isPending, prompt, existing } = useOnlinestreamEpisodeDownloader(props)
    const openQueue = useSetAtom(__anime_streamDownloadsModalIsOpenAtom)
    const [open, setOpen] = React.useState(false)
    const [selected, setSelected] = React.useState<Set<number>>(new Set())

    // The queue summary has this series' counts; its episodes are fetched only while the window is open.
    const seriesLine = queue?.series?.find(s => s.mediaId === mediaId)
    const { data: seriesItems } = useGetOnlinestreamDownloadSeries(mediaId, queue?.rev, open && !!seriesLine)
    const activeCount = seriesLine ? seriesLine.queued + (seriesLine.running ? 1 : 0) : 0
    const busyEpisodes = React.useMemo(() => new Set((seriesItems ?? []).filter(isOnlinestreamDownloadActive).map(i => i.episodeNumber)),
        [seriesItems])
    const inLibrary = React.useMemo(() => new Set((existing ?? []).map(e => e.episodeNumber)), [existing])
    const runningHere = queue?.running && queue.running.mediaId === mediaId && isOnlinestreamDownloadRunning(queue.running) ? queue.running : undefined
    const doneHere = seriesLine?.done ?? 0
    const seriesTotal = seriesLine?.total ?? 0
    const hardsubbed = !!videoSource && !videoSource.subtitles?.filter(s => !/thumbnail/i.test(s.language)).length
    const sortedEpisodes = React.useMemo(() => [...(episodes ?? [])].sort((a, b) => a.number - b.number), [episodes])
    const libraryCount = sortedEpisodes.filter(e => inLibrary.has(e.number)).length

    const toggle = (n: number) => setSelected(prev => {
        const next = new Set(prev)
        if (next.has(n)) next.delete(n)
        else next.add(n)
        return next
    })

    if (!provider) return null

    const server = props.server || videoSource?.server

    return (
        <>
            {prompt}
            <Modal
                open={open}
                onOpenChange={setOpen}
                title="Download from the provider"
                description="Saved to your library as an MKV with the stream's subtitles as separate tracks, and matched automatically."
                contentClass="max-w-2xl max-sm:w-[calc(100vw-1.5rem)]"
                trigger={<Button
                    size="sm"
                    rounded
                    intent={runningHere ? "primary-subtle" : "gray-basic"}
                    leftIcon={<LuDownload className={cn("text-xl", runningHere && "animate-pulse")} />}
                >
                    Download{activeCount > 0 ? ` (${activeCount})` : ""}
                </Button>}
            >
                <div className="space-y-5">
                    <div className="rounded-lg border bg-gray-900/50 p-3 space-y-2">
                        <p className="text-sm text-[--muted]">
                            Using <span className="text-[--foreground] font-medium">{provider}</span>
                            {!!server && <> / <span className="text-[--foreground] font-medium">{server}</span></>}
                            {" "}at <span className="text-[--foreground] font-medium">the best quality available</span>.
                            Japanese audio comes first, with the English dub added as a second track when {provider} has one.
                            One episode downloads at a time, rate limited so the provider isn't overloaded.
                        </p>
                        {!!videoSource && (hardsubbed ? (
                            <p className="text-sm text-[--orange] flex gap-2">
                                <LuTriangleAlert className="flex-none mt-0.5" />
                                This source has no separate subtitle tracks, so any subtitles are burnt into the video. Pick another server for soft
                                subtitles.
                            </p>
                        ) : (
                            <p className="text-sm text-[--muted]">
                                Subtitle tracks: {videoSource.subtitles?.filter(s => !/thumbnail/i.test(s.language)).map(s => s.language).join(", ")}
                            </p>
                        ))}
                        {!!queue?.blocked && <p className="text-sm text-[--orange] flex gap-2">
                            <LuTriangleAlert className="flex-none mt-0.5" />
                            {queue.blocked}
                        </p>}
                        {seriesTotal > 0 && <div className="space-y-1 pt-1">
                            <div className="flex text-xs text-[--muted]">
                                <span className="flex-1">
                                    {runningHere ? `Downloading episode ${runningHere.episodeNumber}` : activeCount ? "Waiting in the queue" : "This series"}
                                    {" · "}{doneHere} / {seriesTotal} done
                                </span>
                                {queue?.paused && <span className="text-[--orange]">Queue stopped</span>}
                            </div>
                            <ProgressBar
                                size="sm"
                                value={Math.round(((doneHere + (runningHere?.status === "downloading" ? runningHere.progress : 0)) / seriesTotal) * 100)}
                            />
                        </div>}
                    </div>

                    {/* Full series */}
                    <div className="rounded-lg border border-[--brand]/40 bg-[--brand]/5 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <LuLibrary className="text-2xl text-[--brand] flex-none mt-0.5" />
                            <div className="flex-1">
                                <p className="font-semibold">Download the full series</p>
                                <p className="text-sm text-[--muted]">
                                    Queues every episode {provider} lists{sortedEpisodes.length ? ` (${sortedEpisodes.length})` : ""}.
                                    {libraryCount > 0 && ` ${libraryCount} ${libraryCount === 1 ? "is" : "are"} already in your library; you'll be asked whether to overwrite them.`}
                                </p>
                            </div>
                        </div>
                        <Button
                            intent="primary"
                            className="w-full"
                            leftIcon={<LuDownload />}
                            loading={isPending}
                            disabled={!sortedEpisodes.length}
                            onClick={() => downloadSeries(sortedEpisodes.map(e => e.number).filter(n => !busyEpisodes.has(n)), videoSource)}
                        >
                            Download full series
                        </Button>
                    </div>

                    {/* Single episode */}
                    {currentEpisodeNumber != null && <Button
                        intent="primary-subtle"
                        className="w-full"
                        leftIcon={<LuDownload />}
                        loading={isPending}
                        disabled={busyEpisodes.has(currentEpisodeNumber)}
                        onClick={() => download([currentEpisodeNumber], videoSource)}
                    >
                        {busyEpisodes.has(currentEpisodeNumber) ? `Episode ${currentEpisodeNumber} is in the queue` : `Download episode ${currentEpisodeNumber}`}
                    </Button>}

                    {/* Chosen episodes */}
                    {sortedEpisodes.length > 1 && <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <p className="font-medium flex-1">Choose episodes</p>
                            <Button size="xs" intent="gray-subtle" onClick={() => setSelected(new Set(sortedEpisodes.map(e => e.number)
                                .filter(n => !busyEpisodes.has(n))))}>All</Button>
                            <Button size="xs" intent="gray-subtle" onClick={() => setSelected(new Set())}>None</Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                            {sortedEpisodes.map(ep => {
                                const busy = busyEpisodes.has(ep.number)
                                const have = inLibrary.has(ep.number)
                                return (
                                    <button
                                        key={ep.number}
                                        type="button"
                                        disabled={busy}
                                        title={busy ? "In the queue" : have ? "In your library" : ep.title}
                                        onClick={() => toggle(ep.number)}
                                        className={cn(
                                            "min-w-10 h-8 px-2 rounded-md border text-sm transition-colors",
                                            selected.has(ep.number) ? "bg-[--brand] text-white border-transparent" : "hover:bg-[--subtle]",
                                            have && !selected.has(ep.number) && "border-[--green]/50 text-[--green]",
                                            busy && "opacity-50 cursor-not-allowed border-dashed",
                                        )}
                                    >
                                        {ep.number}
                                    </button>
                                )
                            })}
                        </div>
                        <Button
                            intent="gray-subtle"
                            className="w-full"
                            leftIcon={<LuDownload />}
                            loading={isPending}
                            disabled={selected.size === 0}
                            onClick={() => {
                                download([...selected].sort((a, b) => a - b).filter(n => !busyEpisodes.has(n)))
                                setSelected(new Set())
                            }}
                        >
                            Download {selected.size} selected
                        </Button>
                    </div>}

                    <Button
                        intent="white-subtle"
                        className="w-full"
                        leftIcon={<LuMonitorDown />}
                        onClick={() => {
                            setOpen(false)
                            openQueue(true)
                        }}
                    >
                        Open the download queue
                    </Button>
                </div>
            </Modal>
        </>
    )
}
