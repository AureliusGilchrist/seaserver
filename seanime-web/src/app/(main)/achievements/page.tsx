"use client"

import { useGetAchievements } from "@/api/hooks/achievement.hooks"
import {
    Achievement_Category,
    Achievement_CategoryInfo,
    Achievement_Definition,
    Achievement_Entry,
} from "@/api/generated/types"
import { AchievementShowcase } from "@/app/(main)/_features/achievement/achievement-showcase"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { StaticTabs } from "@/components/ui/tabs"
import React from "react"
import { LuTrophy, LuLock, LuEye, LuEyeOff } from "react-icons/lu"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"

function formatDescription(desc: string, thresholds?: number[], tierIdx?: number): React.ReactNode {
    if (!desc.includes("{threshold}") || !thresholds?.length) return desc
    const idx = tierIdx != null ? tierIdx : 0
    const val = thresholds[Math.min(idx, thresholds.length - 1)]
    const parts = desc.split("{threshold}")
    return <>{parts[0]}<strong className="text-[--foreground]">{val.toLocaleString()}</strong>{parts[1]}</>
}

function isDefUnlocked(def: Achievement_Definition, entryMap: Map<string, Achievement_Entry>): boolean {
    if ((def.MaxTier || 0) === 0) return entryMap.get(`${def.Key}:0`)?.isUnlocked ?? false
    for (let t = 1; t <= (def.MaxTier || 0); t++) {
        if (entryMap.get(`${def.Key}:${t}`)?.isUnlocked) return true
    }
    return false
}

export default function Page() {
    const { data, isLoading } = useGetAchievements()

    const [selectedCategory, setSelectedCategory] = React.useState<Achievement_Category | "all">("all")
    const [showUnlockedOnly, setShowUnlockedOnly] = React.useState(false)

    if (isLoading) {
        return (
            <PageWrapper className="p-4 sm:p-8 flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner />
            </PageWrapper>
        )
    }

    if (!data) return null

    const { definitions = [], categories = [], achievements = [], summary } = data

    // Build lookup maps
    const entryMap = new Map<string, Achievement_Entry>()
    for (const a of achievements) {
        entryMap.set(`${a.key}:${a.tier}`, a)
    }

    const categoryMap = new Map<Achievement_Category, Achievement_CategoryInfo>()
    for (const cat of categories) {
        categoryMap.set(cat.Key, cat)
    }

    // Filter definitions by selected category and unlock state
    let filteredDefs = selectedCategory === "all"
        ? definitions
        : definitions.filter(d => d.Category === selectedCategory)
    if (showUnlockedOnly) {
        filteredDefs = filteredDefs.filter(d => isDefUnlocked(d, entryMap))
    }

    // Group definitions by category for display
    const groupedDefs = new Map<Achievement_Category, Achievement_Definition[]>()
    for (const def of filteredDefs) {
        const list = groupedDefs.get(def.Category) || []
        list.push(def)
        groupedDefs.set(def.Category, list)
    }

    const unlockedCount = summary?.unlockedCount ?? 0
    const totalCount = summary?.totalCount ?? 0

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <LuTrophy className="size-8 text-yellow-500" />
                    <div>
                        <h1 className="text-2xl font-bold">Achievements</h1>
                        <p className="text-[--muted]">
                            {unlockedCount} / {totalCount} unlocked
                        </p>
                    </div>
                    <div className="ml-auto">
                        <ProgressRing value={totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0} />
                    </div>
                </div>

                {/* Showcase */}
                <AchievementShowcase />

                {/* Category filter tabs */}
                <div className="flex flex-wrap gap-2 items-center">
                    <button
                        onClick={() => setShowUnlockedOnly(v => !v)}
                        className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border mr-1",
                            showUnlockedOnly
                                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                                : "bg-[--paper] text-[--muted] border-[--border] hover:bg-[--highlight]",
                        )}
                    >
                        {showUnlockedOnly ? <LuEye className="size-3.5" /> : <LuEyeOff className="size-3.5" />}
                        {showUnlockedOnly ? "Unlocked" : "All"}
                    </button>
                    <CategoryPill
                        name="All"
                        isActive={selectedCategory === "all"}
                        onClick={() => setSelectedCategory("all")}
                    />
                    {categories.map(cat => (
                        <CategoryPill
                            key={cat.Key}
                            name={cat.Name}
                            svg={cat.IconSVG}
                            isActive={selectedCategory === cat.Key}
                            onClick={() => setSelectedCategory(cat.Key)}
                        />
                    ))}
                </div>

                {/* Achievement grid by category */}
                {Array.from(groupedDefs.entries()).map(([catKey, defs]) => {
                    const catInfo = categoryMap.get(catKey)
                    return (
                        <div key={catKey} className="space-y-3">
                            <div className="flex items-center gap-2">
                                {catInfo?.IconSVG && (
                                    <span
                                        className="size-5 text-[--muted] [&>svg]:size-5"
                                        dangerouslySetInnerHTML={{ __html: catInfo.IconSVG }}
                                    />
                                )}
                                <h2 className="text-lg font-semibold">{catInfo?.Name ?? catKey}</h2>
                                {catInfo?.Description && (
                                    <span className="text-sm text-[--muted]">— {catInfo.Description}</span>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {defs.map(def => (
                                    <AchievementCard
                                        key={def.Key}
                                        definition={def}
                                        entryMap={entryMap}
                                    />
                                ))}
                            </div>
                        </div>
                    )
                })}
            </PageWrapper>
        </>
    )
}

