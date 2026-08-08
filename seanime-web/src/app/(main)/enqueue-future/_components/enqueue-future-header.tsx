import { EnqueueFuture_Item } from "@/api/generated/types"
import { ENQUEUE_FUTURE_STATUS } from "@/api/hooks/enqueue_future.hooks"
import { EnqueueFutureItemActions } from "@/app/(main)/enqueue-future/_components/enqueue-future-item-actions"
import { SeaLink } from "@/components/shared/sea-link"
import { Badge } from "@/components/ui/badge"
import { IconButton } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import React from "react"
import { LuChevronLeft, LuChevronRight, LuExternalLink } from "react-icons/lu"

/**
 * The bar you actually drive the queue from: where you are, what this one is, and Next.
 *
 * Deliberately one persistent strip above one persistent body rather than a modal per anime — the
 * whole point of the queue is that working through a hundred series should be a hundred clicks of
 * the same button in the same place, not a hundred dialogs to open and dismiss.
 */
export function EnqueueFutureHeader({
    item, index, total, onPrevious, onNext, isBusy, autoMatch, onAutoMatchChange,
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
}) {

    return (
        <div className="rounded-[--radius-md] border bg-gray-950 p-4 space-y-4" data-enqueue-future-header>

            <div className="flex items-center gap-4">

                <IconButton
                    icon={<LuChevronLeft />}
                    intent="gray-outline"
                    size="md"
                    onClick={onPrevious}
                    disabled={index <= 0 || isBusy}
                    data-enqueue-future-previous-button
                />

                {item?.coverImage && (
                    <img
                        src={item.coverImage}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-16 w-12 rounded-[--radius] object-cover flex-none"
                    />
                )}

                <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-[--muted] tabular-nums flex-none">
                            {total > 0 ? `${index + 1} / ${total}` : "0 / 0"}
                        </span>
                        <h4 className="truncate">{item?.title || "Nothing queued"}</h4>
                        {item?.status === ENQUEUE_FUTURE_STATUS.NO_RESULTS && (
                            <Badge intent="warning" size="sm">No results</Badge>
                        )}
                    </div>
                    {item && (
                        <div className="flex items-center gap-3 text-sm text-[--muted]">
                            <span>{item.depth > 0 ? `${item.depth} hop${item.depth > 1 ? "s" : ""} out` : "Direct recommendation"}</span>
                            <SeaLink
                                href={`/entry?id=${item.mediaId}`}
                                className="inline-flex items-center gap-1 hover:text-[--foreground]"
                            >
                                <LuExternalLink /> Open its page
                            </SeaLink>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-none">
                    <EnqueueFutureItemActions item={item} />

                    <IconButton
                        icon={<LuChevronRight />}
                        intent="white"
                        size="md"
                        onClick={onNext}
                        disabled={index >= total - 1 || isBusy}
                        data-enqueue-future-next-button
                    />
                </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-3">
                <Switch
                    label="Match automatically when finished"
                    help="Set per show, not for the whole queue — turn it on for this one and it goes straight into your library when it completes; leave it off and it waits in the Unmatched screen for you to review. You'll be asked to confirm once."
                    value={autoMatch}
                    onValueChange={onAutoMatchChange}
                    data-enqueue-future-auto-match-switch
                />
            </div>
        </div>
    )
}
