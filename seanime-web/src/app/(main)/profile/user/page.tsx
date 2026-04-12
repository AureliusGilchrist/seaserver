"use client"

import { useGetUserAchievements } from "@/api/hooks/achievement.hooks"
import { useGetUserProfile } from "@/api/hooks/community.hooks"
import { useGetUserProfileStats } from "@/api/hooks/profile-stats.hooks"
import {
    Achievement_Category,
    Achievement_CategoryInfo,
    Achievement_Definition,
    Achievement_Entry,
} from "@/api/generated/types"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { LevelRingAvatar } from "@/app/(main)/community/page"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { tabsTriggerClass, tabsListClass } from "@/components/shared/classnames"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter, useSearchParams } from "@/lib/navigation"
import { ActivityTabContent } from "@/app/(main)/_features/profile/activity-tab-content"
import { ActivityMultiplierBadge, StreakCard, StatsActivityHeatmap, DayOfWeekChart, CategoryPill, AchievementCard, ProgressRing, getLevelColor } from "@/app/(main)/profile/me/page"
import * as React from "react"
import {
    LuTrophy, LuStar, LuArrowLeft, LuCalendar, LuBookOpen,
    LuTv, LuActivity,
} from "react-icons/lu"
import { SeaLink } from "@/components/shared/sea-link"
import { Stats } from "@/components/ui/stats"

