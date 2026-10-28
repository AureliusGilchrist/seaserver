"use client"
import {
    FRANCHISE_DEFAULT_INITIAL_COUNT,
    FRANCHISE_MEDIA_KINDS,
    FRANCHISE_RELATION_KINDS,
    FranchiseMediaKind,
    FranchiseRelationKind,
    useFranchiseSettings,
} from "@/app/(main)/_features/media/_lib/franchise-settings"
import { cn } from "@/components/ui/core/styling"
import { setClientSettings } from "@/lib/client-settings"
import React from "react"
import { LuCheck, LuNetwork } from "react-icons/lu"

/**
 * Personal -> Display -> Franchise. Which relations and which kinds of media the Franchise section
 * on a details page includes, and how many it shows before "Show more".
 */
export function FranchiseSettings() {
    const { relations, mediaKinds, initialCount } = useFranchiseSettings()

    const toggleRelation = (id: FranchiseRelationKind) => setClientSettings(prev => {
        const current = (prev.franchiseRelations ?? relations) as FranchiseRelationKind[]
        const next = current.includes(id) ? current.filter(r => r !== id) : [...current, id]
        return { ...prev, franchiseRelations: next }
    })
    const toggleMedia = (id: FranchiseMediaKind) => setClientSettings(prev => {
        const current = (prev.franchiseMediaKinds ?? mediaKinds) as FranchiseMediaKind[]
        const next = current.includes(id) ? current.filter(r => r !== id) : [...current, id]
        return { ...prev, franchiseMediaKinds: next }
    })

    return (
        <div className="space-y-4" data-franchise-settings>
            <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/10"><LuNetwork /></span>
                <div>
                    <p className="font-semibold">Franchise on details pages</p>
                    <p className="text-sm text-[--muted]">Every season, film, spin-off and source of a series, oldest first. Pick what it includes.</p>
                </div>
            </div>

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Relations</p>
                <div className="flex flex-wrap gap-2">
                    {FRANCHISE_RELATION_KINDS.map(k => (
                        <Toggle key={k.id} on={relations.includes(k.id)} onClick={() => toggleRelation(k.id)}>{k.label}</Toggle>
                    ))}
                </div>
            </div>

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Media</p>
                <div className="flex flex-wrap gap-2">
                    {FRANCHISE_MEDIA_KINDS.map(k => (
                        <Toggle key={k.id} on={mediaKinds.includes(k.id)} onClick={() => toggleMedia(k.id)}>{k.label}</Toggle>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-white/80">Show</p>
                <input
                    type="range"
                    min={4}
                    max={32}
                    step={1}
                    value={initialCount}
                    onChange={e => setClientSettings(prev => ({ ...prev, franchiseInitialCount: Number(e.target.value) }))}
                    className="w-48 accent-[--brand]"
                    aria-label="Entries shown before Show more"
                />
                <p className="text-sm tabular-nums text-white/80">{initialCount} before “Show more”</p>
                {initialCount !== FRANCHISE_DEFAULT_INITIAL_COUNT && <button
                    type="button"
                    className="text-xs text-[--muted] hover:text-white"
                    onClick={() => setClientSettings(prev => {
                        const next = { ...prev }
                        delete next.franchiseInitialCount
                        return next
                    })}
                >Reset</button>}
            </div>
        </div>
    )
}

function Toggle({ on, onClick, children }: { on: boolean, onClick: () => void, children: React.ReactNode }) {
    return <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors",
            on ? "bg-brand-500/20 text-white ring-brand-400/40" : "bg-white/[0.03] text-white/55 ring-white/10 hover:text-white",
        )}
    >
        {on && <LuCheck className="size-3.5" />}{children}
    </button>
}
