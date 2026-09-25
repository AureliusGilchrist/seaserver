import { EnqueueFuture_Item } from "@/api/generated/types"
import { ENQUEUE_FUTURE_STATUS, useSetEnqueueFutureItemStatus } from "@/api/hooks/enqueue_future.hooks"
import { useClearDownloadingMediaState } from "@/api/hooks/torrent_client.hooks"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { Button, IconButton } from "@/components/ui/button"
import { Tooltip } from "@/components/ui/tooltip"
import React from "react"
import { LuBan, LuRotateCcw, LuSkipForward } from "react-icons/lu"
import { toast } from "sonner"

/**
 * Skip and Ignore for one queued entry.
 *
 * Both take it off the queue and differ only in what they mean, which is the distinction worth
 * having: skipping is "not this time" and ignoring is "never suggest this again". Neither deletes
 * the row — that record is what keeps the entry from turning up again the next time a
 * recommendation chain passes through it.
 */
export function EnqueueFutureItemActions({ item, compact, onDone }: {
    item: EnqueueFuture_Item | undefined
    /** Icon-only, for the queue list rows. */
    compact?: boolean
    onDone?: () => void
}) {

    const { mutate: setStatus, isPending } = useSetEnqueueFutureItemStatus(item?.mediaId)
    const { mutate: clearDownloadingState, isPending: isClearing } = useClearDownloadingMediaState(item?.mediaId)

    const title = item?.title || "This entry"

    // Only for a badge that is stuck on "downloading" with nothing behind it — a "downloaded" or
    // "matched" badge means real files or a library entry exist, and this action never touches those.
    const isStuckDownloading = item?.downloadState === "downloading"
    const isStuckDownloaded = item?.downloadState === "downloaded"

    function resetDownloadingState() {
        clearDownloadingState(undefined, {
            onSuccess: cleared => {
                if (cleared) toast.success(`${title} is no longer marked as downloading`)
            },
        })
    }

    function apply(status: string, message: string) {
        if (!item) return
        setStatus({ status }, {
            onSuccess: () => {
                toast.success(message)
                onDone?.()
            },
        })
    }

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

                        {isStuckDownloading && (
                            <Tooltip trigger={<IconButton
                                icon={<LuRotateCcw />}
                                intent="gray-basic"
                                size="sm"
                                disabled={isClearing}
                                onClick={resetDownloadingState}
                                data-enqueue-future-reset-downloading-button
                            />}>
                                Not actually downloading — clear this badge
                            </Tooltip>
                        )}
                        {isStuckDownloaded && (
                            <Tooltip trigger={<IconButton
                                icon={<LuRotateCcw />}
                                intent="gray-basic"
                                size="sm"
                                disabled={isClearing}
                                onClick={resetDownloadingState}
                                data-enqueue-future-reset-downloading-button
                            />}>
                                Not downloaded — clear this badge
                            </Tooltip>
                        )}
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

                        {isStuckDownloading && (
                            <Button
                                intent="gray-outline"
                                size="md"
                                leftIcon={<LuRotateCcw />}
                                disabled={isClearing}
                                onClick={resetDownloadingState}
                                data-enqueue-future-reset-downloading-button
                            >
                                Not downloading
                            </Button>
                        )}
                        {isStuckDownloaded && (
                            <Button
                                intent="gray-outline"
                                size="md"
                                leftIcon={<LuRotateCcw />}
                                disabled={isClearing}
                                onClick={resetDownloadingState}
                                data-enqueue-future-reset-downloading-button
                            >
                                Not downloaded
                            </Button>
                        )}
                    </>
                )}
            </div>

            <ConfirmationDialog {...ignoreConfirmation} />
        </>
    )
}
