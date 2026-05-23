"use client"
import { useGetMyProfile } from "@/api/hooks/community.hooks"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { activeSlotEditAtom, selectedSlotsAtom } from "@/lib/cursors/cursor-atoms"
import {
    CURSOR_SLOT_LABELS,
    CURSOR_SLOTS,
    CURSOR_TAB_LABELS,
    CURSOR_TABS,
    type CursorEntry,
    type CursorSlot,
    type CursorTab,
} from "@/lib/cursors/types"
import { useCursorManifest } from "@/lib/cursors/use-cursor-manifest"
import { useAtom, useSetAtom } from "jotai"
import React from "react"
import { FaLock, FaStar, FaTrash } from "react-icons/fa"

export function CursorLibraryPage() {
    const { data: manifest, isLoading } = useCursorManifest()
    const { data: profileData } = useGetMyProfile()
    const userLevel = profileData?.level?.currentLevel ?? 1

    const [activeSlot, setActiveSlot] = useAtom(activeSlotEditAtom)
    const [selected, setSelected] = useAtom(selectedSlotsAtom)
    const [activeTab, setActiveTab] = React.useState<CursorTab>("static")

    const entries = manifest?.entries ?? []

    const entriesForTab = React.useMemo(() => {
        return entries
            .filter(e => e.tab === activeTab)
            .filter(e => e.states.length === 0 || e.states.includes(activeSlot))
    }, [entries, activeTab, activeSlot])

    const bind = (entry: CursorEntry) => {
        setSelected(prev => ({ ...prev, [activeSlot]: entry.id }))
    }

    const clearSlot = (slot: CursorSlot) => {
        setSelected(prev => {
            const next = { ...prev }
            delete next[slot]
            return next
        })
    }

    const findEntry = (id?: string) => (id ? entries.find(e => e.id === id) : undefined)

    return (
        <PageWrapper className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto">
            <header className="space-y-2">
                <h1 className="text-3xl font-bold">Cursor Library</h1>
                <p className="text-[--muted] max-w-2xl">
                    Pick a cursor for each interaction state. Drop your own files into{" "}
                    <code className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-white">
                        AppData/cursor-library/{"{regular,games,animated,anime}"}/
                    </code>{" "}
                    using filenames like <code className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-white">045-flame__pointer.png</code>{" "}
                    or <code className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-white">naruto-rasengan__pointer.ani</code>.
                    Supports .cur, .ani, .png, .svg, .gif, .apng, .webp, .ico.
                </p>
                <p className="text-xs text-[--muted] italic">
                    Note: animated cursors (.gif / .ani / .apng) only animate in Firefox; other browsers show the first frame.
                </p>
            </header>

            {/* Slot selector */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">1. Choose a slot to edit</h2>
                <div className="flex flex-wrap gap-2">
                    {CURSOR_SLOTS.map(slot => (
                        <button
                            key={slot}
                            onClick={() => setActiveSlot(slot)}
                            className={cn(
                                "px-4 py-2 rounded-md text-sm font-medium transition border",
                                activeSlot === slot
                                    ? "bg-brand-600 border-brand-500 text-white"
                                    : "bg-gray-900 border-gray-800 text-[--muted] hover:bg-gray-800",
                            )}
                        >
                            {CURSOR_SLOT_LABELS[slot]}
                        </button>
                    ))}
                </div>
            </section>

            {/* Current bindings */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">Current bindings</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                    {CURSOR_SLOTS.map(slot => {
                        const entry = findEntry(selected[slot])
                        return (
                            <div
                                key={slot}
                                className={cn(
                                    "rounded-lg border p-3 flex flex-col items-center gap-2 text-center text-xs",
                                    activeSlot === slot ? "border-brand-500 bg-brand-950/30" : "border-gray-800 bg-gray-900/50",
                                )}
                            >
                                <div className="w-12 h-12 flex items-center justify-center bg-gray-950 rounded">
                                    {entry ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={entry.url} alt={entry.name} className="max-w-full max-h-full object-contain" />
                                    ) : (
                                        <span className="text-[--muted] text-[10px]">none</span>
                                    )}
                                </div>
                                <div className="font-medium">{CURSOR_SLOT_LABELS[slot]}</div>
                                {entry ? (
                                    <button
                                        onClick={() => clearSlot(slot)}
                                        className="text-[--muted] hover:text-red-400 text-[10px] inline-flex items-center gap-1"
                                    >
                                        <FaTrash /> Clear
                                    </button>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            </section>

            {/* Tabs */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">2. Pick a cursor for &quot;{CURSOR_SLOT_LABELS[activeSlot]}&quot;</h2>
                <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-2">
                    {CURSOR_TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "px-3 py-1.5 rounded-md text-sm transition",
                                activeTab === tab
                                    ? "bg-brand-600 text-white"
                                    : "text-[--muted] hover:bg-gray-800 hover:text-white",
                            )}
                        >
                            {CURSOR_TAB_LABELS[tab]}
                        </button>
                    ))}
                </div>

                {isLoading ? (
                    <p className="text-[--muted]">Loading…</p>
                ) : entriesForTab.length === 0 ? (
                    <div className="text-[--muted] text-sm p-6 rounded-lg border border-dashed border-gray-800">
                        Nothing here yet. Drop cursor files into the{" "}
                        <code className="text-xs px-1 py-0.5 rounded bg-gray-800 text-white">cursor-library/{activeTab}/</code> folder and reload.
                    </div>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                        {entriesForTab.map(entry => {
                            const locked =
                                entry.tab !== "anime" && entry.tab !== "static" && entry.level > userLevel
                            const isSelected = selected[activeSlot] === entry.id
                            return (
                                <button
                                    key={entry.id}
                                    onClick={() => !locked && bind(entry)}
                                    disabled={locked}
                                    title={locked ? `Reach Lv. ${entry.level} to unlock` : entry.name}
                                    className={cn(
                                        "relative rounded-lg border p-3 flex flex-col items-center gap-2 text-center transition group",
                                        isSelected
                                            ? "border-brand-500 bg-brand-950/30"
                                            : "border-gray-800 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-900",
                                        locked && "opacity-50 cursor-not-allowed",
                                        entry.isFinal && !locked && "ring-2 ring-yellow-400/60 shadow-lg shadow-yellow-500/20",
                                    )}
                                >
                                    {entry.isFinal && (
                                        <div className="absolute top-1 right-1 flex items-center gap-0.5 text-yellow-400 text-[9px] font-bold">
                                            <FaStar /> AWESOME
                                        </div>
                                    )}
                                    <div className="w-16 h-16 flex items-center justify-center bg-gray-950 rounded">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={entry.url}
                                            alt={entry.name}
                                            className="max-w-full max-h-full object-contain"
                                        />
                                    </div>
                                    <div className="text-xs font-medium truncate w-full">{entry.name}</div>
                                    {entry.tab !== "static" && entry.tab !== "anime" ? (
                                        <div className="text-[10px] text-[--muted]">Lv. {entry.level}</div>
                                    ) : null}
                                    {entry.tab === "anime" && entry.seriesSlug ? (
                                        <div className="text-[10px] text-[--muted] truncate w-full">{entry.seriesSlug}</div>
                                    ) : null}
                                    {locked && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-lg gap-1">
                                            <FaLock className="text-white text-lg" />
                                            <span className="text-[10px] text-white font-medium">Lv. {entry.level}</span>
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </section>

            {/* Reset all */}
            <section className="pt-4 border-t border-gray-800">
                <Button
                    intent="alert-subtle"
                    onClick={() => setSelected({})}
                    disabled={Object.keys(selected).length === 0}
                >
                    Reset all cursor selections
                </Button>
            </section>
        </PageWrapper>
    )
}