export default function Page() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const id = Number(searchParams.get("id")) || 0
    const activeTab = searchParams.get("tab") || "activity"

    const { data, isLoading } = useGetUserProfile(id)

    if (isLoading) {
        return (
            <PageWrapper className="p-4 sm:p-8 flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner />
            </PageWrapper>
        )
    }

    if (!data || !data.profile) {
        return (
            <PageWrapper className="p-4 sm:p-8 flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <p className="text-[--muted] text-lg">Profile not found</p>
                <SeaLink href="/community">
                    <span className="text-brand-300 hover:underline flex items-center gap-1">
                        <LuArrowLeft className="size-4" /> Back to community
                    </span>
                </SeaLink>
            </PageWrapper>
        )
    }

    const { profile, level, showcase, achievementSummary, activityHeatmap, animeStreak, mangaStreak, recentAchievements } = data
    const levelColors = getLevelColor(level?.currentLevel ?? 1)

    return (
        <>
            {profile!.bannerImage ? (
                <div className="relative h-48 w-full overflow-hidden">
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${profile!.bannerImage})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[--background] via-[--background]/60 to-transparent" />
                </div>
            ) : (
                <CustomLibraryBanner discrete />
            )}
            <PageWrapper className={cn("p-4 sm:p-8 space-y-6", profile!.bannerImage && "-mt-20 relative z-10")}> 
                <SeaLink href="/community">
                    <span className="text-[--muted] hover:text-white text-sm flex items-center gap-1 mb-4">
                        <LuArrowLeft className="size-4" /> Community
                    </span>
                </SeaLink>
                {/* Unified Profile Header */}
                <div className="flex flex-col sm:flex-row items-center gap-6 pb-2 border-b border-[--border]">
                    <LevelRingAvatar
                        profile={{
                            currentLevel: level?.currentLevel ?? 1,
                            totalXP: level?.totalXP ?? 0,
                            avatarPath: profile!.avatarPath,
                            anilistAvatar: profile!.anilistAvatar,
                            name: profile!.name,
                        }}
                        size={120}
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <h1 className="text-3xl font-bold truncate">{profile!.name}{profile!.anilistUsername && (
                                <span className="text-[--muted] font-normal"> ({profile!.anilistUsername})</span>
                            )}</h1>
                            <span className={cn("text-lg font-bold", levelColors.label)}>
                                Level {level?.currentLevel ?? 1}
                            </span>
                            {level && level.multiplier > 1 && (
                                <ActivityMultiplierBadge multiplier={level.multiplier} />
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-6 mt-2">
                            <div className="flex items-center gap-2 text-[--muted]">
                                <LuStar className="size-4" />
                                <span className="font-semibold">{(level?.totalXP ?? 0).toLocaleString()}</span>
                                <span className="text-sm">Total XP</span>
                            </div>
                            <div className="flex items-center gap-2 text-[--muted]">
                                <LuTrophy className="size-4" />
                                <span className="font-semibold">{achievementSummary?.unlockedCount ?? 0}</span>
                                <span className="text-sm">/ {achievementSummary?.totalCount ?? 0} achievements</span>
                            </div>
                        </div>
                        {profile!.bio && (
                            <div className="mt-2">
                                <p className="text-[--muted] text-sm max-w-md truncate">
                                    {profile!.bio}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                {/* Level progress bar */}
                {level && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-[--muted]">
                            <span>Level {level.currentLevel}</span>
                            <span>Level {level.currentLevel + 1}</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                                className={cn("h-full rounded-full transition-all duration-500", levelColors.ring.replace("stroke-", "bg-"))}
                                style={{ width: `${level.xpNeededForLevel > 0 ? (level.xpInCurrentLevel / level.xpNeededForLevel) * 100 : 100}%` }}
                            />
                        </div>
                        <div className="text-xs text-[--muted] text-center">
                            {level.xpInCurrentLevel.toLocaleString()} / {level.xpNeededForLevel.toLocaleString()} XP
                        </div>
                    </div>
                )}
                {/* Tabs */}
                <Tabs
                    value={activeTab}
                    onValueChange={(v: string) => router.push(`/profile/user?id=${id}&tab=${v}`)}
                >
                    <TabsList className={tabsListClass}>
                        <TabsTrigger value="activity" className={tabsTriggerClass}>
                            <LuActivity className="mr-1.5" /> Activity
                        </TabsTrigger>
                        <TabsTrigger value="stats" className={tabsTriggerClass}>
                            <LuStar className="mr-1.5" /> Stats
                        </TabsTrigger>
                        <TabsTrigger value="achievements" className={tabsTriggerClass}>
                            <LuTrophy className="mr-1.5" /> Achievements
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="activity" className="space-y-6 mt-6">
                        <ActivityTabContent
                            animeStreak={animeStreak}
                            mangaStreak={mangaStreak}
                            activityHeatmap={activityHeatmap}
                            showcase={showcase}
                            recentAchievements={recentAchievements}
                            anilistProfile={undefined} // No profile header in activity tab
                        />
                    </TabsContent>
                    <TabsContent value="stats" className="space-y-6 mt-6">
                        <UserStatsTabContent userId={id} />
                    </TabsContent>
                    <TabsContent value="achievements" className="space-y-6 mt-6">
                        <UserAchievementsTabContent userId={id} />
                    </TabsContent>
                </Tabs>
            </PageWrapper>
        </>
    )
}

// ─────────────────────── Stats Tab ───────────────────────

function UserStatsTabContent({ userId }: { userId: number }) {
    const [selectedYear, setSelectedYear] = React.useState<number | undefined>(undefined)
    const { data: profileStats, isLoading } = useGetUserProfileStats(userId, selectedYear)

    const currentYear = new Date().getFullYear()
    const yearOptions = React.useMemo(() => {
        const years: (number | undefined)[] = [undefined]
        for (let y = currentYear; y >= currentYear - 5; y--) years.push(y)
        return years
    }, [currentYear])

    if (isLoading) {
        return <div className="flex justify-center py-12"><LoadingSpinner /></div>
    }

    return (
        <>
            <Stats className="w-full" size="md" items={[
                { icon: <LuTrophy />, name: "Active Days", value: profileStats?.totalActiveDays ?? 0 },
                { icon: <LuTv />, name: "Anime Days", value: profileStats?.totalAnimeDays ?? 0 },
                { icon: <LuBookOpen />, name: "Manga Days", value: profileStats?.totalMangaDays ?? 0 },
            ]} />

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StreakCard label="Anime Watching Streak" icon={<LuTv className="text-lg" />} streak={profileStats?.animeStreak} />
                <StreakCard label="Manga Reading Streak" icon={<LuBookOpen className="text-lg" />} streak={profileStats?.mangaStreak} />
            </div>

            <Separator />

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <LuCalendar className="text-blue-400" />
                        Activity
                    </h2>
                    <select
                        className="bg-gray-900 border border-[--border] rounded-md px-3 py-1.5 text-sm"
                        value={selectedYear ?? ""}
                        onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : undefined)}
                    >
                        {yearOptions.map((y: number | undefined) => (
                            <option key={y ?? "rolling"} value={y ?? ""}>
                                {y ? `${y}` : "Last 365 days"}
                            </option>
                        ))}
                    </select>
                </div>
                <StatsActivityHeatmap days={profileStats?.activityHeatmap} />
                <DayOfWeekChart patterns={profileStats?.watchPatterns?.byDayOfWeek} />
            </div>
        </>
    )
}

