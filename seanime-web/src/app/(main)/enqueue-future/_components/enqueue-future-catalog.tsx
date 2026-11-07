import { formatCount } from "@/lib/helpers/number"
import { EnqueueFuture_Status } from "@/api/generated/types"
import { useStartEnqueueFutureCatalog, useStopEnqueueFutureCatalog } from "@/api/hooks/enqueue_future.hooks"
import { ConfirmationDialog, useConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { Button } from "@/components/ui/button"
import React from "react"
import { LuGlobe } from "react-icons/lu"

/** Mirrors EnqueueFutureCatalogRootID on the server. */
const CATALOG_ROOT_ID = -1

function formatWait(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000))
    return seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)}m`
}

/** What the catalog is held up on right now, if anything. */
function catalogWaitState(status: EnqueueFuture_Status | undefined, retryInMs: number): string | null {
    const catalog = status?.catalog
    if (!catalog?.active) return null
    if (retryInMs > 0) return `AniList refused the scan — trying again in ${formatWait(retryInMs)}`
    if (!catalog.waiting) return null
    if (status?.running && status.rootMediaId !== CATALOG_ROOT_ID) {
        return `Preparing waits its turn behind ${status.rootTitle || "the current run"}`
    }
    if (status?.rateLimited) return "Preparing is waiting out a rate limit"
    if (!status?.running) return "Preparing starts within a couple of minutes"
    return null
}

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

    // Both waits are minutes long, so they count down rather than sit there reading the same.
    const retryAt = catalog?.retryAt ? new Date(catalog.retryAt).getTime() : 0
    const prepareRetryAt = status?.rateLimited && status.retryAt ? new Date(status.retryAt).getTime() : 0
    const [now, setNow] = React.useState(() => Date.now())
    React.useEffect(() => {
        if (retryAt <= Date.now() && prepareRetryAt <= Date.now()) return
        const id = setInterval(() => setNow(Date.now()), 1_000)
        return () => clearInterval(id)
    }, [retryAt, prepareRetryAt])

    const waitState = catalogWaitState(status, retryAt - now)

    return (
        <div className="space-y-3 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-violet-500/[0.07] via-black/25 to-black/35 p-4 backdrop-blur-md sm:p-5" data-enqueue-future-catalog>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-10 flex-none items-center justify-center rounded-2xl bg-violet-400/15 text-violet-200 ring-1 ring-white/10">
                    <LuGlobe className="size-5" />
                </span>
                <div className="min-w-0 space-y-0.5">
                    <p className="flex items-center gap-2 font-semibold text-white">
                        All of AniList
                        {catalog?.active && !catalog.done && <span className="size-2 rounded-full bg-violet-400 animate-pulse" />}
                    </p>
                    <p className="text-sm text-[--muted]">
                        {!catalog && "Queue every anime on AniList, not just what your walks reach."}
                        {catalog && (catalog.done
                            ? `Scan finished · ${formatCount(catalog.queued)} queued`
                            : `${catalog.active ? "Scanning" : "Stopped"} · ${percent}% · ${formatCount(catalog.queued)} queued`)}
                        {catalog && catalog.prepared > 0 ? ` · ${formatCount(catalog.prepared)} prepared` : ""}
                        {catalog && catalog.waiting > 0 ? ` · ${formatCount(catalog.waiting)} waiting to be prepared` : ""}
                    </p>
                    {waitState && <p className="text-sm text-[--muted]" data-enqueue-future-catalog-wait>{waitState}</p>}
                    {catalog?.lastError && <p className="text-sm text-[--orange] break-words" data-enqueue-future-catalog-error>{catalog.lastError}</p>}
                </div>
                </div>
                {catalog?.active
                    ? <Button intent="alert-subtle" size="sm" rounded onClick={() => stop()} loading={isStopping}>Stop</Button>
                    : <Button intent="gray-outline" size="sm" rounded onClick={() => catalog ? start() : confirm.open()} loading={isStarting}>
                        {catalog?.done ? "Scan again" : catalog ? "Continue" : "Queue everything"}
                    </Button>}
            </div>

            {catalog?.active && !catalog.done && (
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-300 transition-[width] duration-500" style={{ width: `${percent}%` }} />
                </div>
            )}

            <ConfirmationDialog {...confirm} />
        </div>
    )
}