function CategoryPill({ name, svg, isActive, onClick }: {
    name: string
    svg?: string
    isActive: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                "border",
                isActive
                    ? "bg-brand-500 text-white border-brand-500"
                    : "bg-[--paper] text-[--muted] border-[--border] hover:bg-[--highlight] hover:text-[--foreground]",
            )}
        >
            {svg && (
                <span
                    className="size-4 [&>svg]:size-4"
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            )}
            {name}
        </button>
    )
}

function AchievementCard({ definition, entryMap }: {
    definition: Achievement_Definition
    entryMap: Map<string, Achievement_Entry>
}) {
    const { config: animeConfig } = useAnimeTheme()
    const achievementName = animeConfig.achievementNames[definition.Key] ?? definition.Name
    const maxTier = definition.MaxTier || 0
    const isOneTime = maxTier === 0

    // For one-time achievements
    if (isOneTime) {
        const entry = entryMap.get(`${definition.Key}:0`)
        const isUnlocked = entry?.isUnlocked ?? false

        return (
            <div className={cn(
                "relative flex items-start gap-3 p-4 rounded-xl border transition-colors",
                isUnlocked
                    ? "bg-[--paper] border-yellow-500/30"
                    : "bg-[--paper] border-[--border] opacity-60",
            )}>
                <AchievementIcon svg={definition.IconSVG} isUnlocked={isUnlocked} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{achievementName}</span>
                        {isUnlocked && <Badge size="sm" intent="warning">Unlocked</Badge>}
                    </div>
                    <p className="text-xs text-[--muted] mt-0.5">{formatDescription(definition.Description, definition.TierThresholds, 0)}</p>
                    {entry?.unlockedAt && (
                        <p className="text-xs text-[--muted] mt-1">
                            {new Date(entry.unlockedAt).toLocaleDateString()}
                        </p>
                    )}
                </div>
                {!isUnlocked && <LuLock className="absolute top-2 right-2 size-3 text-[--muted]" />}
            </div>
        )
    }

    // For tiered achievements
    let highestUnlockedTier = 0
    for (let t = 1; t <= maxTier; t++) {
        const entry = entryMap.get(`${definition.Key}:${t}`)
        if (entry?.isUnlocked) highestUnlockedTier = t
    }

    const nextTier = Math.min(highestUnlockedTier + 1, maxTier)
    const nextEntry = entryMap.get(`${definition.Key}:${nextTier}`)
    const nextThreshold = definition.TierThresholds?.[nextTier - 1] ?? 0
    const progress = nextEntry?.progress ?? 0
    const progressPct = nextThreshold > 0 ? Math.min((progress / nextThreshold) * 100, 100) : 0
    const isFullyUnlocked = highestUnlockedTier === maxTier

    return (
        <div className={cn(
            "relative flex items-start gap-3 p-4 rounded-xl border transition-colors",
            isFullyUnlocked
                ? "bg-[--paper] border-yellow-500/30"
                : highestUnlockedTier > 0
                    ? "bg-[--paper] border-brand-500/20"
                    : "bg-[--paper] border-[--border] opacity-60",
        )}>
            <AchievementIcon svg={definition.IconSVG} isUnlocked={highestUnlockedTier > 0} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{achievementName}</span>
                    {highestUnlockedTier > 0 && (
                        <Badge size="sm" intent={isFullyUnlocked ? "warning" : "primary"}>
                            {definition.TierNames?.[highestUnlockedTier - 1] ?? `Tier ${highestUnlockedTier}`}
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-[--muted] mt-0.5">{formatDescription(definition.Description, definition.TierThresholds, nextTier - 1)}</p>

                {/* Tier dots */}
                <div className="flex items-center gap-1 mt-2">
                    {Array.from({ length: maxTier }, (_, i) => {
                        const tier = i + 1
                        const unlocked = tier <= highestUnlockedTier
                        return (
                            <div
                                key={tier}
                                className={cn(
                                    "size-2 rounded-full",
                                    unlocked ? "bg-yellow-500" : "bg-[--border]",
                                )}
                                title={definition.TierNames?.[i] ?? `Tier ${tier}`}
                            />
                        )
                    })}
                </div>

                {/* Progress bar toward next tier */}
                {!isFullyUnlocked && nextThreshold > 0 && (
                    <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-[--muted] mb-0.5">
                            <span>Progress to {definition.TierNames?.[nextTier - 1] ?? `Tier ${nextTier}`}</span>
                            <span>{Math.round(progress)} / {nextThreshold}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[--border] overflow-hidden">
                            <div
                                className="h-full rounded-full bg-brand-500 transition-all duration-500"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>
            {highestUnlockedTier === 0 && <LuLock className="absolute top-2 right-2 size-3 text-[--muted]" />}
        </div>
    )
}

function AchievementIcon({ svg, isUnlocked }: { svg: string, isUnlocked: boolean }) {
    return (
        <div className={cn(
            "size-10 min-w-[2.5rem] flex items-center justify-center rounded-lg",
            isUnlocked ? "bg-yellow-500/20 text-yellow-500" : "bg-[--highlight] text-[--muted]",
            "[&>svg]:size-6",
        )}>
            <span dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
    )
}

function ProgressRing({ value }: { value: number }) {
    const r = 28
    const c = 2 * Math.PI * r
    const offset = c - (value / 100) * c

    return (
        <div className="relative size-16 flex items-center justify-center">
            <svg className="size-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" className="text-[--border]" strokeWidth="4" />
                <circle
                    cx="32"
                    cy="32"
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    className="text-yellow-500 transition-all duration-700"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                />
            </svg>
            <span className="absolute text-xs font-bold">{Math.round(value)}%</span>
        </div>
    )
}
