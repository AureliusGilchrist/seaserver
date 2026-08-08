import { EnqueueFuture_Status } from "@/api/generated/types"
import { useResumeEnqueueFuture, useStopEnqueueFuture } from "@/api/hooks/enqueue_future.hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { ProgressBar } from "@/components/ui/progress-bar"
import React from "react"
import { LuCircleStop, LuPlay, LuTimer } from "react-icons/lu"

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

    const [now, setNow] = React.useState(() => Date.now())
    React.useEffect(() => {
        if (!status?.rateLimited || !status?.retryAt) return
        const id = setInterval(() => setNow(Date.now()), 1_000)
        return () => clearInterval(id)
    }, [status?.rateLimited, status?.retryAt])

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
                It stops taking on new series at {status.cap}; a show and all of its seasons count as one, and once a
                series is in, the rest of it comes along regardless.
            </p>
        </div>
    )
}
