import { EnqueueFuture_Item } from "@/api/generated/types"
import { ENQUEUE_FUTURE_STATUS, useSetEnqueueFutureItemStatus } from "@/api/hooks/enqueue_future.hooks"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { Button, IconButton } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"
import React from "react"
import { LuBan, LuSkipForward } from "react-icons/lu"
import { toast } from "sonner"

/**
 * Skip and Ignore for one queued entry.
 *
 * Both take it off the queue and differ only in what they mean, which is the distinction worth
 * having: skipping is "not this time" and ignoring is "never suggest this again". Neither deletes
 * the row — that record is what keeps the entry from turning up again the next time a
 * recommendation chain passes through it.
 *
 * Strictly one entry at a time. Seasons of the same show are drawn together in the list, but that
 * is presentation: skipping season 1 says nothing about season 2, and acting on a whole franchise
 * at once is never what a button here does.
 *
 * The same component serves the list rows and the header so the two can never drift apart, and so
 * that acting on an entry never requires navigating to it first.
 */
export function EnqueueFutureItemActions({ item, compact, onDone }: {
    item: EnqueueFuture_Item | undefined
    /** Icon-only, for the queue list rows. */
    compact?: boolean
    onDone?: () => void
}) {

    const { mutate: setStatus, isPending } = useSetEnqueueFutureItemStatus(item?.mediaId)

    const title = item?.title || "This entry"

    function apply(status: string, message: string) {
        if (!item) return
        setStatus({ status }, {
            onSuccess: () => {
                toast.success(message)
                onDone?.()
            },
        })
    }

    // Ignoring is the one decision here that is meant to stick, so it asks first — and names the
    // entry, because on a list of a hundred covers the wrong row is easy to hit, and seasons of the
    // same show sit right next to each other.
    const ignoreConfirmation = useConfirmationDialog({
        title: "Ignore this entry?",
        description: `${title} will be removed from the queue and won't be suggested again, even if other anime keep recommending it. Only this entry — any other seasons stay in the queue, and nothing already downloaded is affected.`,
        actionText: "Ignore it",
        actionIntent: "alert-subtle",
        onConfirm: () => apply(ENQUEUE_FUTURE_STATUS.IGNORED, `Ignoring ${title}`),
    })

    if (!item) return null

    return (
        <>
            <div
                className="flex items-center gap-1 flex-none"
                // Rows are buttons themselves, so keep a click on these from also selecting the row.
                onClick={e => e.stopPropagation()}
                data-enqueue-future-item-actions
            >
                {compact ? (
                    <>
                        <Tooltip trigger={<IconButton
                            icon={<LuSkipForward />}
                            intent="gray-basic"
                            size="sm"
                            disabled={isPending}
                            onClick={() => apply(ENQUEUE_FUTURE_STATUS.SKIPPED, `Skipped ${title}`)}
                            data-enqueue-future-skip-button
                        />}>
                            Skip for now
                        </Tooltip>

                        <Tooltip trigger={<IconButton
                            icon={<LuBan />}
                            intent="alert-basic"
                            size="sm"
                            disabled={isPending}
                            onClick={ignoreConfirmation.open}
                            data-enqueue-future-ignore-button
                        />}>
                            Ignore this entry
                        </Tooltip>
                    </>
                ) : (
                    <>
                        <Button
                            intent="gray-outline"
                            size="md"
                            leftIcon={<LuSkipForward />}
                            disabled={isPending}
                            onClick={() => apply(ENQUEUE_FUTURE_STATUS.SKIPPED, `Skipped ${title}`)}
                            data-enqueue-future-skip-button
                        >
                            Skip
                        </Button>

                        <Button
                            intent="alert-subtle"
                            size="md"
                            leftIcon={<LuBan />}
                            disabled={isPending}
                            onClick={ignoreConfirmation.open}
                            data-enqueue-future-ignore-button
                        >
                            Ignore this entry
                        </Button>
                    </>
                )}
            </div>

            <ConfirmationDialog {...ignoreConfirmation} />
        </>
    )
}
