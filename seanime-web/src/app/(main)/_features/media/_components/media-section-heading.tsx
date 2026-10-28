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
            <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight lg:text-3xl">
                {icon && <span className="flex size-9 items-center justify-center rounded-xl bg-white/[0.06] text-lg text-white/80 ring-1 ring-white/10 backdrop-blur-md [&>svg]:size-[1.15rem]">
                    {icon}
                </span>}
                <span>{title}</span>
                {count !== undefined && <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-sm font-semibold tabular-nums text-white/60 ring-1 ring-white/10">{count}</span>}
            </h2>
            {aside}
        </div>
    )
}
