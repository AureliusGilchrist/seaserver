import { cachedImageUrl } from "@/lib/server/assets"
import { formatNumber } from "@/lib/helpers/number"
import { EnqueueFuture_Item } from "@/api/generated/types"
import { ENQUEUE_FUTURE_STATUS } from "@/api/hooks/enqueue_future.hooks"
import { EnqueueFutureItemActions } from "@/app/(main)/enqueue-future/_components/enqueue-future-item-actions"
import { SeaLink } from "@/components/shared/sea-link"
import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import React from "react"
import { LuChevronLeft, LuChevronRight, LuExternalLink, LuGitFork } from "react-icons/lu"

/**
 * The bar you actually drive the queue from: where you are, what this one is, and Next.
 *
 * Deliberately one persistent strip above one persistent body rather than a modal per anime — the
 * whole point of the queue is that working through a hundred series should be a hundred clicks of
 * the same button in the same place, not a hundred dialogs to open and dismiss.
 */
export function EnqueueFutureHeader({
    item, index, total, onPrevious, onNext, isBusy, autoMatch, onAutoMatchChange,
    useConfiguredProvider, onUseConfiguredProviderChange,
}: {
    item: EnqueueFuture_Item | undefined
    index: number
    total: number
    onPrevious: () => void
    onNext: () => void
    isBusy?: boolean
    /** This anime's own auto-match choice — see the note in the queue container. */
    autoMatch: boolean
    onAutoMatchChange: (value: boolean) => void
    /** Search with the saved default provider only, instead of trying SeaDex first. */
    useConfiguredProvider: boolean
    onUseConfiguredProviderChange: (value: boolean) => void
}) {

    const progress = total > 0 && index >= 0 ? ((index + 1) / total) * 100 : 0

    return (
        <div
            className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/30 to-black/40 shadow-xl shadow-black/20 backdrop-blur-md"
            data-enqueue-future-header
        >
            {/* Where in the queue this one is, as a line along the top. */}
            <div className="h-1 bg-white/[0.05]">
                <div className="h-full bg-gradient-to-r from-brand-500 to-brand-300 transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>

            <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">

                <IconButton
                    icon={<LuChevronLeft />}
                    intent="gray-outline"
                    size="md"
                    rounded
                    onClick={onPrevious}
                    disabled={index <= 0 || isBusy}
                    data-enqueue-future-previous-button
                />

                {item?.coverImage && (
                    <img
                        src={cachedImageUrl(item.coverImage)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-20 w-14 flex-none rounded-xl object-cover shadow-lg ring-1 ring-white/10"
                    />
                )}

                <div className="min-w-[12rem] flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="flex-none rounded-full bg-white/[0.08] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white/80 ring-1 ring-white/10">
                            {total > 0 ? `${formatNumber(index + 1)} / ${formatNumber(total)}` : "0 / 0"}
                        </span>
                        {item?.status === ENQUEUE_FUTURE_STATUS.NO_RESULTS && (
                            <Badge intent="warning" size="sm">No results</Badge>
                        )}
                    </div>
                    <h4 className="truncate text-lg font-bold text-white sm:text-xl">{item?.title || "Nothing queued"}</h4>
                    {item && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[--muted]">
                            <span className="inline-flex items-center gap-1">
                                <LuGitFork className="size-3.5" />
                                {item.depth > 0 ? `${item.depth} hop${item.depth > 1 ? "s" : ""} out` : "Direct recommendation"}
                            </span>
                            <SeaLink
                                href={`/entry?id=${item.mediaId}`}
                                className="inline-flex items-center gap-1 hover:text-[--foreground]"
                            >
                                <LuExternalLink /> Open its page
                            </SeaLink>
                        </div>
                    )}
                </div>

                <div className="flex flex-none items-center gap-2">
                    <EnqueueFutureItemActions item={item} />
                    <IconButton
                        icon={<LuChevronRight />}
                        intent="white"
                        size="md"
                        rounded
                        onClick={onNext}
                        disabled={index >= total - 1 || isBusy}
                        data-enqueue-future-next-button
                    />
                </div>
            </div>

            <div className="grid gap-2 border-t border-white/[0.06] p-3 sm:grid-cols-2 sm:p-4">
                <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/[0.06]">
                    <Switch
                        label="Match automatically when finished"
                        help="Set per show, not for the whole queue — turn it on for this one and it goes straight into your library when it completes; leave it off and it waits in the Unmatched screen for you to review. You'll be asked to confirm once."
                        value={autoMatch}
                        onValueChange={onAutoMatchChange}
                        data-enqueue-future-auto-match-switch
                    />
                </div>
                <div className="rounded-2xl bg-black/25 p-3 ring-1 ring-white/[0.06]">
                    <Switch
                        label="Default provider only"
                        help="Searches only the Default Provider set in Settings → Torrent — SeaDex if that's what it's set to, AnimeTosho if not. Off: SeaDex is searched first, and your Default Provider is only tried when SeaDex has nothing."
                        value={useConfiguredProvider}
                        onValueChange={onUseConfiguredProviderChange}
                        data-enqueue-future-configured-provider-switch
                    />
                </div>
            </div>
        </div>
    )
}
