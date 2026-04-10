"use client"

import { ProfileStats_ActivityDay } from "@/api/generated/types"
import { cn } from "@/components/ui/core/styling"
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
    const dayLabelWidth = compact ? 0 : 20
    const dayLabels = ["M", "T", "W", "T", "F", "S", "S"]

    const width = dayLabelWidth + columns.length * (cellSize + gap)
    const height = 7 * (cellSize + gap)

    return (
        <div className="overflow-x-auto pb-2">
            <svg width={width} height={height + (compact ? 0 : 20)} className="block">
                {!compact && dayLabels.map((label, i) => (
                    <text
                        key={`label-${i}`}
                        x={dayLabelWidth - 4}
                        y={i * (cellSize + gap) + cellSize - 1}
                        textAnchor="end"
                        className="fill-[--muted] text-[9px]"
                    >
                        {i % 2 === 0 ? label : ""}
                    </text>
                ))}

                {!compact && columns.map((col, ci) => {
                    const firstDay = col.find(c => c !== null)
                    if (!firstDay) return null
                    const d = new Date(firstDay.date + "T00:00:00")
                    if (d.getDate() <= 7) {
                        const monthName = d.toLocaleString("default", { month: "short" })
                        return (
                            <text
                                key={`month-${ci}`}
                                x={dayLabelWidth + ci * (cellSize + gap)}
                                y={height + 14}
                                className="fill-[--muted] text-[9px]"
                            >
                                {monthName}
                            </text>
                        )
                    }
                    return null
                })}

                {columns.map((col, ci) =>
                    col.map((cell, ri) => {
                        if (!cell) {
                            return (
                                <rect
                                    key={`${ci}-${ri}`}
                                    x={dayLabelWidth + ci * (cellSize + gap)}
                                    y={ri * (cellSize + gap)}
                                    width={cellSize}
                                    height={cellSize}
                                    rx={2}
                                    className="fill-gray-800/50"
                                />
                            )
                        }
                        const intensity = cell.totalActivity / maxActivity
                        return (
                            <rect
                                key={`${ci}-${ri}`}
                                x={dayLabelWidth + ci * (cellSize + gap)}
                                y={ri * (cellSize + gap)}
                                width={cellSize}
                                height={cellSize}
                                rx={2}
                                className={getHeatmapColor(intensity)}
                            >
                                <title>
                                    {cell.date}: {cell.animeEpisodes} ep, {cell.mangaChapters} ch
                                </title>
                            </rect>
                        )
                    }),
                )}
            </svg>
            <div className="flex items-center gap-1 mt-1 text-xs text-[--muted]">
                <span>Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                    <span key={i} className={cn("inline-block w-3 h-3 rounded-sm", getHeatmapColor(v))} />
                ))}
                <span>More</span>
            </div>
        </div>
    )
}

function getHeatmapColor(intensity: number): string {
    if (intensity <= 0) return "fill-gray-800"
    if (intensity < 0.25) return "fill-emerald-900"
    if (intensity < 0.5) return "fill-emerald-700"
    if (intensity < 0.75) return "fill-emerald-500"
    return "fill-emerald-400"
}
