import { EnqueueFuture_Status } from "@/api/generated/types"
import {
    useClearEnqueueFuturePendingRoots,
    useRemoveEnqueueFuturePendingRoot,
    useResumeEnqueueFuture,
    useStopEnqueueFuture,
} from "@/api/hooks/enqueue_future.hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { ProgressBar } from "@/components/ui/progress-bar"
import React from "react"
import { LuCircleStop, LuPlay, LuTimer, LuX } from "react-icons/lu"

/**
 * What the background run is doing, if anything.
 *
 * It is worth showing plainly rather than as a spinner, because the two states people will actually
 * hit — "working through the graph" and "waiting out a rate limit" — look identical otherwise, and
 * the second one can last minutes. Saying which, and how long, is the difference between a queue
 * that seems stuck and one that is visibly still going.
 */
export function EnqueueFutureProgress({ status }: { status: EnqueueFuture_Status | undefined }) {
    const { mutate: stop, isPending: isStopping } = useStopEnqueueFuture()
    const { mutate: resume, isPending: isResuming } = useResumeEnqueueFuture()
    const { mutate: removeRoot, isPending: isRemovingRoot } = useRemoveEnqueueFuturePendingRoot()
    const { mutate: clearRoots, isPending: isClearingRoots } = useClearEnqueueFuturePendingRoots()

    const [now, setNow] = React.useState(() => Date.now())
    React.useEffect(() => {
        if (!status?.rateLimited || !status?.retryAt) return
        const id = setInterval(() => setNow(Date.now()), 1_000)
        return () => clearInterval(id)
    }, [status?.rateLimited, status?.retryAt])

    // A run that ended with something to say says it. Silence here is what made a failed run and a
    // run that never started look the same from the outside.
    if (!status?.running && status?.lastError && !status?.resumable) {
        return (
            <div
                className="rounded-[--radius-md] border border-[--orange] bg-[--orange]/5 p-4"
                data-enqueue-future-progress
            >
                <p className="font-semibold">Stopped{status.rootTitle ? ` — ${status.rootTitle}` : ""}</p>
                <p className="text-sm text-[--muted]">{status.lastError}</p>
            </div>
        )
    }

    // A stopped run that still has a progress record can be picked up exactly where it was — worth
    // offering plainly, since otherwise the only obvious move is to enqueue from scratch.
    if (!status?.running) {
        if (!status?.resumable) return null
        return (
            <div className="rounded-[--radius-md] border p-4 flex items-center justify-between gap-4" data-enqueue-future-progress>
                <div className="space-y-0.5">
                    <p className="font-semibold">Paused{status.rootTitle ? ` — ${status.rootTitle}` : ""}</p>
                    <p className="text-sm text-[--muted]">
                        {status.prepared} of {status.discovered} were ready when it stopped. It'll carry on from there.
                    </p>
                </div>
                <Button
                    intent="white"
                    size="sm"
                    leftIcon={<LuPlay />}
                    onClick={() => resume()}
                    loading={isResuming}
                    data-enqueue-future-resume-button
                >
                    Resume
                </Button>
            </div>
        )
    }

    const discovered = status.discovered || 0
    const done = (status.prepared || 0) + (status.failed || 0)
    const percent = discovered > 0 ? Math.min(100, Math.round((done / discovered) * 100)) : 0

    const retryInSeconds = status.retryAt
        ? Math.max(0, Math.ceil((new Date(status.retryAt).getTime() - now) / 1000))
        : 0

    return (
        <div
            className={cn(
                "rounded-[--radius-md] border p-4 space-y-3",
                status.rateLimited ? "border-[--orange] bg-[--orange]/5" : "bg-gray-950",
            )}
            data-enqueue-future-progress
        >
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                    <p className="font-semibold">
                        {status.rateLimited
                            ? "Waiting out a rate limit"
                            : `Preparing${status.rootTitle ? ` from ${status.rootTitle}` : ""}`}
                    </p>
                    <p className="text-sm text-[--muted]">
                        {status.rateLimited ? (
                            <span className="flex items-center gap-1.5">
                                <LuTimer />
                                Retrying in {retryInSeconds}s — step {status.backoffRung}/{status.backoffRungs},
                                attempt {status.backoffAttempt} of 3
                            </span>
                        ) : (
                            <>
                                {status.prepared} of {status.discovered} ready
                                {status.families ? ` · ${status.families}/${status.cap} series` : ""}
                                {status.currentTitle ? ` · ${status.currentTitle}` : ""}
                                {status.skipped ? ` · ${status.skipped} skipped` : ""}
                                {status.failed ? ` · ${status.failed} failed` : ""}
                                {/* Queued behind this one. Without it the screen looks idle while
                                    several anime sit waiting on a list nobody can see. */}
                                {status.pendingRoots ? ` · ${status.pendingRoots} waiting after this` : ""}
                            </>
                        )}
                    </p>
                </div>

                <Button
                    intent="alert-subtle"
                    size="sm"
                    leftIcon={<LuCircleStop />}
                    onClick={() => stop()}
                    loading={isStopping}
                >
                    Stop
                </Button>
            </div>

            <ProgressBar value={percent} size="sm" />

            {/* What is queued behind this run, in the order it will be walked.
              *
              * A count alone ("3 waiting") tells you something is coming but not what, which for
              * work measured in hours is the wrong half of the information: the question is whether
              * the thing you queued an hour ago is still in there and how far down it is. */}
            {!!status.pendingRootList?.length && (
                <div className="space-y-1 pt-1" data-enqueue-future-pending-roots>
                    <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">
                        Waiting to be walked ({status.pendingRootList.length})
                    </p>
                    <ol className="space-y-1">
                        {status.pendingRootList.map((root, i) => (
                            <li
                                key={root.mediaId}
                                className="group/root flex items-center gap-2 rounded-[--radius] border border-gray-800/80 bg-gray-950/40 px-2.5 py-1.5"
                            >
                                <span className="text-[10px] font-semibold text-[--muted] w-5 flex-none tabular-nums">
                                    {i + 1}.
                                </span>
                                <span className="text-sm truncate flex-1 min-w-0">
                                    {root.title || `#${root.mediaId}`}
                                </span>
                                <span className="text-[10px] text-[--muted] flex-none">
                                    {i === 0 ? "next" : "queued"}
                                </span>
                                {/* Queueing something is one click, so unqueueing it should be too.
                                    Hidden until the row is touched, so a list of twenty is a list
                                    rather than a column of buttons. */}
                                <button
                                    onClick={() => removeRoot({ mediaId: root.mediaId })}
                                    disabled={isRemovingRoot}
                                    title="Remove from the waiting list"
                                    aria-label={`Remove ${root.title || root.mediaId} from the waiting list`}
                                    className={cn(
                                        "flex-none p-0.5 rounded text-[--muted] transition",
                                        "opacity-0 group-hover/root:opacity-100 focus-visible:opacity-100",
                                        "hover:text-white hover:bg-white/10",
                                    )}
                                    data-enqueue-future-remove-root
                                >
                                    <LuX className="w-3.5 h-3.5" />
                                </button>
                            </li>
                        ))}
                    </ol>

                    {/* The re-walk backlog, counted rather than listed. It is hundreds of entries by
                        nature, and it only runs when the list above is empty — so what matters about
                        it is that it exists and how much is left, not which franchise is 148th. */}
                    {!!status.rewalkBacklog && (
                        <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-[--muted]">
                            <span>{status.rewalkBacklog} franchise{status.rewalkBacklog === 1 ? "" : "s"} queued to be walked again — after the list above</span>
                            <Button
                                size="xs"
                                intent="gray-basic"
                                onClick={() => clearRoots()}
                                loading={isClearingRoots}
                                data-enqueue-future-clear-roots
                            >
                                Cancel re-walk
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <p className="text-xs text-[--muted]">
                This runs on the server — you can close this page, or go and do something else, and it keeps going.
                It stops taking on new series at {status.cap}; a show and all of its seasons count as one, and once a
                series is in, the rest of it comes along regardless.
            </p>
        </div>
    )
}
