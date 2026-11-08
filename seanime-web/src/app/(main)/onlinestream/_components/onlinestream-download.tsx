import { Onlinestream_Episode, Onlinestream_VideoSource } from "@/api/generated/types"
import {
    isOnlinestreamDownloadActive,
    OnlinestreamDownload_Item,
    useCancelOnlinestreamDownload,
    useClearOnlinestreamDownloads,
    useGetOnlinestreamDownloads,
    useOnlinestreamDownload,
} from "@/api/hooks/onlinestream_download.hooks"
import { vc_subtitleManager } from "@/app/(main)/_features/video-core/video-core"
import { Button, IconButton } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Modal } from "@/components/ui/modal"
import { ProgressBar } from "@/components/ui/progress-bar"
import { useAtomValue } from "jotai/react"
import React from "react"
import { LuDownload, LuTriangleAlert, LuX } from "react-icons/lu"

type DownloadParams = {
    mediaId: number
    provider: string | null | undefined
    dubbed: boolean
    server: string | undefined
    quality: string | undefined
}

/**
 * Queues episodes for download with the provider, server and quality selected in the player.
 * The server fetches the stream (rate limited), keeps the stream's own subtitles as soft ASS tracks
 * in an MKV, and files it in the library already matched.
 */
export function useOnlinestreamEpisodeDownloader(params: DownloadParams) {
    const subtitleManager = useAtomValue(vc_subtitleManager)
    const { mutate, isPending } = useOnlinestreamDownload()

    const download = React.useCallback((episodeNumbers: number[], videoSource?: Onlinestream_VideoSource) => {
        if (!params.provider || !params.mediaId || !episodeNumbers.length) return
        // The subtitle the player is showing becomes the default track.
        let subtitleLanguage: string | undefined
        try {
            const track = subtitleManager?.getTrack(subtitleManager.getSelectedTrackNumberOrNull())
            subtitleLanguage = track?.label || track?.language || undefined
        }
        catch {
            subtitleLanguage = undefined
        }
        mutate({
            mediaId: params.mediaId,
            episodeNumbers,
            provider: params.provider,
            dubbed: params.dubbed,
            server: params.server || videoSource?.server || "",
            quality: params.quality || videoSource?.quality || "",
            sourceUrl: videoSource?.url,
            subtitleLanguage: subtitleLanguage ?? videoSource?.subtitles?.find(s => s.isDefault)?.language,
        })
    }, [params.provider, params.mediaId, params.dubbed, params.server, params.quality, subtitleManager, mutate])

    return { download, isPending }
}

const statusLabel: Record<OnlinestreamDownload_Item["status"], string> = {
    queued: "Waiting",
    fetching: "Fetching the source",
    downloading: "Downloading",
    muxing: "Building the MKV",
    registering: "Adding to the library",
    completed: "In your library",
    failed: "Failed",
    cancelled: "Cancelled",
}

