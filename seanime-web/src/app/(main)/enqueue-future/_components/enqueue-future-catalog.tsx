import { EnqueueFuture_Status } from "@/api/generated/types"
import { useStartEnqueueFutureCatalog, useStopEnqueueFutureCatalog } from "@/api/hooks/enqueue_future.hooks"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/ui/progress-bar"
import React from "react"
import { LuGlobe } from "react-icons/lu"

/**
 * Queueing the whole of AniList, as opposed to what one anime leads to.
 *
 * Started by hand and behind a confirmation, because it is weeks of background work and gigabytes of
 * stored results. Anything enqueued from an anime page still goes first.
 */
export function EnqueueFutureCatalog({ status }: { status: EnqueueFuture_Status | undefined }) {
    const { mutate: start, isPending: isStarting } = useStartEnqueueFutureCatalog()
    const { mutate: stop, isPending: isStopping } = useStopEnqueueFutureCatalog()
    const confirm = useConfirmationDialog({
        title: "Queue all of AniList?",
        description: "This prepares about 20,000 anime in the background, which takes weeks and can use several gigabytes on the server. "
            + "Nothing is downloaded. Anything you enqueue yourself still goes first, and you can stop it at any time.",
        actionText: "Queue everything",
        actionIntent: "primary",
        onConfirm: () => start(),
    })

    const catalog = status?.catalog
    const percent = catalog?.maxId ? Math.min(100, Math.round(((catalog.nextId - 1) / catalog.maxId) * 100)) : 0

    return (
        <div className="rounded-[--radius-md] border bg-gray-950 p-4 space-y-3" data-enqueue-future-catalog>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                    <p className="font-semibold flex items-center gap-2"><LuGlobe className="flex-none" /> All of AniList</p>
                    <p className="text-sm text-[--muted]">
                        {!catalog && "Queue every anime on AniList, not just what your walks reach."}
                        {catalog && (catalog.done
                            ? `Scan finished · ${catalog.queued} queued`
                            : `${catalog.active ? "Scanning" : "Stopped"} · ${percent}% · ${catalog.queued} queued`)}
                        {catalog && catalog.waiting > 0 ? ` · ${catalog.waiting} waiting to be prepared` : ""}
                        {catalog?.lastError ? ` · ${catalog.lastError}` : ""}
                    </p>
                </div>
                {catalog?.active
                    ? <Button intent="alert-subtle" size="sm" onClick={() => stop()} loading={isStopping}>Stop</Button>
                    : <Button intent="gray-outline" size="sm" onClick={() => catalog ? start() : confirm.open()} loading={isStarting}>
                        {catalog?.done ? "Scan again" : catalog ? "Continue" : "Queue everything"}
                    </Button>}
            </div>

            {catalog?.active && !catalog.done && <ProgressBar value={percent} size="sm" />}

            <ConfirmationDialog {...confirm} />
        </div>
    )
}
