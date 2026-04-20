"use client"

import { useGetAchievements, useImportAchievements, AchievementUnlockPayload } from "@/api/hooks/achievement.hooks"
import { useGetAniListStats } from "@/api/hooks/anilist.hooks"
import { useGetMyProfile, useUpdateBio } from "@/api/hooks/community.hooks"
import {
    useGetAnimeFavorites,
    useGetMangaFavorites,
    useGetCharacterFavorites,
    useGetStaffFavorites,
    useGetStudioFavorites,
    useToggleAnimeFavorite,
    useToggleMangaFavorite,
    useToggleCharacterFavorite,
    useToggleStaffFavorite,
    useToggleStudioFavorite,
} from "@/api/hooks/favorites.hooks"
import { useGetProfileStats } from "@/api/hooks/profile-stats.hooks"
import {
    Achievement_Category,
    Achievement_CategoryInfo,
    Achievement_Definition,
    Achievement_Entry,
    AL_Stats,
    Handlers_RecentAchievementEntry,
    Handlers_ShowcaseEntry,
    ProfileStats_ActivityDay,
    ProfileStats_PersonalityResult,
    ProfileStats_StreakInfo,
} from "@/api/generated/types"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { AchievementShowcase } from "@/app/(main)/_features/achievement/achievement-showcase"
import { LevelRingAvatar } from "@/app/(main)/community/page"
import { ActivityHeatmap } from "@/app/(main)/_features/profile/activity-heatmap"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { tabsTriggerClass, tabsListClass } from "@/components/shared/classnames"
import { Badge } from "@/components/ui/badge"
import { BarChart, DonutChart, AreaChart } from "@/components/ui/charts"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { Separator } from "@/components/ui/separator"
import { Stats } from "@/components/ui/stats"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter, useSearchParams } from "@/lib/navigation"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { CursorShop } from "@/app/(main)/profile/me/_components/cursor-shop"
import { LuMousePointer2 } from "react-icons/lu"
import { useEasterEggs } from "@/lib/easter-eggs/easter-egg-engine"
import { EASTER_EGG_DEFINITIONS } from "@/lib/easter-eggs/easter-egg-definitions"
import * as React from "react"
import {
    LuTrophy, LuStar, LuPencil, LuCheck, LuX, LuFlame,
    LuCalendar, LuBookOpen, LuTv, LuClock, LuActivity,
    LuGlobe, LuHourglass, LuLock, LuZap, LuDownload, LuEye, LuEyeOff, LuHeart,
} from "react-icons/lu"

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

const formatName: Record<string, string> = {
    TV: "TV", TV_SHORT: "TV Short", MOVIE: "Movie",
    SPECIAL: "Special", OVA: "OVA", ONA: "ONA", MUSIC: "Music",
}

