"use client"

import { useGetMilestones } from "@/api/hooks/milestone.hooks"
import {
    Milestone_AchievedMilestone,
    Milestone_Category,
    Milestone_CategoryInfo,
    Milestone_Definition,
    Milestone_FirstToAchieveDefinition,
} from "@/api/generated/types"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import React from "react"
import { LuFlag, LuCrown, LuUser, LuCheck } from "react-icons/lu"
import { Link } from "@tanstack/react-router"

export default function Page() {
    const { data, isLoading } = useGetMilestones()
    const [selectedCategory, setSelectedCategory] = React.useState<Milestone_Category | "all" | "first">("all")

    if (isLoading) {
        return (
            <PageWrapper className="p-4 sm:p-8 flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner />
            </PageWrapper>
        )
    }

    if (!data) return null

    const { definitions = [], firstToAchieve = [], categories = [], achieved = [] } = data

    // Build lookup: key → achieved milestones (multiple profiles can achieve the same individual milestone)
    const achievedByKey = new Map<string, Milestone_AchievedMilestone[]>()
    for (const a of achieved) {
        const list = achievedByKey.get(a.key) || []
        list.push(a)
        achievedByKey.set(a.key, list)
    }

    const categoryMap = new Map<Milestone_Category, Milestone_CategoryInfo>()
    for (const cat of categories) {
        categoryMap.set(cat.key, cat)
    }

    // Count stats
    const totalIndividual = definitions.length
    const totalAchieved = achieved.filter(a => !a.isFirstToAchieve).length
    const totalFirst = firstToAchieve.length
    const firstClaimed = achieved.filter(a => a.isFirstToAchieve).length

    // Filter definitions
    let filteredDefs: Milestone_Definition[] = []
    let showFirst = false
    if (selectedCategory === "first") {
        showFirst = true
    } else if (selectedCategory === "all") {
        filteredDefs = definitions
    } else {
        filteredDefs = definitions.filter(d => d.category === selectedCategory)
    }

    // Group definitions by category
    const groupedDefs = new Map<Milestone_Category, Milestone_Definition[]>()
    for (const def of filteredDefs) {
        const list = groupedDefs.get(def.category) || []
        list.push(def)
        groupedDefs.set(def.category, list)
    }

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <LuFlag className="size-8 text-brand-400" />
                    <div>
                        <h1 className="text-2xl font-bold">Milestones</h1>
                        <p className="text-[--muted]">
                            {totalAchieved} individual achieved · {firstClaimed} / {totalFirst} first-to-achieve claimed
                        </p>
                    </div>
                </div>

                {/* Category filter tabs */}
                <div className="flex flex-wrap gap-2 items-center">
                    <CategoryPill
                        name="All"
                        isActive={selectedCategory === "all"}
                        onClick={() => setSelectedCategory("all")}
                    />
                    <CategoryPill
                        name="First to Achieve"
                        isActive={selectedCategory === "first"}
                        onClick={() => setSelectedCategory("first")}
                        icon={<LuCrown className="size-3.5 text-yellow-400" />}
                    />
                    {categories.map(cat => (
                        <CategoryPill
                            key={cat.key}
                            name={cat.name}
                            svg={cat.iconSVG}
                            isActive={selectedCategory === cat.key}
                            onClick={() => setSelectedCategory(cat.key)}
                        />
                    ))}
                </div>

                {/* First to Achieve section */}
                {showFirst && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <LuCrown className="size-5 text-yellow-400" />
                            <h2 className="text-lg font-semibold">First to Achieve</h2>
                            <span className="text-sm text-[--muted]">— Race milestones: first profile to reach the highest tier wins</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {firstToAchieve.map(def => (
                                <FirstToAchieveCard
                                    key={def.key}
                                    definition={def}
                                    achieved={achievedByKey.get(def.key)?.[0]}
                                    categoryInfo={categoryMap.get(def.category)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Individual milestones by category */}
                {!showFirst && Array.from(groupedDefs.entries()).map(([catKey, defs]) => {
                    const catInfo = categoryMap.get(catKey)
                    return (
                        <div key={catKey} className="space-y-3">
                            <div className="flex items-center gap-2">
                                {catInfo?.iconSVG && (
                                    <span
                                        className="size-5 text-[--muted] [&>svg]:size-5"
                                        dangerouslySetInnerHTML={{ __html: catInfo.iconSVG }}
                                    />
                                )}
                                <h2 className="text-lg font-semibold">{catInfo?.name ?? catKey}</h2>
                                {catInfo?.description && (
                                    <span className="text-sm text-[--muted]">— {catInfo.description}</span>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {defs.map(def => (
                                    <MilestoneCard
                                        key={def.key}
                                        definition={def}
                                        achievers={achievedByKey.get(def.key) || []}
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

function CategoryPill({ name, svg, icon, isActive, onClick }: {
    name: string
    svg?: string
    icon?: React.ReactNode
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
            {icon}
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

function MilestoneCard({ definition, achievers }: {
    definition: Milestone_Definition
    achievers: Milestone_AchievedMilestone[]
}) {
    const isAchieved = achievers.length > 0

    return (
        <div className={cn(
            "relative rounded-lg border p-4 transition-colors",
            isAchieved
                ? "border-brand-500/40 bg-brand-500/5"
                : "border-[--border] bg-[--paper] opacity-60",
        )}>
            <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                    isAchieved ? "bg-brand-500/20 text-brand-400" : "bg-gray-800 text-gray-500",
                )}>
                    {definition.iconSVG ? (
                        <span
                            className="w-5 h-5 [&>svg]:w-full [&>svg]:h-full"
                            dangerouslySetInnerHTML={{ __html: definition.iconSVG }}
                        />
                    ) : (
                        <LuFlag className="text-lg" />
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[--foreground] truncate">
                            {definition.name}
                        </p>
                        {isAchieved && <LuCheck className="text-brand-400 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-[--muted] mt-0.5">
                        {definition.threshold.toLocaleString()} {definition.category.replace(/_/g, " ")}
                    </p>
                </div>
            </div>

            {/* Achievers */}
            {achievers.length > 0 && (
                <div className="mt-3 pt-2 border-t border-[--border] space-y-1">
                    {achievers.slice(0, 3).map((a, i) => (
                        <Link
                            key={`${a.profileId}-${i}`}
                            to="/profile/user"
                            search={{ id: a.profileId }}
                            className="flex items-center gap-2 text-xs text-[--muted] hover:text-[--foreground] transition-colors"
                        >
                            <LuUser className="size-3" />
                            <span className="truncate">{a.profileName}</span>
                            {a.achievedAt && (
                                <span className="ml-auto text-[10px] opacity-60">
                                    {new Date(a.achievedAt).toLocaleDateString()}
                                </span>
                            )}
                        </Link>
                    ))}
                    {achievers.length > 3 && (
                        <p className="text-[10px] text-[--muted]">+{achievers.length - 3} more</p>
                    )}
                </div>
            )}
        </div>
    )
}

function FirstToAchieveCard({ definition, achieved, categoryInfo }: {
    definition: Milestone_FirstToAchieveDefinition
    achieved?: Milestone_AchievedMilestone
    categoryInfo?: Milestone_CategoryInfo
}) {
    const isClaimed = !!achieved

    return (
        <div className={cn(
            "relative rounded-lg border p-4 transition-colors",
            isClaimed
                ? "border-yellow-500/40 bg-gradient-to-br from-yellow-950/20 to-amber-950/10"
                : "border-[--border] bg-[--paper] opacity-60",
        )}>
            <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                    isClaimed ? "bg-yellow-500/20 text-yellow-400" : "bg-gray-800 text-gray-500",
                )}>
                    <LuCrown className="text-lg" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[--foreground] truncate">
                        {definition.name}
                    </p>
                    <p className="text-xs text-[--muted] mt-0.5">
                        First to reach {definition.threshold.toLocaleString()} {(categoryInfo?.name || definition.category).toLowerCase()}
                    </p>
                </div>
            </div>

            {/* Winner */}
            {isClaimed && achieved && (
                <div className="mt-3 pt-2 border-t border-yellow-500/20">
                    <Link
                        to="/profile/user"
                        search={{ id: achieved.profileId }}
                        className="flex items-center gap-2 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                    >
                        <LuCrown className="size-3" />
                        <span className="font-medium truncate">{achieved.profileName}</span>
                        {achieved.achievedAt && (
                            <span className="ml-auto text-[10px] opacity-60">
                                {new Date(achieved.achievedAt).toLocaleDateString()}
                            </span>
                        )}
                    </Link>
                </div>
            )}

            {!isClaimed && (
                <div className="mt-3 pt-2 border-t border-[--border]">
                    <p className="text-xs text-[--muted] italic">Unclaimed — be the first!</p>
                </div>
            )}
        </div>
    )
}
