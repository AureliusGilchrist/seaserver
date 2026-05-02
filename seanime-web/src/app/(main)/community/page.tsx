"use client"

import { useGetCommunityProfiles, useGetActivityFeed } from "@/api/hooks/community.hooks"
import { Handlers_CommunityProfile, Handlers_AggregateStats, Handlers_ActivityFeedEntry } from "@/api/generated/types"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useRewards } from "@/lib/rewards/reward-provider"
import { ANIME_THEMES } from "@/lib/theme/anime-themes"
import { useAtomValue } from "jotai"
import * as React from "react"
import { LuUsers, LuLayoutGrid, LuList, LuTrophy, LuStar, LuActivity, LuZap } from "react-icons/lu"
import { SeaLink } from "@/components/shared/sea-link"

/** Resolve a stored displayTitle — turns raw milestone IDs like "milestone-tokyo-ghoul-75"
 *  into the actual rank name from the theme config. */
function resolveDisplayTitle(title: string): string {
    const m = title.match(/^milestone-(.+)-(\d+)$/)
    if (!m) return title
    const name = ANIME_THEMES?.[m[1] as keyof typeof ANIME_THEMES]?.milestoneNames?.[Number(m[2])]
    return name ?? title
}

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

// Tier data drives both the ring SVG color and the label text color.
// Tiers 0-7 are solid; tiers 8+ use animated SVG gradients (see LevelRingAvatar).
export function getLevelTier(level: number): {
    tier: string
    ringClass: string   // Tailwind SVG stroke class (used for solid tiers)
    glow: string        // Tailwind shadow class
    label: string       // Tailwind text color class
    animated: boolean   // true → use SVG gradient in LevelRingAvatar
} {
    if (level >= 200) return { tier: "prismatic",      ringClass: "stroke-fuchsia-400", glow: "shadow-fuchsia-400/60", label: "text-fuchsia-400",   animated: true  }
    if (level >= 150) return { tier: "gold-rose",      ringClass: "stroke-yellow-300",  glow: "shadow-yellow-400/60",  label: "text-yellow-300",    animated: true  }
    if (level >= 100) return { tier: "gold-shimmer",   ringClass: "stroke-yellow-400",  glow: "shadow-yellow-400/50",  label: "text-yellow-400",    animated: true  }
    if (level >=  80) return { tier: "gold",           ringClass: "stroke-yellow-400",  glow: "shadow-yellow-400/50",  label: "text-yellow-400",    animated: false }
    if (level >=  65) return { tier: "purple",         ringClass: "stroke-purple-400",  glow: "shadow-purple-400/50",  label: "text-purple-400",    animated: false }
    if (level >=  50) return { tier: "indigo",         ringClass: "stroke-indigo-400",  glow: "shadow-indigo-400/50",  label: "text-indigo-400",    animated: false }
    if (level >=  35) return { tier: "blue",           ringClass: "stroke-blue-400",    glow: "shadow-blue-400/50",    label: "text-blue-400",      animated: false }
    if (level >=  20) return { tier: "teal",           ringClass: "stroke-teal-400",    glow: "shadow-teal-400/40",    label: "text-teal-400",      animated: false }
    if (level >=  10) return { tier: "green",          ringClass: "stroke-green-400",   glow: "shadow-green-400/30",   label: "text-green-400",     animated: false }
    return               { tier: "gray",           ringClass: "stroke-gray-400",    glow: "shadow-gray-400/30",    label: "text-gray-400",      animated: false }
}

/** @deprecated use getLevelTier */
function getLevelColor(level: number): { ring: string; glow: string; label: string } {
    const t = getLevelTier(level)
    return { ring: t.ringClass, glow: t.glow, label: t.label }
}

export function xpForLevel(level: number): number {
    if (level <= 1) return 0
    return Math.floor(100 * Math.pow(level - 1, 1.5))
}

