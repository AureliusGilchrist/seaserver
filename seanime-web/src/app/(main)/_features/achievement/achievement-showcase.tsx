"use client"

import { useGetAchievements, useGetAchievementShowcase, useSetAchievementShowcase } from "@/api/hooks/achievement.hooks"
import { Achievement_Definition } from "@/api/generated/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Modal } from "@/components/ui/modal"
import React from "react"
import { LuPlus, LuTrophy, LuX } from "react-icons/lu"
import { toast } from "sonner"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"

const MAX_SHOWCASE_SLOTS = 6

export function AchievementShowcase() {
    const { data: showcaseData } = useGetAchievementShowcase()
    const { data: achievementsData } = useGetAchievements()
    const { mutate: setShowcase, isPending } = useSetAchievementShowcase()
    const [isEditing, setIsEditing] = React.useState(false)
    const [editSlots, setEditSlots] = React.useState<Array<{ achievementKey: string, achievementTier: number }>>([])
    const [pickerSlot, setPickerSlot] = React.useState<number | null>(null)
    const { config: animeConfig } = useAnimeTheme()

    const defMap = React.useMemo(() => {
        const map = new Map<string, Achievement_Definition>()
        if (achievementsData?.definitions) {
            for (const def of achievementsData.definitions) {
                map.set(def.Key, def)
            }
        }
        return map
    }, [achievementsData?.definitions])

    const unlockedSet = React.useMemo(() => {
        const set = new Set<string>()
        if (achievementsData?.achievements) {
            for (const a of achievementsData.achievements) {
                if (a.isUnlocked) set.add(`${a.key}:${a.tier}`)
            }
        }
        return set
    }, [achievementsData?.achievements])

    React.useEffect(() => {
        if (showcaseData) {
            setEditSlots(showcaseData.map(s => ({
                achievementKey: s.achievementKey,
                achievementTier: s.achievementTier,
            })))
        }
    }, [showcaseData])

    const handleSave = () => {
        setShowcase({
            slots: editSlots.map((s, i) => ({
                slot: i,
                achievementKey: s.achievementKey,
                achievementTier: s.achievementTier,
            })),
        }, {
            onSuccess: () => {
                toast.success("Showcase updated")
                setIsEditing(false)
            },
            onError: () => toast.error("Failed to update showcase"),
        })
    }

    const handlePickAchievement = (key: string, tier: number) => {
        if (pickerSlot === null) return
        setEditSlots(prev => {
            const next = [...prev]
            if (pickerSlot >= next.length) {
                next.push({ achievementKey: key, achievementTier: tier })
            } else {
                next[pickerSlot] = { achievementKey: key, achievementTier: tier }
            }
            return next
        })
        setPickerSlot(null)
    }

    const handleRemoveSlot = (idx: number) => {
        setEditSlots(prev => prev.filter((_, i) => i !== idx))
    }

    const unlockedChoices = React.useMemo(() => {
        const out: Array<{ def: Achievement_Definition, tier: number }> = []
        for (const def of achievementsData?.definitions ?? []) {
            const maxTier = def.MaxTier || 0
            if (maxTier === 0) {
                if (unlockedSet.has(`${def.Key}:0`)) out.push({ def, tier: 0 })
                continue
            }
            let highest = 0
            for (let t = 1; t <= maxTier; t++) if (unlockedSet.has(`${def.Key}:${t}`)) highest = t
            if (highest > 0) out.push({ def, tier: highest })
        }
        return out
    }, [achievementsData?.definitions, unlockedSet])
    const [pickerQuery, setPickerQuery] = React.useState("")
    const pq = pickerQuery.trim().toLowerCase()
    const pickerList = unlockedChoices.filter(c => !pq || (animeConfig.achievementNames[c.def.Key] ?? c.def.Name).toLowerCase().includes(pq))

    const savedSlots = (showcaseData ?? []).map(s => ({ achievementKey: s.achievementKey, achievementTier: s.achievementTier }))
    const slots = isEditing ? editSlots : savedSlots

    return (
        <section className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <LuTrophy className="size-4 text-amber-300" />
                        {isEditing ? "Edit showcase" : "Showcase"}
                    </h3>
                    <p className="mt-0.5 text-xs text-[--muted]">
                        {isEditing ? "Pick up to six unlocked achievements to show on your profile." : "Shown on your profile for everyone to see."}
                    </p>
                </div>
                {isEditing ? (
                    <div className="flex gap-2">
                        <Button size="xs" intent="gray-subtle" onClick={() => { setIsEditing(false); setEditSlots(savedSlots) }}>
                            Cancel
                        </Button>
                        <Button size="xs" intent="primary" onClick={handleSave} loading={isPending}>Save</Button>
                    </div>
                ) : (
                    <Button size="xs" intent="gray-subtle" onClick={() => setIsEditing(true)}>Edit</Button>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                {Array.from({ length: MAX_SHOWCASE_SLOTS }, (_, i) => {
                    const slot = slots[i]
                    const def = slot ? defMap.get(slot.achievementKey) : undefined
                    if (!slot || !def) {
                        const canAdd = i === slots.length
                        return (
                            <button
                                key={i}
                                type="button"
                                disabled={!canAdd}
                                onClick={() => { setIsEditing(true); setPickerSlot(i) }}
                                className={cn(
                                    "flex aspect-[4/5] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed text-[--muted] transition-colors",
                                    canAdd ? "border-white/15 hover:border-amber-300/50 hover:bg-amber-300/[0.04] hover:text-amber-200" : "border-white/[0.06] opacity-40",
                                )}
                            >
                                <LuPlus className="size-4" />
                                {canAdd && <span className="text-[10px] font-medium">Add</span>}
                            </button>
                        )
                    }
                    return (
                        <div key={i} className="group relative">
                            <ShowcaseBadge definition={def} tier={slot.achievementTier} onClick={isEditing ? () => setPickerSlot(i) : undefined} />
                            {isEditing && (
                                <button
                                    type="button"
                                    aria-label="Remove"
                                    onClick={() => handleRemoveSlot(i)}
                                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md ring-2 ring-[--background] transition-transform hover:scale-110"
                                >
                                    <LuX className="size-3" />
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            <Modal open={pickerSlot !== null} onOpenChange={() => { setPickerSlot(null); setPickerQuery("") }} title="Choose an achievement" contentClass="max-w-2xl">
                <div className="space-y-3">
                    <input
                        value={pickerQuery}
                        onChange={e => setPickerQuery(e.target.value)}
                        placeholder={`Search ${unlockedChoices.length} unlocked achievements…`}
                        className="h-9 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 text-sm outline-none placeholder:text-[--muted] focus:border-brand-400/50"
                    />
                    <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto p-0.5 sm:grid-cols-2">
                        {pickerList.length === 0 && <p className="col-span-full py-8 text-center text-sm text-[--muted]">Nothing unlocked matches.</p>}
                        {pickerList.map(({ def, tier }) => (
                            <button
                                key={def.Key}
                                type="button"
                                onClick={() => handlePickAchievement(def.Key, tier)}
                                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5 text-left transition-colors hover:border-amber-300/40 hover:bg-amber-300/[0.05]"
                            >
                                <span className="rounded-xl bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 p-[1.5px]">
                                    <span className="flex size-9 items-center justify-center rounded-[10px] bg-zinc-950 text-amber-300 [&>svg]:size-4" dangerouslySetInnerHTML={{ __html: def.IconSVG ?? "" }} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-xs font-semibold">{animeConfig.achievementNames[def.Key] ?? def.Name}</span>
                                    {tier > 0 && <span className="text-[11px] text-amber-200/80">{def.TierNames?.[tier - 1] ?? `Tier ${tier}`}</span>}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </Modal>
        </section>
    )
}

function ShowcaseBadge({ definition, tier, onClick }: { definition: Achievement_Definition, tier: number, onClick?: () => void }) {
    const { config: animeConfig } = useAnimeTheme()
    const achievementName = animeConfig.achievementNames[definition.Key] ?? definition.Name
    const tierName = tier > 0 ? definition.TierNames?.[tier - 1] : undefined
    const body = (
        <>
            <span className="pointer-events-none absolute -top-8 left-1/2 size-20 -translate-x-1/2 rounded-full bg-amber-300/20 blur-2xl" />
            <span className="relative rounded-2xl bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 p-[1.5px] shadow-[0_8px_24px_-8px_rgba(251,191,36,0.6)]">
                <span className="flex size-11 items-center justify-center rounded-[14px] bg-zinc-950 text-amber-300 [&>svg]:size-6" dangerouslySetInnerHTML={{ __html: definition.IconSVG ?? "" }} />
            </span>
            <span className="relative line-clamp-2 text-[11px] font-semibold leading-tight">{achievementName}</span>
            {tierName && <span className="relative rounded-full bg-amber-300/15 px-1.5 py-px text-[10px] font-semibold text-amber-200">{tierName}</span>}
        </>
    )
    const className = "relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-b from-amber-300/[0.1] via-black/20 to-black/40 p-2 text-center transition-transform hover:-translate-y-0.5"
    if (onClick) return <button type="button" onClick={onClick} className={className} title={definition.Description}>{body}</button>
    return <div className={className} title={definition.Description}>{body}</div>
}
