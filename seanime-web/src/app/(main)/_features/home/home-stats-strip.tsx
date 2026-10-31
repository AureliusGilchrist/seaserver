"use client"

import { cn } from "@/components/ui/core/styling"
import React from "react"

export type HomeStat = {
    label: string
    value: string
    icon: React.ReactNode
    /** Tailwind text colour for the icon. */
    tone?: string
    /** Draws the tile as needing attention. */
    alert?: boolean
    title?: string
}

/** The numbers row of the anime and manga home screens. */
export function HomeStatsStrip({ stats, className, ...rest }: { stats: HomeStat[], className?: string } & React.ComponentPropsWithoutRef<"div">) {
    return (
        <div className={cn("grid grid-cols-2 gap-3 px-4 py-2 sm:flex sm:flex-wrap", className)} {...rest}>
            {stats.map(stat => (
                <div
                    key={stat.label}
                    title={stat.title}
                    className={cn(
                        "group relative min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] via-black/25 to-black/40 p-3.5 shadow-lg shadow-black/20 backdrop-blur-md transition-transform hover:-translate-y-0.5 sm:min-w-[9.5rem] sm:flex-1",
                        stat.alert && "border-orange-300/30 from-orange-400/10",
                    )}
                >
                    <div className="pointer-events-none absolute -right-6 -top-8 size-20 rounded-full bg-brand-500/10 blur-2xl transition-opacity group-hover:opacity-100" />
                    <span className={cn("relative block text-lg [&>svg]:size-[1.1rem]", stat.tone ?? "text-brand-200")}>{stat.icon}</span>
                    <p className={cn("relative mt-2 truncate text-2xl font-bold leading-none tabular-nums text-white", stat.alert && "text-orange-200")}>{stat.value}</p>
                    <p className="relative mt-1.5 truncate text-[11px] font-semibold uppercase tracking-wider text-white/50">{stat.label}</p>
                </div>
            ))}
        </div>
    )
}
