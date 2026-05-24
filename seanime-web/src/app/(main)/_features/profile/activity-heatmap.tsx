"use client"

import { ProfileStats_ActivityDay } from "@/api/generated/types"
import React from "react"

export function ActivityHeatmap({ days, compact }: { days?: ProfileStats_ActivityDay[]; compact?: boolean }) {
    if (!days || days.length === 0) {
        return <p className="text-[--muted] text-sm">No activity data yet.</p>
    }

    const firstDate = new Date(days[0].date + "T00:00:00")
    const startDow = (firstDate.getDay() + 6) % 7

    const maxActivity = Math.max(1, ...days.map(d => d.totalActivity))

    const cells: (ProfileStats_ActivityDay | null)[] = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (const d of days) cells.push(d)

    const columns: (ProfileStats_ActivityDay | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) {
        columns.push(cells.slice(i, i + 7))
    }

    const lastCol = columns[columns.length - 1]
    while (lastCol && lastCol.length < 7) lastCol.push(null)

    const cellSize = compact ? 10 : 12
    const gap = 2
    const dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

    const monthLabels = columns.map((col) => {
        const firstDay = col.find(c => c !== null)
        if (!firstDay) return null
        const d = new Date(firstDay.date + "T00:00:00")
        if (d.getDate() <= 7) {
            return d.toLocaleString("default", { month: "short" })
        }
        return null
    })

    // Use the user's active XP bar fill (gradient or solid) when available, fall back to an emerald gradient.
    const xpFill = "var(--sea-xpbar-fill, linear-gradient(135deg, #34d399, #059669))"

    return (
        <div className="overflow-x-auto pb-2">
            <div className="flex" style={{ gap: `${gap}px` }}>
                {!compact && (
                    <div
                        className="flex flex-col text-[9px] text-[--muted] shrink-0 pr-1"
                        style={{ gap: `${gap}px` }}
                    >
                        {dayLabels.map((label, i) => (
                            <div
                                key={`label-${i}`}
                                style={{ height: cellSize, lineHeight: `${cellSize}px` }}
                                className="text-right"
                            >
                                {i % 2 === 0 ? label : ""}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex flex-col" style={{ gap: `${gap}px` }}>
                    <div className="flex" style={{ gap: `${gap}px` }}>
                        {columns.map((col, ci) => (
                            <div key={`col-${ci}`} className="flex flex-col" style={{ gap: `${gap}px` }}>
                                {col.map((cell, ri) => (
                                    <HeatmapCell
                                        key={`${ci}-${ri}`}
                                        cell={cell}
                                        size={cellSize}
                                        intensity={cell ? cell.totalActivity / maxActivity : 0}
                                        fill={xpFill}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                    {!compact && (
                        <div className="flex text-[9px] text-[--muted]" style={{ gap: `${gap}px` }}>
                            {monthLabels.map((label, ci) => (
                                <div
                                    key={`month-${ci}`}
                                    style={{ width: cellSize }}
                                    className="overflow-visible whitespace-nowrap"
                                >
                                    {label ?? ""}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {!compact && (
                <div className="flex items-center gap-1 mt-2 text-xs text-[--muted]">
                    <span>Less</span>
                    {[0, 0.2, 0.45, 0.7, 1].map((v, i) => (
                        <HeatmapCell key={i} cell={null} size={12} intensity={v} fill={xpFill} forceShow />
                    ))}
                    <span>More</span>
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
}: {
    cell: ProfileStats_ActivityDay | null
    size: number
    intensity: number
    fill: string
    forceShow?: boolean
}) {
    if (!cell && !forceShow) {
        return (
            <div
                style={{ width: size, height: size }}
                className="rounded-[2px] bg-gray-800/40"
            />
        )
    }

    let opacity = 0
    if (intensity <= 0) opacity = 0
    else if (intensity < 0.2) opacity = 0.25
    else if (intensity < 0.45) opacity = 0.5
    else if (intensity < 0.7) opacity = 0.75
    else opacity = 1

    const title = cell ? `${cell.date}: ${cell.animeEpisodes} ep, ${cell.mangaChapters} ch` : undefined

    return (
        <div
            title={title}
            style={{ width: size, height: size }}
            className="relative rounded-[2px] bg-gray-800/40"
        >
            {opacity > 0 && (
                <div
                    className="absolute inset-0 rounded-[2px]"
                    style={{ background: fill, opacity }}
                />
            )}
        </div>
    )
}