export default function Page() {
    const { data, isLoading } = useGetMyProfile()
    const { mutate: updateBio, isPending: isUpdatingBio } = useUpdateBio()
    const [editingBio, setEditingBio] = React.useState(false)
    const [bioText, setBioText] = React.useState("")
    const searchParams = useSearchParams()
    const router = useRouter()
    const activeTab = searchParams.get("tab") || "activity"

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
                <p className="text-[--muted] text-lg">Not logged in</p>
            </PageWrapper>
        )
    }

    const { profile, level, showcase, achievementSummary, activityHeatmap, animeStreak, mangaStreak, recentAchievements } = data
    const levelColors = getLevelColor(level?.currentLevel ?? 1)

    return (
        <>
            {/* Banner */}
            {profile!.bannerImage ? (
                <div className="relative h-[320px] w-full overflow-hidden">
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${profile!.bannerImage})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[--background] via-[--background]/30 to-transparent" />
                </div>
            ) : (
                <CustomLibraryBanner discrete />
            )}
            <PageWrapper className={cn("p-4 sm:p-8 space-y-6", profile!.bannerImage && "-mt-36 relative z-10")}> 
                {/* Unified Profile Header */}
                <div className="flex flex-col sm:flex-row items-center gap-6 pb-2 border-b border-[--border] relative">
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
                                <ActivityBuffBadge multiplier={level.multiplier} />
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
                        <div className="mt-2">
                            {editingBio ? (
                                <div className="flex items-center gap-2">
                                    <textarea
                                        className="bg-[--subtle] border border-[--border] rounded px-2 py-1 text-sm w-64 resize-none"
                                        rows={2}
                                        maxLength={500}
                                        value={bioText}
                                        onChange={(e) => setBioText(e.target.value)}
                                        autoFocus
                                    />
                                    <button
                                        className="p-1 text-green-400 hover:text-green-300"
                                        onClick={() => {
                                            updateBio({ bio: bioText })
                                            setEditingBio(false)
                                        }}
                                        disabled={isUpdatingBio}
                                    >
                                        <LuCheck className="size-4" />
                                    </button>
                                    <button
                                        className="p-1 text-red-400 hover:text-red-300"
                                        onClick={() => setEditingBio(false)}
                                    >
                                        <LuX className="size-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <p className="text-[--muted] text-sm max-w-md truncate">
                                        {profile!.bio || "No bio yet"}
                                    </p>
                                    <button
                                        className="p-1 text-[--muted] hover:text-white"
                                        onClick={() => {
                                            setBioText(profile!.bio || "")
                                            setEditingBio(true)
                                        }}
                                    >
                                        <LuPencil className="size-3" />
                                    </button>
                                </div>
                            )}
                        </div>
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
                    onValueChange={(v: string) => router.push(`/profile/me?tab=${v}`)}
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
                        <TabsTrigger value="favorites" className={tabsTriggerClass}>
                            <LuHeart className="mr-1.5" /> Favorites
                        </TabsTrigger>
                        <TabsTrigger value="cursors" className={tabsTriggerClass}>
                            <LuMousePointer2 className="mr-1.5" /> Cursors
                        </TabsTrigger>
                        <TabsTrigger value="secrets" className={tabsTriggerClass}>
                            🥚 Secrets
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="activity" className="space-y-6 mt-6">
                        <ActivityTabContent
                            animeStreak={animeStreak}
                            mangaStreak={mangaStreak}
                            activityHeatmap={activityHeatmap}
                            showcase={showcase}
                            recentAchievements={recentAchievements}
                            editable={true}
                            anilistProfile={profile?.anilistUsername ? {
                                avatar: profile.anilistAvatar,
                                banner: profile.bannerImage,
                                bio: profile.bio,
                                name: profile.name,
                            } : undefined}
                        />
                    </TabsContent>
                    <TabsContent value="stats" className="space-y-6 mt-6">
                        <StatsTabContent />
                    </TabsContent>
                    <TabsContent value="achievements" className="space-y-6 mt-6">
                        <AchievementsTabContent editable />
                    </TabsContent>
                    <TabsContent value="favorites" className="space-y-6 mt-6">
                        <FavoritesTabContent />
                    </TabsContent>
                    <TabsContent value="cursors" className="space-y-6 mt-6">
                        <CursorShop currentLevel={level?.currentLevel ?? 1} />
                    </TabsContent>
                    <TabsContent value="secrets" className="space-y-6 mt-6">
                        <EasterEggSecrets />
                    </TabsContent>
                </Tabs>
            </PageWrapper>
        </>
    )
}

// ─────────────────────── Activity Buff Badge ───────────────────────

// ─────────────────────── Easter Egg Secrets ────────────────────────

