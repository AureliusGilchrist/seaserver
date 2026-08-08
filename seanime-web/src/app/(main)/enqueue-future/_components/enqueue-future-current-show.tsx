import { EnqueueFuture_Item, EnqueueFuture_Snapshot } from "@/api/generated/types"
import { __torrentSearch_selectedTorrentsAtom } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-container"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import { formatDistanceToNowSafe } from "@/lib/helpers/date"
import { displayTitle } from "@/lib/helpers/media"
import { useAtomValue } from "jotai/react"
import React from "react"
import { LuCircleCheck, LuDownload } from "react-icons/lu"

/**
 * States plainly which show the torrents below belong to.
 *
 * Working through a queue means the download UI stays put while the anime under it changes, so the
 * one question that has to be answerable at a glance — before pressing Download on a batch that
 * will land in your library — is "what am I actually torrenting right now". A title in a header bar
 * scrolls away; this does not, and it names the exact releases that are selected.
 */
export function EnqueueFutureCurrentShow({ item, snapshot }: {
    item: EnqueueFuture_Item
    snapshot: EnqueueFuture_Snapshot | undefined
}) {

    const selectedTorrents = useAtomValue(__torrentSearch_selectedTorrentsAtom)

    const media = snapshot?.entry?.media
    const title = displayTitle(media?.title) || item.title || `#${item.mediaId}`
    // Worth showing next to the preferred title: torrent names are romaji far more often than not,
    // so the alternate title is usually what you are scanning the results for.
    const altTitle = [media?.title?.romaji, media?.title?.english, media?.title?.native]
        .filter(Boolean)
        .find(t => t !== title)

    const facts = [
        media?.format,
        media?.seasonYear ? `${media.season ? `${media.season} ` : ""}${media.seasonYear}` : undefined,
        media?.episodes ? `${media.episodes} episode${media.episodes > 1 ? "s" : ""}` : undefined,
        media?.status,
    ].filter(Boolean) as string[]

    const foundCount = snapshot?.searchData?.torrents?.length ?? 0

    return (
        <div
            className="rounded-[--radius-md] border bg-gray-950 p-4 flex gap-4"
            data-enqueue-future-current-show
        >
            {media?.coverImage?.large && (
                <img
                    src={media.coverImage.extraLarge || media.coverImage.large}
                    alt=""
                    className="h-32 w-24 rounded-[--radius] object-cover flex-none"
                />
            )}

            <div className="flex-1 min-w-0 space-y-2">
                <div className="space-y-0.5">
                    <p className="text-xs uppercase tracking-wide text-[--muted] flex items-center gap-1.5">
                        <LuDownload /> Torrenting for
                    </p>
                    <h4 className="truncate">{title}</h4>
                    {altTitle && <p className="text-sm text-[--muted] truncate">{altTitle}</p>}
                </div>

                {facts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[--muted]">
                        {facts.map((fact, i) => (
                            <React.Fragment key={fact + i}>
                                {i > 0 && <span className="opacity-50">·</span>}
                                <span>{fact}</span>
                            </React.Fragment>
                        ))}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge intent={foundCount > 0 ? "gray" : "warning"} size="sm">
                        {foundCount > 0 ? `${foundCount} torrent${foundCount > 1 ? "s" : ""} found` : "No torrents found"}
                    </Badge>
                    {snapshot?.providerId && <Badge intent="gray" size="sm">via {snapshot.providerId}</Badge>}
                    {snapshot?.preparedAt && (
                        <span className="text-xs text-[--muted]">
                            prepared {formatDistanceToNowSafe(snapshot.preparedAt)}
                        </span>
                    )}
                </div>

                <SelectedTorrents torrents={selectedTorrents} />
            </div>
        </div>
    )
}

function SelectedTorrents({ torrents }: { torrents: { name: string, link: string }[] }) {
    if (!torrents.length) {
        return (
            <p className="text-sm text-[--muted] pt-1">
                Nothing selected yet — pick a release below.
            </p>
        )
    }

    return (
        <div className="space-y-1 pt-1" data-enqueue-future-selected-torrents>
            <p className="text-sm font-medium flex items-center gap-1.5">
                <LuCircleCheck className="text-[--green]" />
                Downloading {torrents.length === 1 ? "this release" : `these ${torrents.length} releases`}
            </p>
            {torrents.map(torrent => (
                <p
                    key={torrent.link}
                    className={cn("text-sm text-[--muted] truncate pl-5")}
                    title={torrent.name}
                >
                    {torrent.name}
                </p>
            ))}
        </div>
    )
}
