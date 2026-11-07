import { formatNumber, formatCount } from "@/lib/helpers/number"
import { EnqueueFuture_Item, EnqueueFuture_Snapshot } from "@/api/generated/types"
import { __torrentSearch_selectedTorrentsAtom } from "@/app/(main)/entry/_containers/torrent-search/torrent-search-container"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { formatDistanceToNowSafe } from "@/lib/helpers/date"
import { displayTitle } from "@/lib/helpers/media"
import { useAtomValue } from "jotai/react"
import React from "react"
import { LuCircleCheck, LuDownload, LuPencil } from "react-icons/lu"

/**
 * States plainly which show the torrents below belong to.
 *
 * Working through a queue means the download UI stays put while the anime under it changes, so the
 * one question that has to be answerable at a glance — before pressing Download on a batch that
 * will land in your library — is "what am I actually torrenting right now". A title in a header bar
 * scrolls away; this does not, and it names the exact releases that are selected.
 */
export function EnqueueFutureCurrentShow({ item, snapshot, onEditSearch }: {
    item: EnqueueFuture_Item
    snapshot: EnqueueFuture_Snapshot | undefined
    onEditSearch: () => void
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
        media?.episodes ? `${formatNumber(media.episodes)} episode${media.episodes > 1 ? "s" : ""}` : undefined,
        media?.status,
    ].filter(Boolean) as string[]

    const foundCount = snapshot?.searchData?.torrents?.length ?? 0
    const cover = media?.coverImage?.extraLarge || media?.coverImage?.large
    const backdrop = media?.bannerImage || cover

    return (
        <div
            className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-black/40 shadow-xl shadow-black/20"
            data-enqueue-future-current-show
        >
            {/* The show's own art, sharp, behind the card: the clearest possible answer to
                "which anime is this" without reading anything. The gradient below fades it out
                behind the text. */}
            {backdrop && (
                <div
                    className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-60"
                    style={{ backgroundImage: `url(${backdrop})` }}
                    aria-hidden
                />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/10" aria-hidden />
            {/* The queue list marks its highlighted rows with a brand edge; the card that states what
                those rows are about carries the same one. */}
            <div className="absolute inset-y-0 left-0 w-1 bg-[--brand]" />

            <div className="relative flex gap-4 p-4 sm:gap-5 sm:p-5">
                {cover && (
                    <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-36 w-24 flex-none rounded-2xl object-cover shadow-2xl ring-1 ring-white/15 sm:h-40 sm:w-28"
                    />
                )}

                <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="space-y-0.5">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">
                            <LuDownload /> Torrenting for
                        </p>
                        <h4 className="truncate text-xl font-bold text-white sm:text-2xl">{title}</h4>
                        {altTitle && <p className="truncate text-sm text-white/55">{altTitle}</p>}
                    </div>

                    {facts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {facts.map((fact, i) => (
                                <span key={fact + i} className="rounded-full bg-white/[0.08] px-2.5 py-0.5 text-xs font-medium text-white/80 ring-1 ring-white/10">
                                    {fact.replace(/_/g, " ")}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                            foundCount > 0 ? "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25" : "bg-amber-400/10 text-amber-200 ring-amber-300/25",
                        )}>
                            {foundCount > 0 ? `${foundCount} torrent${foundCount > 1 ? "s" : ""} found` : "No torrents found"}
                        </span>
                        {snapshot?.providerId && (
                            <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs text-white/70 ring-1 ring-white/10">via {snapshot.providerId}</span>
                        )}
                        {snapshot?.preparedAt && (
                            <span className="text-xs text-white/45">
                                prepared {formatDistanceToNowSafe(snapshot.preparedAt)}
                            </span>
                        )}

                        {/* The prepared search is built from AniList's metadata, which is right until
                            it isn't — a title the provider indexes under some other name, a bad match.
                            This drops to a plain text box so the query can be typed by hand. */}
                        <Button
                            intent="gray-subtle"
                            size="xs"
                            rounded
                            leftIcon={<LuPencil />}
                            onClick={onEditSearch}
                            data-enqueue-future-edit-search-button
                        >
                            Edit search
                        </Button>
                    </div>

                    <SelectedTorrents torrents={selectedTorrents} />
                </div>
            </div>
        </div>
    )
}

function SelectedTorrents({ torrents }: { torrents: { name: string, link: string }[] }) {
    if (!torrents.length) {
        return (
            <p className="text-sm text-white/45">
                Nothing selected yet — pick a release below.
            </p>
        )
    }

    return (
        <div className="space-y-1 rounded-2xl bg-emerald-400/[0.06] p-2.5 ring-1 ring-emerald-300/15" data-enqueue-future-selected-torrents>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-100">
                <LuCircleCheck className="text-[--green]" />
                Downloading {torrents.length === 1 ? "this release" : `these ${formatCount(torrents.length)} releases`}
            </p>
            {torrents.map(torrent => (
                <p
                    key={torrent.link}
                    className="truncate pl-5 text-xs text-white/60"
                    title={torrent.name}
                >
                    {torrent.name}
                </p>
            ))}
        </div>
    )
}
