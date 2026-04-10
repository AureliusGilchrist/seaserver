"use client"

import { useGetCommunityProfiles, useGetActivityFeed } from "@/api/hooks/community.hooks"
import { Handlers_CommunityProfile, Handlers_AggregateStats, Handlers_ActivityFeedEntry } from "@/api/generated/types"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import React from "react"
import { LuUsers, LuLayoutGrid, LuList, LuTrophy, LuStar, LuActivity, LuZap } from "react-icons/lu"
import { SeaLink } from "@/components/shared/sea-link"

export default function Page() {
    const { data, isLoading } = useGetCommunityProfiles()
    const { data: feed } = useGetActivityFeed()
    const [view, setView] = React.useState<"grid" | "leaderboard">("grid")

    if (isLoading) {
        return (
            <PageWrapper className="p-4 sm:p-8 flex items-center justify-center min-h-[50vh]">
                <LoadingSpinner />
            </PageWrapper>
        )
    }

    const profiles = data?.profiles ?? []
    const stats = data?.aggregateStats

    if (profiles.length === 0) {
        return (
            <PageWrapper className="p-4 sm:p-8 flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <LuUsers className="size-12 text-[--muted]" />
                <p className="text-[--muted] text-lg">No community profiles yet</p>
            </PageWrapper>
        )
    }

    const sorted = [...profiles].sort((a, b) => b.totalXP - a.totalXP)

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="p-4 sm:p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <LuUsers className="size-7 text-brand-300" />
                        <h1 className="text-2xl font-bold">Community</h1>
                        <span className="text-[--muted] text-sm">({profiles.length} profiles)</span>
                    </div>
                    <div className="flex items-center gap-1 bg-[--subtle] rounded-md p-1">
                        <button
                            className={cn(
                                "p-2 rounded transition-colors",
                                view === "grid" ? "bg-[--muted] text-white" : "text-[--muted] hover:text-white",
                            )}
                            onClick={() => setView("grid")}
                        >
                            <LuLayoutGrid className="size-4" />
                        </button>
                        <button
                            className={cn(
                                "p-2 rounded transition-colors",
                                view === "leaderboard" ? "bg-[--muted] text-white" : "text-[--muted] hover:text-white",
                            )}
                            onClick={() => setView("leaderboard")}
                        >
                            <LuList className="size-4" />
                        </button>
                    </div>
                </div>

                {/* Aggregate Stats Bar */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatCard icon={<LuUsers className="size-4" />} label="Profiles" value={stats.totalProfiles} />
                        <StatCard icon={<LuStar className="size-4" />} label="Total XP" value={stats.totalXP.toLocaleString()} />
                        <StatCard icon={<LuTrophy className="size-4" />} label="Achievements" value={stats.totalAchievements} />
                        <StatCard icon={<LuZap className="size-4" />} label="Highest Level" value={stats.highestLevel} />
                    </div>
                )}

                {view === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {sorted.map((profile) => (
                            <CommunityProfileCard key={profile.id} profile={profile} />
                        ))}
                    </div>
                ) : (
                    <LeaderboardView profiles={sorted} />
                )}

                {/* Activity Feed */}
                {feed && feed.length > 0 && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <LuActivity className="text-brand-300" />
                            Recent Activity
                        </h2>
                        <div className="space-y-2">
                            {feed.slice(0, 20).map((entry, idx) => (
                                <FeedRow key={idx} entry={entry} />
                            ))}
                        </div>
                    </div>
                )}
            </PageWrapper>
        </>
    )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="bg-[--subtle] rounded-lg p-3 flex items-center gap-3">
            <div className="text-brand-300">{icon}</div>
            <div>
                <p className="text-lg font-bold">{value}</p>
                <p className="text-xs text-[--muted]">{label}</p>
            </div>
        </div>
    )
}

