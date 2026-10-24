import { EnqueueFuture_Status } from "@/api/generated/types"
import {
    useClearEnqueueFuturePendingRoots,
    useClearEnqueueFutureRewalkBacklog,
    useRemoveEnqueueFuturePendingRoot,
    useResumeEnqueueFuture,
    useStopEnqueueFuture,
} from "@/api/hooks/enqueue_future.hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { ProgressBar } from "@/components/ui/progress-bar"
import React from "react"
import { LuChevronDown, LuCircleStop, LuPlay, LuTimer, LuX } from "react-icons/lu"

/** Mirrors MaxPendingRoots on the server, so the header can say how much room is left. */
const MAX_PENDING_ROOTS = 20

/** How many waiting rows are rendered at a time; the rest come in on request. */
const PENDING_ROOTS_PAGE = 6

/**
 * A rough estimate of when this run will have prepared everything it has discovered.
 *
 * The run itself reports no ETA, so this is worked out from what the screen can see: samples of
 * (when, how much was done) are kept, the rate is the median of the intervals between them — the
 * median because a rate limit or a large franchise produces one slow interval that would drag a
 * mean out — and the remaining work is divided by it.
 *
 * It is a guess and it is allowed to be wrong: a run discovers more anime as it goes, so "remaining"
 * grows mid-flight and the estimate follows it. It only claims to answer "is this going to be hours
 * or days", not "minutes". Nothing shows until two intervals exist, so a just-started run shows
 * nothing rather than nonsense.
 */
function useEta(done: number, discovered: number, paused: boolean): string | null {
    // Sample history survives re-renders but is reset when the run changes identity — keyed to the
    // run, not the component, by resetting whenever `paused` flips or the totals shrink (a new run).
    const samplesRef = React.useRef<{ at: number, done: number }[]>([])
    const lastKeyRef = React.useRef<string>("")
    const [now, setNow] = React.useState(() => Date.now())

    const key = paused ? "paused" : "running"
    React.useEffect(() => {
        if (lastKeyRef.current !== key) {
            samplesRef.current = []
            lastKeyRef.current = key
        }
    }, [key])

    React.useEffect(() => {
        if (paused) return
        const id = setInterval(() => setNow(Date.now()), 30_000)
        return () => clearInterval(id)
    }, [paused])

    React.useEffect(() => {
        if (paused || done <= 0) return
        const samples = samplesRef.current
        const last = samples[samples.length - 1]
        // One sample per distinct total, not one per poll — a stalled run polls the same total
        // repeatedly and would otherwise record a zero-width interval.
        if (last && last.done === done) return
        samples.push({ at: Date.now(), done })
        if (samples.length > 12) samples.shift()
    }, [done, paused])

    const remaining = discovered - done
    if (remaining <= 0) return null

    const samples = samplesRef.current
    if (samples.length < 3) return null // need at least two intervals to have a median

    const intervals: number[] = []
    for (let i = 1; i < samples.length; i++) {
        const dt = samples[i].at - samples[i - 1].at
        const dd = samples[i].done - samples[i - 1].done
        if (dt > 0 && dd > 0) intervals.push(dt / dd)
    }
    if (intervals.length < 2) return null
    intervals.sort((a, b) => a - b)
    const medianMs = intervals[Math.floor(intervals.length / 2)]

    const ms = medianMs * remaining
    const minutes = Math.round(ms / 60_000)
    if (minutes < 1) return null
    if (minutes < 60) return `~${minutes}m left`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `~${hours}h ${minutes % 60}m left`
    const days = Math.floor(hours / 24)
    return `~${days}d ${hours % 24}h left`
}

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
    const { mutate: clearRewalk, isPending: isClearingRewalk } = useClearEnqueueFutureRewalkBacklog()

    // The waiting list is rendered a page at a time rather than all twenty at once — the rows
    // below the sixth are only worth their space once someone asks for them.
    const [visibleRoots, setVisibleRoots] = React.useState(PENDING_ROOTS_PAGE)

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

    // Paused while rate-limited: the clock the estimate runs on stops, because no work is.
    const eta = useEta(done, discovered, !!status.rateLimited)

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
                                {eta ? <> · {eta}</> : ""}
                                {status.families ? ` · ${status.families} series` : ""}
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
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[--muted] uppercase tracking-wider">
                            Waiting to be walked ({status.pendingRootList.length}/{MAX_PENDING_ROOTS})
                        </p>
                        {/* Empties this list and only this list. The re-walk backlog underneath it
                            has its own button, and the walk in progress is not interrupted by
                            either — clearing what comes next is not the same as stopping what is
                            happening now. */}
                        <Button
                            size="xs"
                            intent="alert-subtle"
                            onClick={() => clearRoots()}
                            loading={isClearingRoots}
                            data-enqueue-future-clear-roots
                        >
                            Clear branching queue
                        </Button>
                    </div>
                    <ol className="space-y-1">
                        {status.pendingRootList.slice(0, visibleRoots).map((root, i) => (
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

                    {/* Everything past the first page stays unrendered until it is asked for, and
                        folds back up afterwards so the list returns to a glanceable size. */}
                    {status.pendingRootList.length > PENDING_ROOTS_PAGE && (
                        <div className="flex items-center gap-2 pt-0.5">
                            {visibleRoots < status.pendingRootList.length && (
                                <button
                                    onClick={() => setVisibleRoots(n => n + PENDING_ROOTS_PAGE)}
                                    className="text-[10px] font-semibold text-[--muted] hover:text-white transition"
                                    data-enqueue-future-show-more-roots
                                >
                                    Show {Math.min(PENDING_ROOTS_PAGE, status.pendingRootList.length - visibleRoots)} more
                                </button>
                            )}
                            {visibleRoots > PENDING_ROOTS_PAGE && (
                                <button
                                    onClick={() => setVisibleRoots(PENDING_ROOTS_PAGE)}
                                    className="text-[10px] font-semibold text-[--muted] hover:text-white transition"
                                    data-enqueue-future-show-fewer-roots
                                >
                                    Show fewer
                                </button>
                            )}
                        </div>
                    )}

                    {/* The re-walk backlog, counted rather than listed. It is hundreds of entries by
                        nature, and it only runs when the list above is empty — so what matters about
                        it is that it exists and how much is left, not which franchise is 148th. */}
                    {!!status.rewalkBacklog && (
                        <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-[--muted]">
                            <span>{status.rewalkBacklog} franchise{status.rewalkBacklog === 1 ? "" : "s"} queued to be walked again — after the list above</span>
                            <Button
                                size="xs"
                                intent="gray-basic"
                                onClick={() => clearRewalk()}
                                loading={isClearingRewalk}
                                data-enqueue-future-clear-rewalk
                            >
                                Cancel re-walk
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {/* The run keeps going without this page open, which used to be a permanent paragraph
                of small print under the progress bar. It is true once and then in the way, so it is
                a line you can open rather than one you scroll past. */}
            <details className="group/progress-help text-xs text-[--muted]" data-enqueue-future-progress-help>
                <summary className="cursor-pointer select-none hover:text-[--foreground] transition list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                    <LuChevronDown className="transition-transform group-open/progress-help:rotate-180 flex-none" />
                    How this run works
                </summary>
                <p className="pt-2 pl-5">
                    This runs on the server — you can close this page, or go and do something else, and it keeps going.
                    It has no limit on how much it takes on: it keeps walking until it runs out of shows to find, and once
                    a series is in, the rest of it comes along regardless. Stop it any time — everything prepared so far
                    stays in the queue.
                </p>
            </details>
        </div>
    )
}
