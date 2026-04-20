"use client"

import { CURSOR_DEFINITIONS } from "@/lib/cursors/cursor-definitions"
import { useCursor } from "@/lib/cursors/cursor-provider"
import React from "react"
import { LuLock, LuCheck, LuMousePointer2 } from "react-icons/lu"
import { cn } from "@/components/ui/core/styling"

type Props = {
    currentLevel: number
}

const CATEGORY_LABELS: Record<string, string> = {
    default: "Default",
    weapon: "Weapons",
    abstract: "Abstract",
    character: "Characters",
    special: "Special",
}

export function CursorShop({ currentLevel }: Props) {
    const { activeCursorId, setActiveCursorId } = useCursor()
    const [filter, setFilter] = React.useState<string>("all")

    const categories = ["all", "default", "abstract", "weapon", "special"]

    const filtered = CURSOR_DEFINITIONS.filter(c =>
        filter === "all" ? true : c.category === filter
    )

    const unlocked = CURSOR_DEFINITIONS.filter(c => c.requiredLevel <= currentLevel).length
    const total = CURSOR_DEFINITIONS.length

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-[--muted]">
                    <LuMousePointer2 />
                    <span>{unlocked}/{total} unlocked</span>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setFilter(cat)}
                            className={cn(
                                "px-3 py-1 text-xs rounded-full border transition",
                                filter === cat
                                    ? "border-brand-500 bg-brand-500/20 text-brand-300"
                                    : "border-[--border] text-[--muted] hover:border-brand-500/50",
                            )}
                        >
                            {cat === "all" ? "All" : CATEGORY_LABELS[cat]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filtered.map(cursor => {
                    const isUnlocked = cursor.requiredLevel <= currentLevel
                    const isActive = activeCursorId === cursor.id

                    return (
                        <button
                            key={cursor.id}
                            disabled={!isUnlocked}
                            onClick={() => isUnlocked && setActiveCursorId(cursor.id)}
                            className={cn(
                                "relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                                isActive
                                    ? "border-brand-500 bg-brand-500/15 shadow-lg shadow-brand-500/20"
                                    : isUnlocked
                                        ? "border-[--border] bg-gray-900/40 hover:border-brand-500/50 hover:bg-gray-900/60"
                                        : "border-[--border] bg-gray-900/20 opacity-50 cursor-not-allowed",
                            )}
                        >
                            {/* Active indicator */}
                            {isActive && (
                                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center">
                                    <LuCheck className="text-xs text-white" />
                                </div>
                            )}

                            {/* Lock indicator */}
                            {!isUnlocked && (
                                <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center">
                                    <LuLock className="text-xs text-gray-400" />
                                </div>
                            )}

                            {/* Cursor preview */}
                            <div className="w-12 h-12 flex items-center justify-center">
                                {cursor.icon ? (
                                    <img
                                        src={cursor.icon}
                                        alt={cursor.name}
                                        className="w-10 h-10 object-contain"
                                        draggable={false}
                                    />
                                ) : (
                                    <LuMousePointer2 className="text-2xl text-[--muted]" />
                                )}
                            </div>

                            <div className="text-center">
                                <p className="text-xs font-medium leading-tight">{cursor.name}</p>
                                {!isUnlocked && (
                                    <p className="text-xs text-[--muted] mt-0.5">Lv. {cursor.requiredLevel}</p>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