// ─────────────────────── Achievements Tab ───────────────────────

function isDefUnlocked(def: Achievement_Definition, entryMap: Map<string, Achievement_Entry>): boolean {
    if ((def.MaxTier || 0) === 0) return entryMap.get(`${def.Key}:0`)?.isUnlocked ?? false
    for (let t = 1; t <= (def.MaxTier || 0); t++) {
        if (entryMap.get(`${def.Key}:${t}`)?.isUnlocked) return true
    }
    return false
}

function UserAchievementsTabContent({ userId }: { userId: number }) {
    const { data, isLoading } = useGetUserAchievements(userId)
    const [selectedCategory, setSelectedCategory] = React.useState<Achievement_Category | "all">("all")

    if (isLoading) {
        return <div className="flex justify-center py-12"><LoadingSpinner /></div>
    }

    if (!data) return null

    const { definitions = [], categories = [], achievements = [], summary } = data

    const entryMap = new Map<string, Achievement_Entry>()
    for (const a of achievements) {
        entryMap.set(`${a.key}:${a.tier}`, a)
    }

    const categoryMap = new Map<Achievement_Category, Achievement_CategoryInfo>()
    for (const cat of categories) {
        categoryMap.set(cat.Key, cat)
    }

    const filteredDefs = selectedCategory === "all"
        ? definitions
        : definitions.filter((d: Achievement_Definition) => d.Category === selectedCategory)

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
            <div className="flex items-center gap-4">
                <LuTrophy className="size-8 text-yellow-500" />
                <div>
                    <h2 className="text-xl font-bold">Achievements</h2>
                    <p className="text-[--muted]">{unlockedCount} / {totalCount} unlocked</p>
                </div>
                <div className="ml-auto">
                    <ProgressRing value={totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0} />
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <CategoryPill name="All" isActive={selectedCategory === "all"} onClick={() => setSelectedCategory("all")} />
                {categories.map((cat: Achievement_CategoryInfo) => (
                    <CategoryPill
                        key={cat.Key}
                        name={cat.Name}
                        svg={cat.IconSVG}
                        isActive={selectedCategory === cat.Key}
                        onClick={() => setSelectedCategory(cat.Key)}
                    />
                ))}
            </div>

            {Array.from(groupedDefs.entries()).map(([catKey, defs]) => {
                const catInfo = categoryMap.get(catKey)
                return (
                    <div key={catKey} className="space-y-3">
                        <div className="flex items-center gap-2">
                            {catInfo?.IconSVG && (
                                <span className="size-5 text-[--muted] [&>svg]:size-5" dangerouslySetInnerHTML={{ __html: catInfo.IconSVG }} />
                            )}
                            <h3 className="text-lg font-semibold">{catInfo?.Name ?? catKey}</h3>
                            {catInfo?.Description && <span className="text-sm text-[--muted]">— {catInfo.Description}</span>}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {defs.map((def: Achievement_Definition) => (
                                <AchievementCard key={def.Key} definition={def} entryMap={entryMap} />
                            ))}
                        </div>
                    </div>
                )
            })}
        </>
    )
}