function formatBytes(n: number) {
    if (!n) return "0 MB"
    if (n > 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
    return `${(n / 1024 ** 2).toFixed(1)} MB`
}

export function OnlinestreamDownloadQueueItem({ item }: { item: OnlinestreamDownload_Item }) {
    const { mutate: cancel, isPending } = useCancelOnlinestreamDownload()
    const active = isOnlinestreamDownloadActive(item)
    const pct = Math.round((item.progress ?? 0) * 100)

    return (
        <div data-onlinestream-download-item className="rounded-md border p-3 space-y-2">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title} — Episode {item.episodeNumber}</p>
                    <p className={cn("text-sm",
                        item.status === "failed" ? "text-[--red]" : item.status === "completed" ? "text-[--green]" : "text-[--muted]")}>
                        {statusLabel[item.status]}
                        {item.status === "downloading" && <>
                            {" · "}{item.segmentsTotal > 0 ? `${item.segmentsDone}/${item.segmentsTotal} segments · ` : ""}
                            {formatBytes(item.bytes)} · {pct}%
                        </>}
                        {!!item.server && <span className="text-[--muted]"> · {item.provider} / {item.server}{item.quality ? ` ${item.quality}` : ""}</span>}
                        {item.status !== "queued" && item.status !== "fetching" && <span className="text-[--muted]">
                            {" · "}{item.subtitleCount} subtitle track{item.subtitleCount === 1 ? "" : "s"}
                        </span>}
                    </p>
                </div>
                {active && <IconButton
                    size="sm"
                    intent="gray-basic"
                    icon={<LuX />}
                    title="Cancel"
                    loading={isPending}
                    onClick={() => cancel({ id: item.id })}
                />}
            </div>
            {(item.status === "downloading" || item.status === "muxing" || item.status === "fetching" || item.status === "registering") && (
                <ProgressBar
                    size="sm"
                    value={item.status === "downloading" ? pct : undefined}
                    isIndeterminate={item.status !== "downloading"}
                />
            )}
            {item.status === "failed" && !!item.error && <p className="text-sm text-[--red] break-words">{item.error}</p>}
            {item.status === "completed" && !!item.destination && <p className="text-xs text-[--muted] break-all">{item.destination}</p>}
            {!!item.warnings?.length && <ul className="text-xs text-[--orange] space-y-0.5">
                {item.warnings.map((w, i) => <li key={i} className="flex gap-1"><LuTriangleAlert className="flex-none mt-0.5" /> {w}</li>)}
            </ul>}
        </div>
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
    const { mutate: clearFinished, isPending: isClearing } = useClearOnlinestreamDownloads()
    const { download, isPending } = useOnlinestreamEpisodeDownloader(props)
    const [selected, setSelected] = React.useState<Set<number>>(new Set())

    const activeCount = queue?.filter(isOnlinestreamDownloadActive).length ?? 0
    const busyEpisodes = React.useMemo(() => new Set(queue?.filter(i => i.mediaId === mediaId && isOnlinestreamDownloadActive(i))
        .map(i => i.episodeNumber) ?? []), [queue, mediaId])
    const hardsubbed = !!videoSource && !videoSource.subtitles?.filter(s => !/thumbnail/i.test(s.language)).length
    const sortedEpisodes = React.useMemo(() => [...(episodes ?? [])].sort((a, b) => a.number - b.number), [episodes])

    const toggle = (n: number) => setSelected(prev => {
        const next = new Set(prev)
        if (next.has(n)) next.delete(n)
        else next.add(n)
        return next
    })

    if (!provider) return null

    return (
        <Modal
            title="Download from the provider"
            description="Saved to your library as an MKV with the stream's subtitles as separate tracks, and matched automatically."
            contentClass="max-w-2xl"
            trigger={<Button
                size="sm"
                rounded
                intent="gray-basic"
                leftIcon={<LuDownload className="text-xl" />}
            >
                Download{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>}
        >
            <div className="space-y-4">
                <div className="space-y-2">
                    <p className="text-sm text-[--muted]">
                        Using <span className="text-[--foreground]">{provider}</span>
                        {!!(props.server || videoSource?.server) && <> / <span className="text-[--foreground]">{props.server || videoSource?.server}</span></>}
                        {!!(props.quality || videoSource?.quality) && <> at <span className="text-[--foreground]">{props.quality || videoSource?.quality}</span></>}
                        {props.dubbed ? " (dub)" : " (sub)"}.
                        Downloads run one at a time and are rate limited so the provider isn't overloaded.
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
                    {currentEpisodeNumber != null && <Button
                        intent="primary"
                        leftIcon={<LuDownload />}
                        loading={isPending}
                        disabled={busyEpisodes.has(currentEpisodeNumber)}
                        onClick={() => download([currentEpisodeNumber], videoSource)}
                    >
                        {busyEpisodes.has(currentEpisodeNumber) ? `Episode ${currentEpisodeNumber} is downloading` : `Download episode ${currentEpisodeNumber}`}
                    </Button>}
                </div>

                {sortedEpisodes.length > 1 && <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <p className="font-medium flex-1">Choose episodes</p>
                        <Button size="xs" intent="gray-subtle" onClick={() => setSelected(new Set(sortedEpisodes.map(e => e.number)))}>All</Button>
                        <Button size="xs" intent="gray-subtle" onClick={() => setSelected(new Set())}>None</Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                        {sortedEpisodes.map(ep => (
                            <button
                                key={ep.number}
                                type="button"
                                disabled={busyEpisodes.has(ep.number)}
                                onClick={() => toggle(ep.number)}
                                className={cn(
                                    "min-w-10 h-8 px-2 rounded-md border text-sm transition-colors",
                                    selected.has(ep.number) ? "bg-[--brand] text-white border-transparent" : "hover:bg-[--subtle]",
                                    busyEpisodes.has(ep.number) && "opacity-50 cursor-not-allowed",
                                )}
                            >
                                {ep.number}
                            </button>
                        ))}
                    </div>
                    <Button
                        intent="primary-subtle"
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

                {!!queue?.length && <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <p className="font-medium flex-1">Queue</p>
                        {queue.some(i => !isOnlinestreamDownloadActive(i)) && <Button
                            size="xs"
                            intent="gray-subtle"
                            loading={isClearing}
                            onClick={() => clearFinished()}
                        >Clear finished</Button>}
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {queue.map(item => <OnlinestreamDownloadQueueItem key={item.id} item={item} />)}
                    </div>
                </div>}
            </div>
        </Modal>
    )
}
