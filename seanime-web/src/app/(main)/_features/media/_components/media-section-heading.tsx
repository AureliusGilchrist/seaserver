import { cn } from "@/components/ui/core/styling"
import React from "react"

/** The heading every section of a details page uses: icon, title, count, and an optional aside. */
export function MediaSectionHeading({ icon, title, count, aside, className }: {
    icon?: React.ReactNode
    title: React.ReactNode
    count?: number
    aside?: React.ReactNode
    className?: string
}) {
    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-3", className)} data-media-section-heading>
            <h2 className="flex items-center gap-3 text-xl font-bold tracking-tight text-white lg:text-2xl">
                {icon && <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500/15 text-base text-brand-200 ring-1 ring-brand-300/20 [&>svg]:size-4">
                    {icon}
                </span>}
                <span>{title}</span>
                {count !== undefined && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-semibold tabular-nums text-white/55 ring-1 ring-white/10">{count}</span>}
            </h2>
            {aside}
        </div>
    )
}
