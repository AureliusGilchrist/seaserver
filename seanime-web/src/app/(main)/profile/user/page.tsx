"use client"

import { useGetUserProfile } from "@/api/hooks/community.hooks"
import { Handlers_RecentAchievementEntry, Handlers_ShowcaseEntry, ProfileStats_StreakInfo } from "@/api/generated/types"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { LevelRingAvatar } from "@/app/(main)/community/page"
import { ActivityHeatmap } from "@/app/(main)/_features/profile/activity-heatmap"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useSearchParams } from "@/lib/navigation"
import React from "react"
import { LuTrophy, LuStar, LuArrowLeft, LuFlame, LuCalendar, LuBookOpen, LuTv, LuClock } from "react-icons/lu"
import { SeaLink } from "@/components/shared/sea-link"

export default function Page() {
    const searchParams = useSearchParams()
    const id = Number(searchParams.get("id")) || 0

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
            {/* Banner */}
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

                {/* Profile header */}
                <div className="flex items-center gap-6">
                    <LevelRingAvatar
                        profile={{
                            currentLevel: level?.currentLevel ?? 1,
                            avatarPath: profile!.avatarPath,
                            anilistAvatar: profile!.anilistAvatar,
                            name: profile!.name,
                        }}
                        size={100}
                    />
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold">{profile!.name}</h1>
                        <p className={cn("text-lg font-bold", levelColors.label)}>
                            Level {level?.currentLevel ?? 1}
                        </p>
                        {profile!.bio && (
                            <p className="text-[--muted] text-sm max-w-md">{profile!.bio}</p>
                        )}
                    </div>
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap items-center gap-6">
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
                    
                    {level && level.currentLevel < 50 && (
                        <div className="text-sm text-[--muted]">
                            {level.xpToNext.toLocaleString()} Experite to next level
                        </div>
                    )}
                </div>

                {/* Level progress bar */}
                {level && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-[--muted]">
                            <span>Level {level.currentLevel}</span>
                            <span>Level {Math.min(level.currentLevel + 1, 50)}</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                                className={cn("h-full rounded-full transition-all duration-500", levelColors.ring.replace("stroke-", "bg-"))}
                                style={{ width: `${level.xpNeededForLevel > 0 ? (level.xpInCurrentLevel / level.xpNeededForLevel) * 100 : 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Streaks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <StreakCard label="Anime Streak" icon={<LuTv className="text-lg" />} streak={animeStreak} />
                    <StreakCard label="Manga Streak" icon={<LuBookOpen className="text-lg" />} streak={mangaStreak} />
                </div>

                {/* Activity Heatmap */}
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <LuCalendar className="text-blue-400" />
                        Activity (90 days)
                    </h2>
                    <ActivityHeatmap days={activityHeatmap} />
                </div>

                {/* Achievement Showcase */}
                {showcase && showcase.length > 0 && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold">Showcase</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {showcase.map((entry) => (
                                <ShowcaseCard key={entry.slot} entry={entry} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Achievements */}
                {recentAchievements && recentAchievements.length > 0 && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <LuClock className="text-emerald-400" />
                            Recent Achievements
                        </h2>
                        <div className="space-y-2">
                            {recentAchievements.map((ach) => (
                                <RecentAchievementRow key={`${ach.key}-${ach.tier}`} entry={ach} />
                            ))}
                        </div>
                    </div>
                )}
            </PageWrapper>
        </>
    )
}

function StreakCard({ label, icon, streak }: { label: string; icon: React.ReactNode; streak?: ProfileStats_StreakInfo }) {
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

function ShowcaseCard({ entry }: { entry: Handlers_ShowcaseEntry }) {
    return (
        <div className="p-3 rounded-lg bg-[--subtle] text-center space-y-2">
            {entry.definition?.IconSVG && (
                <div
                    className="w-8 h-8 mx-auto text-brand-300"
                    dangerouslySetInnerHTML={{ __html: entry.definition.IconSVG }}
                />
            )}
            <p className="font-semibold text-sm truncate">
                {entry.definition?.Name ?? entry.key}
            </p>
            {entry.tier > 0 && (
                <p className="text-xs text-[--muted]">Tier {entry.tier}</p>
            )}
        </div>
    )
}

function RecentAchievementRow({ entry }: { entry: Handlers_RecentAchievementEntry }) {
    const timeAgo = entry.unlockedAt ? formatTimeAgo(new Date(entry.unlockedAt)) : ""
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[--subtle]">
            {entry.definition?.IconSVG && (
                <div
                    className="w-6 h-6 shrink-0 text-emerald-400"
                    dangerouslySetInnerHTML={{ __html: entry.definition.IconSVG }}
                />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{entry.definition?.Name ?? entry.key}</p>
                {entry.tier > 0 && <p className="text-xs text-[--muted]">Tier {entry.tier}</p>}
            </div>
            {timeAgo && <span className="text-xs text-[--muted] shrink-0">{timeAgo}</span>}
        </div>
    )
}

function formatTimeAgo(date: Date): string {
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

function getLevelColor(level: number): { ring: string; glow: string; label: string } {
    if (level >= 40) return { ring: "stroke-yellow-400", glow: "shadow-yellow-400/50", label: "text-yellow-400" }
    if (level >= 25) return { ring: "stroke-purple-400", glow: "shadow-purple-400/50", label: "text-purple-400" }
    if (level >= 10) return { ring: "stroke-blue-400", glow: "shadow-blue-400/50", label: "text-blue-400" }
    return { ring: "stroke-gray-400", glow: "shadow-gray-400/30", label: "text-gray-400" }
}
