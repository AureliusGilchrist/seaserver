"use client"

import { ProfileStats_LifetimeStats } from "@/api/generated/types"
import { HomeStatsStrip, HomeStat } from "@/app/(main)/_features/home/home-stats-strip"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { LuBookOpen, LuCalendarCheck, LuCircleCheck, LuClock, LuLibrary, LuTv } from "react-icons/lu"

function formatHours(minutes: number) {
    const hours = minutes / 60
    if (hours > 0 && hours < 10) return hours.toFixed(1)
    return Math.round(hours).toLocaleString()
}

/** All-time watched / read totals — one profile's, or the whole community's summed. */
export function LifetimeStatsStrip({ lifetime, title, className }: {
    lifetime?: ProfileStats_LifetimeStats | null
    title?: string
    className?: string
}) {
    if (!lifetime) return null

    const stats: HomeStat[] = [
        {
            label: "Hours watched",
            value: formatHours(lifetime.animeMinutes),
            icon: <LuClock />,
            tone: "text-sky-300",
            title: `${lifetime.animeMinutes.toLocaleString()} minutes`,
        },
        {
            label: "Hours read",
            value: formatHours(lifetime.mangaMinutes),
            icon: <LuBookOpen />,
            tone: "text-amber-300",
            title: `${lifetime.mangaMinutes.toLocaleString()} minutes`,
        },
        { label: "Episodes watched", value: lifetime.animeEpisodes.toLocaleString(), icon: <LuTv />, tone: "text-sky-200" },
        { label: "Chapters read", value: lifetime.mangaChapters.toLocaleString(), icon: <LuLibrary />, tone: "text-amber-200" },
        {
            label: "Series completed",
            value: (lifetime.animeCompleted + lifetime.mangaCompleted).toLocaleString(),
            icon: <LuCircleCheck />,
            tone: "text-emerald-300",
            title: `${lifetime.animeCompleted.toLocaleString()} anime · ${lifetime.mangaCompleted.toLocaleString()} manga`,
        },
        { label: "Days active", value: lifetime.activeDays.toLocaleString(), icon: <LuCalendarCheck />, tone: "text-violet-300" },
    ]

    return (
        <section className={cn("space-y-1", className)} data-lifetime-stats>
            {title && <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-[--muted]">{title}</h2>}
            <HomeStatsStrip stats={stats} className="px-0 sm:grid sm:grid-cols-3 lg:grid-cols-6" />
            {lifetime.includesEstimate && (
                <p className="px-1 text-[11px] text-[--muted]">
                    Includes an estimate of what was watched and read before tracking began (each episode at its
                    length, 24 min when unknown; about 5 min per chapter). Everything since is tracked.
                </p>
            )}
        </section>
    )
}