// Gradient stop definitions per animated tier
const RING_GRADIENTS: Record<string, { stops: string[]; dur: string }> = {
    "gold-shimmer": {
        stops: ["#78350f", "#fbbf24", "#fde68a", "#fbbf24", "#78350f"],
        dur: "2s",
    },
    "gold-rose": {
        stops: ["#fbbf24", "#f9a8d4", "#fde68a", "#f9a8d4", "#fbbf24"],
        dur: "2.5s",
    },
    "prismatic": {
        stops: ["#f43f5e", "#f97316", "#facc15", "#4ade80", "#60a5fa", "#a78bfa", "#f43f5e"],
        dur: "3s",
    },
}

export function LevelRingAvatar({ profile, size = 80, xpBarFillOverride }: { profile: { currentLevel: number; totalXP?: number; avatarPath?: string; anilistAvatar?: string; name: string }; size?: number; xpBarFillOverride?: string }) {
    const tierInfo = getLevelTier(profile.currentLevel)
    const avatarSrc = profile.avatarPath || profile.anilistAvatar
    const radius = (size - 6) / 2
    const circumference = 2 * Math.PI * radius
    const currentLevelXP = xpForLevel(profile.currentLevel)
    const nextLevelXP = xpForLevel(profile.currentLevel + 1)
    const xpRange = nextLevelXP - currentLevelXP
    const xpInLevel = (profile.totalXP ?? 0) - currentLevelXP
    const progress = xpRange > 0 ? Math.max(0, Math.min(xpInLevel / xpRange, 1)) : 0
    const strokeDashoffset = circumference * (1 - progress)

    const gradId = `lvring-${tierInfo.tier}-${size}`
    const gradDef = RING_GRADIENTS[tierInfo.tier]

    // xpBarFillOverride support — extract first colour stop for glow
    const overrideGlowColor = xpBarFillOverride
        ? (xpBarFillOverride.startsWith("linear-gradient")
            ? (xpBarFillOverride.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g)?.[0] ?? null)
            : xpBarFillOverride)
        : null

    const glowColor = overrideGlowColor ?? gradDef?.stops?.[0] ?? null
    const glowStyle = glowColor ? { boxShadow: `0 0 16px 4px ${glowColor}60` } : {}

    return (
        <div className={cn("relative inline-flex items-center justify-center rounded-full", !glowColor && `shadow-lg ${tierInfo.glow}`)} style={{ width: size, height: size, ...glowStyle }}>
            <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {gradDef && (
                    <defs>
                        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="objectBoundingBox">
                            {gradDef.stops.map((color, i) => (
                                <stop key={i} offset={`${(i / (gradDef.stops.length - 1)) * 100}%`} stopColor={color} />
                            ))}
                            {/* Animate the gradient sweep for a shimmer effect */}
                            <animateTransform
                                attributeName="gradientTransform"
                                type="translate"
                                from="-1 0"
                                to="1 0"
                                dur={gradDef.dur}
                                repeatCount="indefinite"
                            />
                        </linearGradient>
                    </defs>
                )}
                {/* Track */}
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={3} className="stroke-gray-700/50" />
                {/* Progress ring */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={tierInfo.animated ? 4 : 3}
                    className={!xpBarFillOverride && !tierInfo.animated ? tierInfo.ringClass : ""}
                    style={{
                        stroke: xpBarFillOverride
                            ? (xpBarFillOverride.startsWith("linear-gradient") ? overrideGlowColor ?? undefined : xpBarFillOverride)
                            : (tierInfo.animated ? `url(#${gradId})` : undefined),
                        transition: "stroke-dashoffset 0.6s ease",
                    }}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
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
    const currentProfile = useAtomValue(currentProfileAtom)
    const { activeXPBarSkin, activeNameColor, activeTitle } = useRewards()

    // For the current user, prefer local reward state over potentially-stale backend data
    const isSelf = currentProfile?.id === profile.id
    const xpBarFillCss   = isSelf ? (activeXPBarSkin?.fillCss   ?? profile.xpBarFillCss)   : profile.xpBarFillCss
    const xpBarAnimClass = isSelf ? (activeXPBarSkin?.animClass  ?? profile.xpBarAnimClass) : profile.xpBarAnimClass
    const nameColorCss   = isSelf ? (activeNameColor?.color      ?? profile.nameColorCss)   : profile.nameColorCss
    const nameGradientCss= isSelf ? (activeNameColor?.gradientCss ?? profile.nameGradientCss) : profile.nameGradientCss
    // Resolve the display title — converts raw IDs like "milestone-tokyo-ghoul-75" to the rank name
    const rawTitle       = isSelf ? (activeTitle?.text ?? profile.displayTitle) : profile.displayTitle
    const displayTitle   = rawTitle ? resolveDisplayTitle(rawTitle) : ""

    return (
        <SeaLink href={`/profile/user?id=${profile.id}`}>
            <div className="sea-hoverable relative flex flex-col items-center gap-3 p-4 rounded-lg bg-[--subtle] hover:bg-[--subtle-highlight] transition-colors cursor-pointer group overflow-hidden">
                {profile.bannerImage && (
                    <>
                        <div
                            className="absolute inset-0 bg-cover bg-center blur-md scale-110 opacity-30"
                            style={{ backgroundImage: `url(${profile.bannerImage})` }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[--subtle] via-[--subtle]/80 to-transparent" />
                    </>
                )}
                <div className="relative z-10 flex flex-col items-center gap-3 w-full">
                    <LevelRingAvatar profile={profile} size={80} xpBarFillOverride={xpBarFillCss || undefined} />
                    <div className="text-center min-w-0 w-full">
                        <p
                            className="font-semibold text-sm truncate"
                            style={nameGradientCss
                                ? { backgroundImage: nameGradientCss, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                                : nameColorCss ? { color: nameColorCss } : {}}
                        >
                            {profile.name}
                        </p>
                        {displayTitle && (
                            <p className="text-[10px] font-semibold truncate mb-0.5" style={{ color: profile.displayTitleColor || "#94a3b8" }}>
                                {displayTitle}
                            </p>
                        )}
                        <p className={cn("text-xs font-bold", colors.label)}>Lv. {profile.currentLevel}</p>
                    </div>
                    {xpBarFillCss && (
                        <div className="w-full h-1.5 rounded-full overflow-hidden bg-white/10">
                            <div
                                className={cn("h-full rounded-full", xpBarAnimClass)}
                                style={{ width: "100%", background: xpBarFillCss, backgroundSize: xpBarAnimClass ? "300% 100%" : undefined }}
                            />
                        </div>
                    )}
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
    const currentProfile = useAtomValue(currentProfileAtom)
    const { activeXPBarSkin, activeTitle } = useRewards()
    const isSelf = currentProfile?.id === profile.id
    const xpBarFillCss   = isSelf ? (activeXPBarSkin?.fillCss ?? profile.xpBarFillCss) : profile.xpBarFillCss
    const rawTitle       = isSelf ? (activeTitle?.text ?? profile.displayTitle) : profile.displayTitle
    const displayTitle   = rawTitle ? resolveDisplayTitle(rawTitle) : ""

    return (
        <SeaLink href={`/profile/user?id=${profile.id}`}>
            <div className="sea-hoverable grid grid-cols-[3rem_1fr_6rem_6rem_7rem] gap-4 items-center px-4 py-3 rounded-lg bg-[--subtle] hover:bg-[--subtle-highlight] transition-colors cursor-pointer">
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
                    <LevelRingAvatar profile={profile} size={40} xpBarFillOverride={xpBarFillCss || undefined} />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate">{profile.name}</p>
                            {displayTitle && (
                                <span className="text-[10px] font-semibold shrink-0" style={{ color: profile.displayTitleColor || "#94a3b8" }}>
                                    {displayTitle}
                                </span>
                            )}
                        </div>
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
