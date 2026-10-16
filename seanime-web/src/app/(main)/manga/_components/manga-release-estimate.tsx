"use client"

import { useGetMangaEntryChapters } from "@/api/hooks/manga.hooks"
import { useSelectedMangaProvider } from "@/app/(main)/manga/_lib/handle-manga-selected-provider"
import { getMangaReleaseEstimate } from "@/app/(main)/manga/_lib/manga-release-estimate"
import React from "react"
import { LuCalendarClock } from "react-icons/lu"

export function MangaReleaseEstimate({ mediaId, status }: { mediaId: number, status?: string }) {
    if (status !== "RELEASING") return null
    return <OngoingMangaReleaseEstimate mediaId={mediaId} />
}

function OngoingMangaReleaseEstimate({ mediaId }: { mediaId: number }) {
    const { selectedProvider } = useSelectedMangaProvider(mediaId)
    const { data: container, isLoading, isError } = useGetMangaEntryChapters({
        mediaId,
        provider: selectedProvider ?? undefined,
    })
    const estimate = React.useMemo(
        () => getMangaReleaseEstimate(container?.chapters ?? []),
        [container?.chapters],
    )

    return (
        <section
            data-manga-release-estimate
            className="mx-4 mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-brand-300/15 bg-gradient-to-r from-brand-500/[0.09] via-black/25 to-black/30 p-4 shadow-lg shadow-black/15 backdrop-blur-xl md:mx-8"
            aria-live="polite"
        >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-300/20 bg-brand-400/10 text-brand-200">
                <LuCalendarClock className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">Release estimate</p>
                {isLoading ? (
                    <p className="mt-1 text-sm text-white/65">Checking recent chapter dates…</p>
                ) : isError ? (
                    <p className="mt-1 text-sm text-white/65">Release estimate is temporarily unavailable.</p>
                ) : estimate ? (
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                        <span className="font-semibold text-white">
                            Estimated chapter timing: about every {Math.round(estimate.intervalDays)} days
                        </span>
                        <span className="text-white/55">
                            {estimate.latestChapter
                                ? `Next likely: Chapter ${Math.floor(Number(estimate.latestChapter)) + 1}`
                                : "Next likely chapter"}
                            {" · "}
                            {estimate.daysUntilNext === 0
                                ? "likely due now"
                                : `estimated in ${estimate.daysUntilNext} days`}
                            {" · "}
                            around {estimate.nextReleaseAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                    </div>
                ) : (
                    <p className="mt-1 text-sm text-white/65">
                        Not enough dated releases yet; an estimate appears after three recent release intervals.
                    </p>
                )}
            </div>
        </section>
    )
}
