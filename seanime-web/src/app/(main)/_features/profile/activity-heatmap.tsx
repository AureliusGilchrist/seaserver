"use client"

import { ProfileStats_ActivityDay } from "@/api/generated/types"
import { cn } from "@/components/ui/core/styling"
import React from "react"

/**
 * A year of watching, one square a day.
 *
 * This is the profile's signature element — the thing that says what kind of watcher somebody is
 * faster than any number above it — so it is built to be read: a whole year at once, the busiest
 * day setting the scale, and the app's own color (which is the wallpaper's) doing the filling.
 *
 * The one thing it does not do is rely on the browser's own tooltip. A title attribute is a
 * second-long wait for a single line of text; the day's real content is worth showing properly, and
 * the cell that is being pointed at should say so.
 */
export function ActivityHeatmap({ days, compact, fill: fillOverride }: {
    days?: ProfileStats_ActivityDay[]
    compact?: boolean
    /**
     * What to fill the days with. Defaults to the app's own color — which is the wallpaper's — and
     * is overridden when drawing somebody else's year, whose bar color travels with their profile
     * rather than being this screen's.
     */
    fill?: string
}) {
    const [hovered, setHovered] = React.useState<{ x: number, y: number, day: ProfileStats_ActivityDay } | null>(null)

    const data = React.useMemo(() => days ?? [], [days])

    const layout = React.useMemo(() => {
        if (data.length === 0) return null

        const firstDate = new Date(data[0]!.date + "T00:00:00")
        // Weeks start on Monday: `getDay()` puts Sunday at 0, and a column that starts on Sunday
        // makes the leftmost day label wrong for everyone who reads a calendar the usual way.
        const startDow = (firstDate.getDay() + 6) % 7

        const maxActivity = Math.max(1, ...data.map(d => d.totalActivity))
        const totalActivity = data.reduce((sum, d) => sum + d.totalActivity, 0)
        const activeDays = data.filter(d => d.totalActivity > 0).length

        const cells: (ProfileStats_ActivityDay | null)[] = []
        for (let i = 0; i < startDow; i++) cells.push(null)
        for (const d of data) cells.push(d)

        const columns: (ProfileStats_ActivityDay | null)[][] = []
        for (let i = 0; i < cells.length; i += 7) {
            columns.push(cells.slice(i, i + 7))
        }
        const lastCol = columns[columns.length - 1]
        while (lastCol && lastCol.length < 7) lastCol.push(null)

        const monthLabels = columns.map((col) => {
            const firstDay = col.find(c => c !== null)
            if (!firstDay) return null
            const d = new Date(firstDay.date + "T00:00:00")
            // The label sits on the column where the month actually turns, which is the first week
            // whose Monday is inside it — a month name over a column that is mostly last month is
            // worse than no label at all.
            return d.getDate() <= 7 ? d.toLocaleString("default", { month: "short" }) : null
        })

        return { columns, monthLabels, maxActivity, totalActivity, activeDays }
    }, [data])

    if (!layout) {
        return <p className="text-[--muted] text-sm">No activity data yet.</p>
    }

    const cellSize = compact ? 10 : 13
    const gap = 3
    const dayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"]
    // The fill is the app's own color — which comes from the wallpaper — so a year of activity is
    // drawn in the same color as everything else on the screen.
    const fill = fillOverride || "var(--sea-xpbar-fill, linear-gradient(135deg, #34d399, #059669))"

    const today = new Date().toISOString().slice(0, 10)

    return (
        <div className="relative">
            <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
                <div className="flex" style={{ gap: `${gap}px` }}>
                    {!compact && (
                        <div
                            className="flex flex-col text-[10px] text-[--muted] shrink-0 pr-1 pt-[18px]"
                            style={{ gap: `${gap}px` }}
                        >
                            {dayLabels.map((label, i) => (
                                <div
                                    key={`label-${i}`}
                                    style={{ height: cellSize, lineHeight: `${cellSize}px` }}
                                    className="text-right w-7"
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col">
                        {!compact && (
                            <div className="flex text-[10px] text-[--muted] mb-1" style={{ gap: `${gap}px` }}>
                                {layout.monthLabels.map((label, ci) => (
                                    <div key={`month-${ci}`} style={{ width: cellSize }} className="overflow-visible whitespace-nowrap">
                                        {label ?? ""}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex" style={{ gap: `${gap}px` }}>
                            {layout.columns.map((col, ci) => (
                                <div key={`col-${ci}`} className="flex flex-col" style={{ gap: `${gap}px` }}>
                                    {col.map((cell, ri) => (
                                        <HeatmapCell
                                            key={`${ci}-${ri}`}
                                            cell={cell}
                                            size={cellSize}
                                            intensity={cell ? cell.totalActivity / layout.maxActivity : 0}
                                            fill={fill}
                                            isToday={cell?.date === today}
                                            onHover={setHovered}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {!compact && (
                <div className="flex items-center justify-between flex-wrap gap-3 mt-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-[--muted]">
                        <span>Less</span>
                        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                            <HeatmapCell key={i} cell={null} size={11} intensity={v} fill={fill} forceShow />
                        ))}
                        <span>More</span>
                    </div>
                    <p className="text-[11px] text-[--muted]">
                        <span className="text-gray-200 font-medium tabular-nums">{layout.activeDays}</span> active day
                        {layout.activeDays === 1 ? "" : "s"} ·{" "}
                        <span className="text-gray-200 font-medium tabular-nums">{layout.totalActivity}</span> total
                    </p>
                </div>
            )}

            {/* The day under the pointer, shown properly and in place. Fixed-position so the
                scrolling strip the grid lives in cannot clip it. */}
            {hovered && (
                <div
                    className="fixed z-50 pointer-events-none rounded-lg border border-gray-700 bg-[--paper] px-3 py-2 shadow-lg"
                    style={{
                        left: Math.min(hovered.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 190),
                        top: Math.max(hovered.y - 56, 8),
                    }}
                >
                    <p className="text-xs font-medium text-gray-100">
                        {new Date(hovered.day.date + "T00:00:00").toLocaleDateString(undefined, {
                            weekday: "short", month: "short", day: "numeric", year: "numeric",
                        })}
                    </p>
                    <p className="text-[11px] text-[--muted] mt-0.5 tabular-nums">
                        {hovered.day.animeEpisodes} episode{hovered.day.animeEpisodes === 1 ? "" : "s"}
                        {hovered.day.mangaChapters > 0 && <> · {hovered.day.mangaChapters} chapter{hovered.day.mangaChapters === 1 ? "" : "s"}</>}
                    </p>
                </div>
            )}
        </div>
    )
}

function HeatmapCell({
    cell,
    size,
    intensity,
    fill,
    forceShow,
    isToday,
    onHover,
}: {
    cell: ProfileStats_ActivityDay | null
    size: number
    intensity: number
    fill: string
    forceShow?: boolean
    isToday?: boolean
    onHover?: (hovered: { x: number, y: number, day: ProfileStats_ActivityDay } | null) => void
}) {
    if (!cell && !forceShow) {
        return (
            <div
                style={{ width: size, height: size }}
                className="rounded-[3px] bg-gray-800/40"
            />
        )
    }

    // Five steps, so "a little" and "a lot" are told apart at a glance rather than by arithmetic.
    let opacity = 0
    if (intensity <= 0) opacity = 0
    else if (intensity < 0.2) opacity = 0.28
    else if (intensity < 0.45) opacity = 0.5
    else if (intensity < 0.7) opacity = 0.75
    else opacity = 1

    return (
        <div
            style={{ width: size, height: size }}
            className={cn(
                "relative rounded-[3px] bg-gray-800/40 transition-transform duration-100",
                isToday && "ring-1 ring-white/50",
                cell && "hover:scale-125 hover:z-10 cursor-pointer",
            )}
            onMouseEnter={cell && onHover ? e => onHover({ x: e.clientX, y: e.clientY, day: cell }) : undefined}
            onMouseMove={cell && onHover ? e => onHover({ x: e.clientX, y: e.clientY, day: cell }) : undefined}
            onMouseLeave={cell && onHover ? () => onHover(null) : undefined}
        >
            {opacity > 0 && (
                <div className="absolute inset-0 rounded-[3px]" style={{ background: fill, opacity }} />
            )}
        </div>
    )
}