function EasterEggSecrets() {
    const { discovered } = useEasterEggs()
    const total = EASTER_EGG_DEFINITIONS.length
    const found = EASTER_EGG_DEFINITIONS.filter(e => discovered.has(e.id))
    const missing = EASTER_EGG_DEFINITIONS.filter(e => !discovered.has(e.id))

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Secret Discoveries</h3>
                <span className="text-sm text-gray-400">{found.length} / {total} found</span>
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                    className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all duration-500"
                    style={{ width: `${(found.length / total) * 100}%` }}
                />
            </div>
            {/* Found eggs */}
            {found.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">Found</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {found.map(egg => (
                            <div
                                key={egg.id}
                                className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-gray-900/60 p-3"
                            >
                                <span className="text-2xl">{egg.icon}</span>
                                <div>
                                    <p className="font-semibold text-white text-sm">{egg.name}</p>
                                    <p className="text-xs text-gray-400">{egg.description}</p>
                                    <p className="text-xs text-yellow-300 font-semibold mt-1">+{egg.xp} XP</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {/* Undiscovered eggs — shown as redacted */}
            {missing.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Undiscovered</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {missing.map(egg => (
                            <div
                                key={egg.id}
                                className="flex items-start gap-3 rounded-lg border border-gray-700/40 bg-gray-900/30 p-3 opacity-50"
                            >
                                <span className="text-2xl grayscale">🥚</span>
                                <div>
                                    <p className="font-semibold text-gray-500 text-sm">???</p>
                                    <p className="text-xs text-gray-600 italic">{egg.hint}</p>
                                    <p className="text-xs text-gray-600 font-semibold mt-1">+{egg.xp} XP</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export function ActivityBuffBadge({ multiplier }: { multiplier: number }) {
    const isMax = multiplier >= 2.0
    return (
        <div className={cn(
            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border",
            isMax
                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40 shadow-sm shadow-yellow-500/20"
                : "bg-brand-500/15 text-brand-300 border-brand-500/30",
        )}>
            <LuZap className={cn("size-3", isMax && "text-yellow-400")} />
            {multiplier.toFixed(1)}x Buff
        </div>
    )
}

// ─────────────────────── Activity Tab ───────────────────────

import { ActivityTabContent } from "@/app/(main)/_features/profile/activity-tab-content"

// ─────────────────────── Stats Tab (lazy) ───────────────────────

function StatsTabContent() {
    const [selectedYear, setSelectedYear] = React.useState<number | undefined>(undefined)
    const { data: profileStats, isLoading: profileLoading } = useGetProfileStats(selectedYear)
    const { data: anilistStats, isLoading: anilistLoading } = useGetAniListStats(true)

    const currentYear = new Date().getFullYear()
    const yearOptions = React.useMemo(() => {
        const years: (number | undefined)[] = [undefined]
        for (let y = currentYear; y >= currentYear - 5; y--) years.push(y)
        return years
    }, [currentYear])

    if (profileLoading || anilistLoading) {
        return <div className="flex justify-center py-12"><LoadingSpinner /></div>
    }

    return (
        <>
            <HeroStats anilistStats={anilistStats} profileStats={profileStats} />

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
                        {yearOptions.map((y) => (
                            <option key={y ?? "rolling"} value={y ?? ""}>
                                {y ? `${y}` : "Last 365 days"}
                            </option>
                        ))}
                    </select>
                </div>
                <StatsActivityHeatmap days={profileStats?.activityHeatmap} />
                <DayOfWeekChart patterns={profileStats?.watchPatterns?.byDayOfWeek} />
            </div>

            <Separator />

            {profileStats?.personality && (
                <>
                    <PersonalityCard personality={profileStats.personality} />
                    <Separator />
                </>
            )}

            <AniListCharts stats={anilistStats} />
        </>
    )
}

// ─────────────────────── Achievements Tab (lazy) ───────────────────────

function AchievementsTabContent({ editable }: { editable?: boolean }) {
    const { data, isLoading } = useGetAchievements()
    const { config: animeConfig } = useAnimeTheme()
    const [selectedCategory, setSelectedCategory] = React.useState<Achievement_Category | "all">("all")
    const { mutate: importAchievements, isPending: isImporting } = useImportAchievements()
    const [importResults, setImportResults] = React.useState<AchievementUnlockPayload[] | null>(null)
    const [showUnlockedOnly, setShowUnlockedOnly] = React.useState(false)

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

    let filteredDefs = selectedCategory === "all"
        ? definitions
        : definitions.filter((d: Achievement_Definition) => d.Category === selectedCategory)
    if (showUnlockedOnly) {
        filteredDefs = filteredDefs.filter((d: Achievement_Definition) => isDefUnlocked(d, entryMap))
    }

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
                <div className="ml-auto flex items-center gap-3">
                    {editable && (
                        <button
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                                "bg-brand-500/15 text-brand-300 border border-brand-500/30 hover:bg-brand-500/25",
                                isImporting && "opacity-50 pointer-events-none",
                            )}
                            onClick={() => importAchievements(undefined, {
                                onSuccess: (res: any) => setImportResults(res ?? []),
                            })}
                            disabled={isImporting}
                        >
                            {isImporting ? <LoadingSpinner className="size-4" /> : <LuDownload className="size-4" />}
                            Import
                        </button>
                    )}
                    <ProgressRing value={totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0} />
                </div>
            </div>

            {/* Import Results Modal */}
            <Modal open={importResults !== null} onOpenChange={() => setImportResults(null)} title="Import Results" contentClass="max-w-lg" onPointerDownCapture={() => {}} onOpenAutoFocus={() => {}} onCloseAutoFocus={() => {}} onEscapeKeyDown={() => {}} onInteractOutside={() => {}}>
                {importResults && importResults.length === 0 ? (
                    <p className="text-[--muted] text-center py-6">No new achievements unlocked.</p>
                ) : (
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                        <p className="text-sm text-[--muted] mb-3">{importResults?.length} achievement{(importResults?.length ?? 0) !== 1 ? "s" : ""} unlocked!</p>
                        {importResults?.map(a => (
                            <div key={`${a.key}-${a.tier}`} className="flex items-center gap-3 p-3 rounded-lg bg-[--subtle]">
                                {a.iconSVG && (
                                    <div className="w-7 h-7 shrink-0 text-yellow-500 [&>svg]:size-5" dangerouslySetInnerHTML={{ __html: a.iconSVG }} />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate">{animeConfig.achievementNames[a.key] ?? a.name}</p>
                                    <p className="text-xs text-[--muted] truncate">{a.description}</p>
                                    {a.tier > 0 && <p className="text-xs text-[--muted]">{a.tierName || `Tier ${a.tier}`}</p>}
                                </div>
                                <span className="text-xs text-[--muted] shrink-0">{a.category}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>

            {editable && <AchievementShowcase />}

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
                            {defs.map(def => (
                                <AchievementCard key={def.Key} definition={def} entryMap={entryMap} />
                            ))}
                        </div>
                    </div>
                )
            })}
        </>
    )
}

// ─────────────────────── Shared Sub-components ───────────────────────

export function StreakCard({ label, icon, streak }: { label: string; icon: React.ReactNode; streak?: ProfileStats_StreakInfo }) {
    return (
        <div className="bg-gray-900 border border-[--border] rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-[--muted]">
                {icon}
                <span className="text-sm font-medium">{label}</span>
            </div>
            <div className="flex items-end gap-6">
                <div>
                    <div className="flex items-center gap-2">
                        <LuFlame className={cn("text-2xl", (streak?.current ?? 0) > 0 ? "text-orange-400" : "text-gray-600")} />
                        <span className="text-3xl font-bold">{streak?.current ?? 0}</span>
                    </div>
                    <span className="text-xs text-[--muted]">Current</span>
                </div>
                <div>
                    <span className="text-xl font-semibold text-[--muted]">{streak?.longest ?? 0}</span>
                    <p className="text-xs text-[--muted]">Longest</p>
                </div>
            </div>
        </div>
    )
}

export function ShowcaseCard({ entry }: { entry: Handlers_ShowcaseEntry }) {
    return (
        <div className="p-3 rounded-lg bg-[--subtle] text-center space-y-2">
            {entry.definition?.IconSVG && (
                <div className="w-8 h-8 mx-auto text-brand-300" dangerouslySetInnerHTML={{ __html: entry.definition.IconSVG }} />
            )}
            <p className="font-semibold text-sm truncate">{entry.definition?.Name ?? entry.key}</p>
            {entry.tier > 0 && <p className="text-xs text-[--muted]">Tier {entry.tier}</p>}
        </div>
    )
}

export function RecentAchievementRow({ entry }: { entry: Handlers_RecentAchievementEntry }) {
    const timeAgo = entry.unlockedAt ? formatTimeAgo(new Date(entry.unlockedAt)) : ""
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[--subtle]">
            {entry.definition?.IconSVG && (
                <div className="w-6 h-6 shrink-0 text-emerald-400" dangerouslySetInnerHTML={{ __html: entry.definition.IconSVG }} />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{entry.definition?.Name ?? entry.key}</p>
                {entry.tier > 0 && <p className="text-xs text-[--muted]">Tier {entry.tier}</p>}
            </div>
            {timeAgo && <span className="text-xs text-[--muted] shrink-0">{timeAgo}</span>}
        </div>
    )
}

// ─────────────────────── Stats Sub-components ───────────────────────

function HeroStats({ anilistStats, profileStats }: { anilistStats?: AL_Stats; profileStats?: any }) {
    return (
        <div className="space-y-2">
            <Stats className="w-full" size="lg" items={[
                { icon: <LuTv />, name: "Total Anime", value: anilistStats?.animeStats?.count ?? 0 },
                { icon: <LuBookOpen />, name: "Total Manga", value: anilistStats?.mangaStats?.count ?? 0 },
                { icon: <LuHourglass />, name: "Watch Time", value: Math.round((anilistStats?.animeStats?.minutesWatched ?? 0) / 60), unit: "hours" },
                { icon: <LuStar />, name: "Mean Score", value: ((anilistStats?.animeStats?.meanScore ?? 0) / 10).toFixed(1) },
            ]} />
            <Stats className="w-full" size="md" items={[
                { icon: <LuTrophy />, name: "Active Days", value: profileStats?.totalActiveDays ?? 0 },
                { icon: <LuTv />, name: "Anime Days", value: profileStats?.totalAnimeDays ?? 0 },
                { icon: <LuBookOpen />, name: "Manga Days", value: profileStats?.totalMangaDays ?? 0 },
            ]} />
        </div>
    )
}

export function StatsActivityHeatmap({ days }: { days?: ProfileStats_ActivityDay[] }) {
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
    for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7))
    const lastCol = columns[columns.length - 1]
    while (lastCol && lastCol.length < 7) lastCol.push(null)
    const cellSize = 12, gap = 2, dayLabelWidth = 20
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const width = dayLabelWidth + columns.length * (cellSize + gap)
    const height = 7 * (cellSize + gap)

    return (
        <div className="overflow-x-auto pb-2">
            <svg width={width} height={height + 20} className="block">
                {dayLabels.map((label, i) => (
                    <text key={`label-${i}`} x={dayLabelWidth - 4} y={i * (cellSize + gap) + cellSize - 1} textAnchor="end" className="fill-[--muted] text-[9px]">
                        {i % 2 === 0 ? label : ""}
                    </text>
                ))}
                {columns.map((col, ci) => {
                    const firstDay = col.find(c => c !== null)
                    if (!firstDay) return null
                    const d = new Date(firstDay.date + "T00:00:00")
                    if (d.getDate() <= 7) {
                        return (
                            <text key={`month-${ci}`} x={dayLabelWidth + ci * (cellSize + gap)} y={height + 14} className="fill-[--muted] text-[9px]">
                                {d.toLocaleString("default", { month: "short" })}
                            </text>
                        )
                    }
                    return null
                })}
                {columns.map((col, ci) =>
                    col.map((cell, ri) => {
                        if (!cell) {
                            return <rect key={`${ci}-${ri}`} x={dayLabelWidth + ci * (cellSize + gap)} y={ri * (cellSize + gap)} width={cellSize} height={cellSize} rx={2} className="fill-gray-800/50" />
                        }
                        const intensity = cell.totalActivity / maxActivity
                        return (
                            <rect key={`${ci}-${ri}`} x={dayLabelWidth + ci * (cellSize + gap)} y={ri * (cellSize + gap)} width={cellSize} height={cellSize} rx={2} className={getHeatmapColor(intensity)}>
                                <title>{cell.date}: {cell.animeEpisodes} ep, {cell.mangaChapters} ch</title>
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

export function DayOfWeekChart({ patterns }: { patterns?: number[] }) {
    if (!patterns || patterns.every(v => v === 0)) return null
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const data = dayNames.map((name, i) => ({ name, Activity: patterns[i] ?? 0 }))
    return (
        <div className="w-full max-w-md">
            <p className="text-sm text-[--muted] mb-2">Activity by day of week</p>
            <BarChart data={data} index="name" categories={["Activity"]} colors={["brand"]} />
        </div>
    )
}

function PersonalityCard({ personality }: { personality: ProfileStats_PersonalityResult }) {
    return (
        <div className="space-y-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
                <LuGlobe className="text-purple-400" />
                Your Anime Personality
            </h2>
            <div className="bg-gradient-to-br from-purple-900/30 via-gray-900 to-indigo-900/30 border border-purple-500/20 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-4">
                    {personality.iconSvg && <div className="w-12 h-12 text-purple-400" dangerouslySetInnerHTML={{ __html: personality.iconSvg }} />}
                    <div>
                        <h3 className="text-2xl font-bold text-purple-200">{personality.name}</h3>
                        <p className="text-sm text-[--muted]">{personality.description}</p>
                    </div>
                </div>
                {personality.traits && personality.traits.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {personality.traits.map((trait) => (
                            <span key={trait} className="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30">{trait}</span>
                        ))}
                    </div>
                )}
                {personality.topGenres && personality.topGenres.length > 0 && (
                    <p className="text-xs text-[--muted]">Top genres: {personality.topGenres.join(", ")}</p>
                )}
            </div>
        </div>
    )
}

function AniListCharts({ stats }: { stats?: AL_Stats }) {
    const genreData = React.useMemo(() => {
        if (!stats?.animeStats?.genres) return []
        return stats.animeStats.genres.map((item) => ({ name: item.genre, Count: item.count, "Avg Score": Number((item.meanScore / 10).toFixed(1)) })).sort((a, b) => b.Count - a.Count).slice(0, 15)
    }, [stats?.animeStats?.genres])

    const formatData = React.useMemo(() => {
        if (!stats?.animeStats?.formats) return []
        return stats.animeStats.formats.map((item) => ({ name: formatName[item.format as string] ?? item.format, count: item.count, hours: Math.round(item.minutesWatched / 60) }))
    }, [stats?.animeStats?.formats])

    const studioData = React.useMemo(() => {
        if (!stats?.animeStats?.studios) return []
        return [...stats.animeStats.studios].sort((a, b) => b.count - a.count).slice(0, 10).map((item) => ({ name: item.studio?.name ?? "Unknown", Count: item.count, "Avg Score": Number((item.meanScore / 10).toFixed(1)) }))
    }, [stats?.animeStats?.studios])

    const scoreData = React.useMemo(() => {
        if (!stats?.animeStats?.scores) return []
        return stats.animeStats.scores.map((item) => ({ name: String((item.score ?? 0) / 10), Count: item.count })).sort((a, b) => Number(a.name) - Number(b.name))
    }, [stats?.animeStats?.scores])

    const yearData = React.useMemo(() => {
        if (!stats?.animeStats?.releaseYears) return []
        return stats.animeStats.releaseYears.sort((a, b) => a.releaseYear! - b.releaseYear!).map((item) => ({ name: item.releaseYear, Count: item.count }))
    }, [stats?.animeStats?.releaseYears])

    const mangaGenreData = React.useMemo(() => {
        if (!stats?.mangaStats?.genres) return []
        return stats.mangaStats.genres.map((item) => ({ name: item.genre, Count: item.count, "Avg Score": Number((item.meanScore / 10).toFixed(1)) })).sort((a, b) => b.Count - a.Count).slice(0, 15)
    }, [stats?.mangaStats?.genres])

    return (
        <div className="space-y-10">
            <h2 className="text-xl font-semibold text-center">Anime Breakdown</h2>

            {genreData.length > 0 && <ChartSection title="Genres"><BarChart data={genreData} index="name" categories={["Count", "Avg Score"]} colors={["brand", "blue"]} /></ChartSection>}
            {formatData.length > 0 && (
                <ChartSection title="Formats">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="text-center space-y-2"><DonutChart data={formatData} index="name" category="count" variant="pie" /><p className="text-sm font-medium">By count</p></div>
                        <div className="text-center space-y-2"><DonutChart data={formatData} index="name" category="hours" variant="pie" /><p className="text-sm font-medium">By hours watched</p></div>
                    </div>
                </ChartSection>
            )}
            {studioData.length > 0 && <ChartSection title="Top Studios"><BarChart data={studioData} index="name" categories={["Count", "Avg Score"]} colors={["brand", "blue"]} /></ChartSection>}
            {scoreData.length > 0 && <ChartSection title="Score Distribution"><BarChart data={scoreData} index="name" categories={["Count"]} colors={["brand"]} /></ChartSection>}
            {yearData.length > 0 && <ChartSection title="Anime by Release Year"><AreaChart data={yearData} index="name" categories={["Count"]} angledLabels /></ChartSection>}

            <Separator />

            <h2 className="text-xl font-semibold text-center">Manga Breakdown</h2>
            <Stats className="w-full" size="lg" items={[
                { icon: <LuBookOpen />, name: "Total Manga", value: stats?.mangaStats?.count ?? 0 },
                { icon: <LuHourglass />, name: "Chapters Read", value: stats?.mangaStats?.chaptersRead ?? 0 },
                { icon: <LuStar />, name: "Mean Score", value: ((stats?.mangaStats?.meanScore ?? 0) / 10).toFixed(1) },
            ]} />
            {mangaGenreData.length > 0 && <ChartSection title="Manga Genres"><BarChart data={mangaGenreData} index="name" categories={["Count", "Avg Score"]} colors={["brand", "blue"]} /></ChartSection>}
        </div>
    )
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-4">
            <h3 className="text-center text-lg font-medium">{title}</h3>
            <div className="w-full">{children}</div>
        </div>
    )
}

// ─────────────────────── Achievement Sub-components ───────────────────────

export function CategoryPill({ name, svg, isActive, onClick }: { name: string; svg?: string; isActive: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
                isActive ? "bg-brand-500 text-white border-brand-500" : "bg-[--paper] text-[--muted] border-[--border] hover:bg-[--highlight] hover:text-[--foreground]",
            )}
        >
            {svg && <span className="size-4 [&>svg]:size-4" dangerouslySetInnerHTML={{ __html: svg }} />}
            {name}
        </button>
    )
}

export function AchievementCard({ definition, entryMap }: { definition: Achievement_Definition; entryMap: Map<string, Achievement_Entry> }) {
    const maxTier = definition.MaxTier || 0
    const isOneTime = maxTier === 0
    const { config: animeConfig } = useAnimeTheme()
    const achievementName = animeConfig.achievementNames[definition.Key] ?? definition.Name

    if (isOneTime) {
        const entry = entryMap.get(`${definition.Key}:0`)
        const isUnlocked = entry?.isUnlocked ?? false
        return (
            <div className={cn("relative flex items-start gap-3 p-4 rounded-xl border transition-colors", isUnlocked ? "bg-[--paper] border-yellow-500/30" : "bg-[--paper] border-[--border] opacity-60")}>
                <AchievementIcon svg={definition.IconSVG} isUnlocked={isUnlocked} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{achievementName}</span>
                        {isUnlocked && <Badge size="sm" intent="warning">Unlocked</Badge>}
                    </div>
                    <p className="text-xs text-[--muted] mt-0.5">{formatDescription(definition.Description, definition.TierThresholds, 0)}</p>
                    {entry?.unlockedAt && <p className="text-xs text-[--muted] mt-1">{new Date(entry.unlockedAt).toLocaleDateString()}</p>}
                </div>
                {!isUnlocked && <LuLock className="absolute top-2 right-2 size-3 text-[--muted]" />}
            </div>
        )
    }

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
            isFullyUnlocked ? "bg-[--paper] border-yellow-500/30" : highestUnlockedTier > 0 ? "bg-[--paper] border-brand-500/20" : "bg-[--paper] border-[--border] opacity-60",
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
                <div className="flex items-center gap-1 mt-2">
                    {Array.from({ length: maxTier }, (_, i) => (
                        <div key={i + 1} className={cn("size-2 rounded-full", i + 1 <= highestUnlockedTier ? "bg-yellow-500" : "bg-[--border]")} title={definition.TierNames?.[i] ?? `Tier ${i + 1}`} />
                    ))}
                </div>
                {!isFullyUnlocked && nextThreshold > 0 && (
                    <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-[--muted] mb-0.5">
                            <span>Progress to {definition.TierNames?.[nextTier - 1] ?? `Tier ${nextTier}`}</span>
                            <span>{Math.round(progress)} / {nextThreshold}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[--border] overflow-hidden">
                            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
                        </div>
                    </div>
                )}
            </div>
            {highestUnlockedTier === 0 && <LuLock className="absolute top-2 right-2 size-3 text-[--muted]" />}
        </div>
    )
}

export function AchievementIcon({ svg, isUnlocked }: { svg: string; isUnlocked: boolean }) {
    return (
        <div className={cn("size-10 min-w-[2.5rem] flex items-center justify-center rounded-lg [&>svg]:size-6", isUnlocked ? "bg-yellow-500/20 text-yellow-500" : "bg-[--highlight] text-[--muted]")}>
            <span dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
    )
}

export function ProgressRing({ value }: { value: number }) {
    const r = 28, c = 2 * Math.PI * r, offset = c - (value / 100) * c
    return (
        <div className="relative size-16 flex items-center justify-center">
            <svg className="size-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" className="text-[--border]" strokeWidth="4" />
                <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" className="text-yellow-500 transition-all duration-700" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
            </svg>
            <span className="absolute text-xs font-bold">{Math.round(value)}%</span>
        </div>
    )
}

// ─────────────────────── Helpers ───────────────────────

export function getHeatmapColor(intensity: number): string {
    if (intensity <= 0) return "fill-gray-800"
    if (intensity < 0.25) return "fill-emerald-900"
    if (intensity < 0.5) return "fill-emerald-700"
    if (intensity < 0.75) return "fill-emerald-500"
    return "fill-emerald-400"
}

export function formatTimeAgo(date: Date): string {
    const now = Date.now()
    const diff = now - date.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    return `${months}mo ago`
}

export function getLevelColor(level: number): { ring: string; glow: string; label: string } {
    if (level >= 100) return { ring: "stroke-yellow-400", glow: "shadow-yellow-400/50", label: "text-yellow-400" }
    if (level >= 50) return { ring: "stroke-purple-400", glow: "shadow-purple-400/50", label: "text-purple-400" }
    if (level >= 20) return { ring: "stroke-blue-400", glow: "shadow-blue-400/50", label: "text-blue-400" }
    return { ring: "stroke-gray-400", glow: "shadow-gray-400/30", label: "text-gray-400" }
}

// ─────────────────────── Favorites Tab ───────────────────────

function FavoritesTabContent() {
    const { data: animeIds } = useGetAnimeFavorites()
    const { data: mangaIds } = useGetMangaFavorites()
    const { data: characterIds } = useGetCharacterFavorites()
    const { data: staffIds } = useGetStaffFavorites()
    const { data: studioIds } = useGetStudioFavorites()

    const sections = [
        { label: "Anime", ids: animeIds, type: "anime" as const },
        { label: "Manga", ids: mangaIds, type: "manga" as const },
        { label: "Characters", ids: characterIds, type: "character" as const },
        { label: "Staff", ids: staffIds, type: "staff" as const },
        { label: "Studios", ids: studioIds, type: "studio" as const },
    ]

    const totalCount = sections.reduce((acc, s) => acc + (s.ids?.length ?? 0), 0)

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <LuHeart className="text-red-400" /> My Favorites
                </h2>
                <span className="text-sm text-[--muted]">{totalCount} total</span>
            </div>
            {sections.map((section) => (
                <FavoriteSection key={section.type} label={section.label} ids={section.ids ?? []} type={section.type} />
            ))}
        </div>
    )
}

function FavoriteSection({ label, ids, type }: { label: string; ids: number[]; type: "anime" | "manga" | "character" | "staff" | "studio" }) {
    if (ids.length === 0) {
        return (
            <div className="space-y-2">
                <h3 className="text-lg font-medium text-[--muted]">{label}</h3>
                <p className="text-sm text-[--muted] italic">No {label.toLowerCase()} favorited yet</p>
            </div>
        )
    }

    const linkBase = type === "anime" ? "/entry?id=" :
        type === "manga" ? "/manga/entry?id=" :
        type === "character" ? "/character?id=" :
        type === "staff" ? "/staff?id=" :
        "/studio?id="

    return (
        <div className="space-y-3">
            <h3 className="text-lg font-medium">{label} <span className="text-[--muted] text-sm">({ids.length})</span></h3>
            <div className="flex flex-wrap gap-2">
                {ids.map((id) => (
                    <a
                        key={id}
                        href={`${linkBase}${id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[--subtle] hover:bg-[--subtle-highlight] border border-[--border] text-sm transition-colors"
                    >
                        <LuHeart className="size-3 text-red-400" />
                        <span>#{id}</span>
                    </a>
                ))}
            </div>
        </div>
    )
}
