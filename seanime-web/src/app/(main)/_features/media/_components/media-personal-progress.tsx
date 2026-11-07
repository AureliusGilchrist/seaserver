"use client"

import { LuBookOpen, LuCircleCheck, LuClapperboard, LuStar } from "react-icons/lu"

type Props = {
    type: "anime" | "manga"
    progress?: number
    total?: number | null
    score?: number
    status?: string
    fillerCount?: number
    fillerTaggedCount?: number
    fillerCoverageTotal?: number | null
}

const LIST_STATUS_LABELS: Record<string, string> = {
    CURRENT: "In progress",
    PLANNING: "Planned",
    COMPLETED: "Completed",
    PAUSED: "Paused",
    DROPPED: "Dropped",
    REPEATING: "Rewatching",
}

export function MediaPersonalProgress({
    type,
    progress,
    total,
    score,
    status,
    fillerCount,
    fillerTaggedCount,
    fillerCoverageTotal,
}: Props) {
    const hasProgress = progress != null
    const hasFillerData = type === "anime" && (fillerTaggedCount ?? 0) > 0
    const clampedProgress = hasProgress && total && total > 0
        ? Math.min(progress, total)
        : undefined
    const completion = clampedProgress != null && total
        ? Math.round((clampedProgress / total) * 100)
        : undefined
    const fillerPercent = hasFillerData
        ? Math.round(((fillerCount ?? 0) / fillerTaggedCount!) * 100)
        : undefined

    if (!hasProgress && !score && !status && !hasFillerData) return null

    return (
        <div className="grid w-full gap-2 sm:grid-cols-2" data-media-personal-progress>
            {(hasProgress || !!score || !!status) && (
                <section className="min-w-0 rounded-2xl bg-black/35 px-3.5 py-3 ring-1 ring-white/10 backdrop-blur-md">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                            {type === "anime" ? <LuClapperboard className="size-3.5" /> : <LuBookOpen className="size-3.5" />}
                            Your {type === "anime" ? "watch" : "reading"} progress
                        </p>
                        {!!status && <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-medium text-white/70">
                            {LIST_STATUS_LABELS[status] ?? status}
                        </span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        {hasProgress && <p className="text-sm font-semibold tabular-nums text-white/90">
                            {progress!.toLocaleString()}
                            {total != null && total > 0 && <span className="font-normal text-white/45"> / {total.toLocaleString()}</span>}
                            <span className="ml-1.5 text-xs font-normal text-white/50">{type === "anime" ? "episodes watched" : "chapters read"}</span>
                        </p>}
                        {!!score && <p className="flex items-center gap-1 text-xs font-medium text-amber-100">
                            <LuStar className="size-3.5 text-amber-300" /> Your score {(score / 10).toFixed(1)} / 10
                        </p>}
                    </div>
                    {completion != null && <div className="mt-2 flex items-center gap-2">
                        <div
                            role="progressbar"
                            aria-label={`${type === "anime" ? "Episodes watched" : "Chapters read"}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={completion}
                            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"
                        >
                            <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-sky-300" style={{ width: `${completion}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-white/50">{completion}%</span>
                        {!!total && progress! >= total && <LuCircleCheck aria-label="Complete" className="size-3.5 text-emerald-300" />}
                    </div>}
                </section>
            )}

            {hasFillerData && <section
                className="min-w-0 rounded-2xl bg-black/35 px-3.5 py-3 ring-1 ring-white/10 backdrop-blur-md"
                title={`Filler share is calculated from ${fillerTaggedCount!.toLocaleString()} episodes with known filler metadata.`}
                data-anime-filler-summary
            >
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    <LuClapperboard className="size-3.5" /> Filler episodes
                </p>
                <p className="mt-2 text-sm font-semibold tabular-nums text-white/90">
                    {(fillerCount ?? 0).toLocaleString()} <span className="font-normal text-white/45">/ {fillerTaggedCount!.toLocaleString()} tagged episodes</span>
                    <span className="ml-2 text-xs font-medium text-amber-100">{fillerPercent}%</span>
                </p>
                {fillerCoverageTotal != null && fillerCoverageTotal > 0 && <p className="mt-1 text-[10px] text-white/45">
                    {fillerTaggedCount!.toLocaleString()} of {fillerCoverageTotal.toLocaleString()} listed episodes have filler metadata
                </p>}
            </section>}
        </div>
    )
}
