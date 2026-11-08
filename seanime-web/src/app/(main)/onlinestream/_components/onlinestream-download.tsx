import { Onlinestream_Episode, Onlinestream_VideoSource } from "@/api/generated/types"
import {
    isOnlinestreamDownloadActive,
    isOnlinestreamDownloadRunning,
    useGetOnlinestreamDownloads,
    useOnlinestreamDownload,
    useOnlinestreamDownloadSeries,
} from "@/api/hooks/onlinestream_download.hooks"
import { vc_subtitleManager } from "@/app/(main)/_features/video-core/video-core"
import { __anime_streamDownloadsModalIsOpenAtom } from "@/app/(main)/onlinestream/_containers/anime-downloads/anime-downloads-modal"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/components/ui/core/styling"
import { Modal } from "@/components/ui/modal"
import { ProgressBar } from "@/components/ui/progress-bar"
import { useAtomValue, useSetAtom } from "jotai/react"
import React from "react"
import { LuDownload, LuMonitorDown, LuLibrary, LuTriangleAlert } from "react-icons/lu"

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

/**
 * Queues episodes for download with the provider, server and quality selected in the player.
 * The server fetches the stream (rate limited), keeps the stream's own subtitles as soft ASS tracks
 * in an MKV, and files it in the library already matched.
 */
export function useOnlinestreamEpisodeDownloader(params: DownloadParams) {
    const shownSubtitle = useShownSubtitleLanguage()
    const { mutate, isPending } = useOnlinestreamDownload()

    const download = React.useCallback((episodeNumbers: number[], videoSource?: Onlinestream_VideoSource) => {
        if (!params.provider || !params.mediaId || !episodeNumbers.length) return
        mutate({
            mediaId: params.mediaId,
            episodeNumbers,
            provider: params.provider,
            dubbed: params.dubbed,
            server: params.server || videoSource?.server || "",
            quality: params.quality || videoSource?.quality || "",
            sourceUrl: videoSource?.url,
            subtitleLanguage: shownSubtitle(videoSource),
        })
    }, [params.provider, params.mediaId, params.dubbed, params.server, params.quality, shownSubtitle, mutate])

    return { download, isPending }
}

type OnlinestreamDownloadButtonProps = DownloadParams & {
    currentEpisodeNumber: number | null
    episodes: Onlinestream_Episode[] | undefined
    videoSource: Onlinestream_VideoSource | undefined
}

export function OnlinestreamDownloadButton(props: OnlinestreamDownloadButtonProps) {
    const { mediaId, provider, currentEpisodeNumber, episodes, videoSource } = props
    const { data: queue } = useGetOnlinestreamDownloads(!!provider)
    const { download, isPending } = useOnlinestreamEpisodeDownloader(props)
    const { mutate: downloadSeries, isPending: isQueueingSeries } = useOnlinestreamDownloadSeries()
    const shownSubtitle = useShownSubtitleLanguage()
    const openQueue = useSetAtom(__anime_streamDownloadsModalIsOpenAtom)
    const [open, setOpen] = React.useState(false)
    const [selected, setSelected] = React.useState<Set<number>>(new Set())
    const [includeExisting, setIncludeExisting] = React.useState(false)

    const seriesItems = React.useMemo(() => queue?.items?.filter(i => i.mediaId === mediaId) ?? [], [queue, mediaId])
    const activeSeries = seriesItems.filter(isOnlinestreamDownloadActive)
    const busyEpisodes = React.useMemo(() => new Set(activeSeries.map(i => i.episodeNumber)), [activeSeries])
    const runningHere = seriesItems.find(isOnlinestreamDownloadRunning)
    const doneHere = seriesItems.filter(i => i.status === "completed").length
    const hardsubbed = !!videoSource && !videoSource.subtitles?.filter(s => !/thumbnail/i.test(s.language)).length
    const sortedEpisodes = React.useMemo(() => [...(episodes ?? [])].sort((a, b) => a.number - b.number), [episodes])

    const toggle = (n: number) => setSelected(prev => {
        const next = new Set(prev)
        if (next.has(n)) next.delete(n)
        else next.add(n)
        return next
    })

    if (!provider) return null

    const server = props.server || videoSource?.server
    const quality = props.quality || videoSource?.quality

    return (
        <Modal
            open={open}
            onOpenChange={setOpen}
            title="Download from the provider"
            description="Saved to your library as an MKV with the stream's subtitles as separate tracks, and matched automatically."
            contentClass="max-w-2xl"
            trigger={<Button
                size="sm"
                rounded
                intent={runningHere ? "primary-subtle" : "gray-basic"}
                leftIcon={<LuDownload className={cn("text-xl", runningHere && "animate-pulse")} />}
            >
                Download{activeSeries.length > 0 ? ` (${activeSeries.length})` : ""}
            </Button>}
        >
            <div className="space-y-5">
                <div className="rounded-lg border bg-gray-900/50 p-3 space-y-2">
                    <p className="text-sm text-[--muted]">
                        Using <span className="text-[--foreground] font-medium">{provider}</span>
                        {!!server && <> / <span className="text-[--foreground] font-medium">{server}</span></>}
 at <span className="text-[--foreground] font-medium">the best quality available</span>
. Japanese audio comes first, with the English dub added as a second track when {provider} has one.
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
                    {!!seriesItems.length && <div className="space-y-1 pt-1">
                        <div className="flex text-xs text-[--muted]">
                            <span className="flex-1">
                                {runningHere ? `Downloading episode ${runningHere.episodeNumber}` : activeSeries.length ? "Waiting in the queue" : "This series"}
                                {" · "}{doneHere} / {seriesItems.length} done
                            </span>
                            {queue?.paused && <span className="text-[--orange]">Queue stopped</span>}
                        </div>
                        <ProgressBar
                            size="sm"
                            value={Math.round(((doneHere + (runningHere?.status === "downloading" ? runningHere.progress : 0)) / seriesItems.length) * 100)}
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
                                {includeExisting ? "" : " Episodes already in your library are skipped."}
                            </p>
                        </div>
                    </div>
                    <Checkbox
                        label="Also download episodes that are already in my library"
                        value={includeExisting}
                        onValueChange={v => setIncludeExisting(v === true)}
                        size="sm"
                    />
                    <Button
                        intent="primary"
                        className="w-full"
                        leftIcon={<LuDownload />}
                        loading={isQueueingSeries}
                        onClick={() => downloadSeries({
                            mediaId,
                            provider,
                            dubbed: props.dubbed,
                            server: server || "",
                            quality: quality || "",
                            subtitleLanguage: shownSubtitle(videoSource),
                            includeExisting,
                        })}
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
                            const done = seriesItems.some(i => i.episodeNumber === ep.number && i.status === "completed")
                            return (
                                <button
                                    key={ep.number}
                                    type="button"
                                    disabled={busy}
                                    title={busy ? "In the queue" : done ? "Downloaded" : ep.title}
                                    onClick={() => toggle(ep.number)}
                                    className={cn(
                                        "min-w-10 h-8 px-2 rounded-md border text-sm transition-colors",
                                        selected.has(ep.number) ? "bg-[--brand] text-white border-transparent" : "hover:bg-[--subtle]",
                                        done && !selected.has(ep.number) && "border-[--green]/50 text-[--green]",
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
    )
}
