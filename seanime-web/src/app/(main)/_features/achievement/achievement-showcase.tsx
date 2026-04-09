"use client"

import { useGetAchievements, useGetAchievementShowcase, useSetAchievementShowcase } from "@/api/hooks/achievement.hooks"
import { Achievement_Definition } from "@/api/generated/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import { Modal } from "@/components/ui/modal"
import React from "react"
import { LuPlus, LuTrophy, LuX } from "react-icons/lu"
import { toast } from "sonner"

const MAX_SHOWCASE_SLOTS = 6

export function AchievementShowcase() {
    const { data: showcaseData } = useGetAchievementShowcase()
    const { data: achievementsData } = useGetAchievements()
    const { mutate: setShowcase, isPending } = useSetAchievementShowcase()
    const [isEditing, setIsEditing] = React.useState(false)
    const [editSlots, setEditSlots] = React.useState<Array<{ achievementKey: string, achievementTier: number }>>([])
    const [pickerSlot, setPickerSlot] = React.useState<number | null>(null)

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

    // Display mode
    if (!isEditing) {
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                        <LuTrophy className="size-4 text-yellow-500" />
                        Achievement Showcase
                    </h3>
                    <Button size="xs" intent="primary-outline" onClick={() => setIsEditing(true)}>
                        Edit
                    </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(!showcaseData || showcaseData.length === 0) && (
                        <p className="text-xs text-[--muted]">No achievements showcased yet.</p>
                    )}
                    {showcaseData?.map((slot, i) => {
                        const def = defMap.get(slot.achievementKey)
                        if (!def) return null
                        return (
                            <ShowcaseBadge key={i} definition={def} tier={slot.achievementTier} />
                        )
                    })}
                </div>
            </div>
        )
    }

    // Edit mode
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <LuTrophy className="size-4 text-yellow-500" />
                    Edit Showcase
                </h3>
                <div className="flex gap-2">
                    <Button size="xs" intent="primary-outline" onClick={() => setIsEditing(false)}>
                        Cancel
                    </Button>
                    <Button size="xs" intent="primary" onClick={handleSave} loading={isPending}>
                        Save
                    </Button>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {editSlots.map((slot, i) => {
                    const def = defMap.get(slot.achievementKey)
                    return (
                        <div key={i} className="relative group">
                            {def ? (
                                <ShowcaseBadge definition={def} tier={slot.achievementTier} />
                            ) : (
                                <EmptySlot onClick={() => setPickerSlot(i)} />
                            )}
                            <button
                                onClick={() => handleRemoveSlot(i)}
                                className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <LuX className="size-3" />
                            </button>
                        </div>
                    )
                })}
                {editSlots.length < MAX_SHOWCASE_SLOTS && (
                    <EmptySlot onClick={() => setPickerSlot(editSlots.length)} />
                )}
            </div>

            {/* Picker modal */}
            <Modal open={pickerSlot !== null} onOpenChange={() => setPickerSlot(null)} title="Select Achievement" contentClass="max-w-xl">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto p-1">
                    {achievementsData?.definitions?.map(def => {
                        const maxTier = def.MaxTier || 0
                        if (maxTier === 0) {
                            const isUnlocked = unlockedSet.has(`${def.Key}:0`)
                            if (!isUnlocked) return null
                            return (
                                <button
                                    key={def.Key}
                                    onClick={() => handlePickAchievement(def.Key, 0)}
                                    className="flex items-center gap-2 p-2 rounded-lg border border-[--border] hover:bg-[--highlight] transition-colors text-left"
                                >
                                    <div className="size-8 flex items-center justify-center rounded bg-yellow-500/20 text-yellow-500 [&>svg]:size-5">
                                        <span dangerouslySetInnerHTML={{ __html: def.IconSVG }} />
                                    </div>
                                    <span className="text-xs font-medium truncate">{def.Name}</span>
                                </button>
                            )
                        }

                        // For tiered, show highest unlocked tier
                        let highestTier = 0
                        for (let t = 1; t <= maxTier; t++) {
                            if (unlockedSet.has(`${def.Key}:${t}`)) highestTier = t
                        }
                        if (highestTier === 0) return null
                        return (
                            <button
                                key={def.Key}
                                onClick={() => handlePickAchievement(def.Key, highestTier)}
                                className="flex items-center gap-2 p-2 rounded-lg border border-[--border] hover:bg-[--highlight] transition-colors text-left"
                            >
                                <div className="size-8 flex items-center justify-center rounded bg-yellow-500/20 text-yellow-500 [&>svg]:size-5">
                                    <span dangerouslySetInnerHTML={{ __html: def.IconSVG }} />
                                </div>
                                <div className="min-w-0">
                                    <span className="text-xs font-medium truncate block">{def.Name}</span>
                                    <span className="text-xs text-[--muted]">{def.TierNames?.[highestTier - 1] ?? `Tier ${highestTier}`}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </Modal>
        </div>
    )
}

function ShowcaseBadge({ definition, tier }: { definition: Achievement_Definition, tier: number }) {
    const tierName = tier > 0 ? definition.TierNames?.[tier - 1] : undefined
    return (
        <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-yellow-500/30",
            "bg-yellow-500/10 text-yellow-500",
        )}>
            <span
                className="size-5 [&>svg]:size-5"
                dangerouslySetInnerHTML={{ __html: definition.IconSVG }}
            />
            <span className="text-xs font-semibold">{definition.Name}</span>
            {tierName && <Badge size="sm" intent="warning">{tierName}</Badge>}
        </div>
    )
}

function EmptySlot({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center justify-center size-10 rounded-lg border-2 border-dashed border-[--border] text-[--muted] hover:border-[--foreground] hover:text-[--foreground] transition-colors"
        >
            <LuPlus className="size-4" />
        </button>
    )
}
