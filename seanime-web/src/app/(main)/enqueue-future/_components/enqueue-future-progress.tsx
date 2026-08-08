import { EnqueueFuture_Status } from "@/api/generated/types"
import { useStopEnqueueFuture } from "@/api/hooks/enqueue_future.hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { ProgressBar } from "@/components/ui/progress-bar"
import React from "react"
import { LuCircleStop, LuTimer } from "react-icons/lu"

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

    const [now, setNow] = React.useState(() => Date.now())
    React.useEffect(() => {
        if (!status?.rateLimited || !status?.retryAt) return
        const id = setInterval(() => setNow(Date.now()), 1_000)
        return () => clearInterval(id)
    }, [status?.rateLimited, status?.retryAt])

    if (!status?.running) return null

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
                                {status.currentTitle ? ` · ${status.currentTitle}` : ""}
                                {status.skipped ? ` · ${status.skipped} skipped` : ""}
                                {status.failed ? ` · ${status.failed} failed` : ""}
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

            <p className="text-xs text-[--muted]">
                This runs on the server — you can close this page, or go and do something else, and it keeps going.
                It stops on its own at {status.cap} anime.
            </p>
        </div>
    )
}