function FeedRow({ entry }: { entry: Handlers_ActivityFeedEntry }) {
    const timeAgo = entry.unlockedAt ? formatTimeAgo(new Date(entry.unlockedAt)) : ""
    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-[--subtle]">
            {entry.profileAvatar ? (
                <img src={entry.profileAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {entry.profileName.charAt(0).toUpperCase()}
                </div>
            )}
            {entry.iconSvg && (
                <div className="w-5 h-5 shrink-0 text-emerald-400" dangerouslySetInnerHTML={{ __html: entry.iconSvg }} />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm">
                    <SeaLink href={`/profile/user?id=${entry.profileId}`}>
                        <span className="font-semibold hover:underline">{entry.profileName}</span>
                    </SeaLink>
                    {" "}unlocked{" "}
                    <span className="font-semibold text-emerald-400">{entry.achievementName}</span>
                    {entry.achievementTier > 0 && <span className="text-[--muted]"> (Tier {entry.achievementTier})</span>}
                </p>
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

export function LevelRingAvatar({ profile, size = 80 }: { profile: { currentLevel: number; avatarPath?: string; anilistAvatar?: string; name: string }; size?: number }) {
    const colors = getLevelColor(profile.currentLevel)
    const avatarSrc = profile.avatarPath || profile.anilistAvatar
    const radius = (size - 6) / 2
    const circumference = 2 * Math.PI * radius
    const progress = Math.min(profile.currentLevel / 50, 1)
    const strokeDashoffset = circumference * (1 - progress)

    return (
        <div className={cn("relative inline-flex items-center justify-center rounded-full", `shadow-lg ${colors.glow}`)} style={{ width: size, height: size }}>
            <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={3}
                    className="stroke-gray-700/50"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={3}
                    className={colors.ring}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
            </svg>
            {avatarSrc ? (
                <img
                    src={avatarSrc}
                    alt={profile.name}
                    className="rounded-full object-cover"
                    style={{ width: size - 10, height: size - 10 }}
                />
            ) : (
                <div
                    className="rounded-full bg-[--muted] flex items-center justify-center text-white font-bold"
                    style={{ width: size - 10, height: size - 10, fontSize: size / 3 }}
                >
                    {profile.name.charAt(0).toUpperCase()}
                </div>
            )}
        </div>
    )
}

function CommunityProfileCard({ profile }: { profile: Handlers_CommunityProfile }) {
    const colors = getLevelColor(profile.currentLevel)

    return (
        <SeaLink href={`/profile/user?id=${profile.id}`}>
            <div className="flex flex-col items-center gap-3 p-4 rounded-lg bg-[--subtle] hover:bg-[--subtle-highlight] transition-colors cursor-pointer group">
                <LevelRingAvatar profile={profile} size={80} />
                <div className="text-center min-w-0 w-full">
                    <p className="font-semibold text-sm truncate">{profile.name}</p>
                    <p className={cn("text-xs font-bold", colors.label)}>Lv. {profile.currentLevel}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-[--muted]">
                    <span className="flex items-center gap-1">
                        <LuTrophy className="size-3" />
                        {profile.achievementCount}
                    </span>
                    <span className="flex items-center gap-1">
                        <LuStar className="size-3" />
                        {profile.totalXP.toLocaleString()} XP
                    </span>
                </div>
            </div>
        </SeaLink>
    )
}

function LeaderboardView({ profiles }: { profiles: Handlers_CommunityProfile[] }) {
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-[3rem_1fr_6rem_6rem_7rem] gap-4 px-4 py-2 text-xs text-[--muted] font-semibold uppercase tracking-wider">
                <span>#</span>
                <span>User</span>
                <span className="text-right">Level</span>
                <span className="text-right">Achievements</span>
                <span className="text-right">Total XP</span>
            </div>
            {profiles.map((profile, idx) => (
                <LeaderboardRow key={profile.id} profile={profile} rank={idx + 1} />
            ))}
        </div>
    )
}

function LeaderboardRow({ profile, rank }: { profile: Handlers_CommunityProfile; rank: number }) {
    const colors = getLevelColor(profile.currentLevel)

    return (
        <SeaLink href={`/profile/user?id=${profile.id}`}>
            <div className="grid grid-cols-[3rem_1fr_6rem_6rem_7rem] gap-4 items-center px-4 py-3 rounded-lg bg-[--subtle] hover:bg-[--subtle-highlight] transition-colors cursor-pointer">
                <span className={cn(
                    "text-lg font-bold",
                    rank === 1 && "text-yellow-400",
                    rank === 2 && "text-gray-300",
                    rank === 3 && "text-amber-600",
                    rank > 3 && "text-[--muted]",
                )}>
                    {rank}
                </span>
                <div className="flex items-center gap-3 min-w-0">
                    <LevelRingAvatar profile={profile} size={40} />
                    <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{profile.name}</p>
                        {profile.bio && (
                            <p className="text-xs text-[--muted] truncate max-w-[200px]">{profile.bio}</p>
                        )}
                    </div>
                </div>
                <span className={cn("text-right font-bold", colors.label)}>
                    {profile.currentLevel}
                </span>
                <span className="text-right text-[--muted]">
                    {profile.achievementCount}
                </span>
                <span className="text-right text-[--muted]">
                    {profile.totalXP.toLocaleString()}
                </span>
            </div>
        </SeaLink>
    )
}
