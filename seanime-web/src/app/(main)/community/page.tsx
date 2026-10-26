"use client"

import { useGetCommunityProfiles } from "@/api/hooks/community.hooks"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { ProfileTimeline } from "@/app/(main)/_features/profile/profile-timeline"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { cn } from "@/components/ui/core/styling"
import { Skeleton } from "@/components/ui/skeleton"
import { useRewards } from "@/lib/rewards/reward-provider"
import { XPBarFxOverlay } from "@/lib/rewards/xpbar-fx-overlay"
import { ANIME_THEMES } from "@/lib/theme/anime-themes"
import { getMilestoneName } from "@/lib/theme/anime-themes/anime-theme-provider"
import { formatNumber } from "@/lib/helpers/number"
import { useAtomValue } from "jotai"
import * as React from "react"
import { LuUsers, LuLayoutGrid, LuList, LuTrophy, LuStar, LuZap, LuCrown, LuChevronRight } from "react-icons/lu"
import { Modal } from "@/components/ui/modal"
import { SeaLink } from "@/components/shared/sea-link"

/** One profile on the community page (internal/handlers/community.go CommunityProfile). */
type Handlers_CommunityProfile = {
    id: number
    name: string
    anilistUsername: string
    anilistAvatar: string
    avatarPath: string
    bio: string
    bannerImage: string
    isAdmin: boolean
    currentLevel: number
    totalXP: number
    achievementCount: number
    displayTitle: string
    displayTitleColor: string
    themeId: string
    currentMilestoneName: string
    xpBarFillCss: string
    xpBarAnimClass: string
    xpBarSkinId: string
    nameColorCss: string
    nameGradientCss: string
}

/** Resolve a stored displayTitle — turns raw milestone IDs like "milestone-tokyo-ghoul-75"
 *  into the actual rank name from the theme config. */
function resolveDisplayTitle(title: string): string {
    const m = title.match(/^milestone-(.+)-(\d+)$/)
    if (!m) return title
    const names = ANIME_THEMES?.[m[1] as keyof typeof ANIME_THEMES]?.milestoneNames
    return getMilestoneName(Number(m[2]), names) ?? title
}

export default function Page() {
    const { data, isLoading } = useGetCommunityProfiles()
    const me = useAtomValue(currentProfileAtom)
    const [membersOpen, setMembersOpen] = React.useState(false)
    const [view, setView] = React.useState<"grid" | "leaderboard">("grid")

    const profiles: Handlers_CommunityProfile[] = data?.profiles ?? []
    const stats = data?.aggregateStats
    const sorted = React.useMemo(() => [...profiles].sort((a, b) => b.totalXP - a.totalXP), [profiles])

    if (isLoading) return <CommunitySkeleton />

    if (profiles.length === 0) {
        return (
            <PageWrapper className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-4 sm:p-8">
                <LuUsers className="size-12 text-[--muted]" />
                <p className="text-lg text-[--muted]">No community profiles yet</p>
            </PageWrapper>
        )
    }

    return (
        <>
            <CustomLibraryBanner discrete />
            <PageWrapper className="mx-auto max-w-[96rem] space-y-6 p-4 sm:p-8">
                {/* Header band */}
                <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500/15 via-white/[0.03] to-transparent p-5 backdrop-blur-md backdrop-saturate-150 ring-1 ring-white/[0.08] sm:p-6">
                    <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand-500/20 blur-3xl" />
                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex items-center gap-3">
                            <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/30">
                                <LuUsers className="size-6" />
                            </span>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Community</h1>
                                <p className="text-sm text-[--muted]">What everyone's watching, reading and unlocking.</p>
                            </div>
                        </div>
                        {stats && (
                            <div className="flex flex-wrap gap-2">
                                <StatPill icon={<LuUsers className="size-3.5" />} label="Members" value={formatNumber(stats.totalProfiles)} />
                                <StatPill icon={<LuStar className="size-3.5" />} label="Total XP" value={formatNumber(stats.totalXP)} />
                                <StatPill icon={<LuTrophy className="size-3.5" />} label="Achievements" value={formatNumber(stats.totalAchievements)} />
                                <StatPill icon={<LuZap className="size-3.5" />} label="Top level" value={stats.highestLevel} />
                            </div>
                        )}
                    </div>
                </header>

                {/* Mobile: members strip above the feed */}
                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
                    {sorted.map(p => (
                        <SeaLink key={p.id} href={`/profile/user?id=${p.id}`} className="flex w-16 shrink-0 flex-col items-center gap-1">
                            <LevelRingAvatar profile={p} size={56} xpBarFillOverride={p.xpBarFillCss || undefined} />
                            <span className="w-full truncate text-center text-[0.7rem]">{p.name}</span>
                        </SeaLink>
                    ))}
                    <button onClick={() => setMembersOpen(true)} className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 text-[--muted]">
                        <span className="flex size-14 items-center justify-center rounded-full bg-white/[0.05] backdrop-blur-md backdrop-saturate-150 ring-1 ring-white/10"><LuLayoutGrid className="size-5" /></span>
                        <span className="text-[0.7rem]">All</span>
                    </button>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    {/* Feed */}
                    <main className="min-w-0">
                        <ProfileTimeline community />
                    </main>

                    {/* Sidebar */}
                    <aside className="hidden space-y-4 lg:block">
                        <div className="sticky top-20 space-y-4">
                            <SidebarCard
                                title="Members"
                                icon={<LuUsers className="size-4" />}
                                action={
                                    <button onClick={() => setMembersOpen(true)} className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-300 hover:text-brand-200">
                                        View all <LuChevronRight className="size-3.5" />
                                    </button>
                                }
                            >
                                <div className="space-y-1">
                                    {sorted.slice(0, 8).map(p => <MemberRow key={p.id} profile={p} isMe={p.id === me?.id} />)}
                                </div>
                            </SidebarCard>

                            <SidebarCard title="Leaderboard" icon={<LuCrown className="size-4" />}>
                                <div className="space-y-1.5">
                                    {sorted.slice(0, 5).map((p, i) => (
                                        <SeaLink key={p.id} href={`/profile/user?id=${p.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.05]">
                                            <span className={cn(
                                                "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                                                i === 0 ? "bg-yellow-400/20 text-yellow-300" : i === 1 ? "bg-slate-300/15 text-slate-200" : i === 2 ? "bg-amber-700/25 text-amber-400" : "bg-white/[0.05] text-[--muted]",
                                            )}>{i + 1}</span>
                                            <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                                            <span className="shrink-0 text-xs tabular-nums text-[--muted]">{formatNumber(p.totalXP)} XP</span>
                                        </SeaLink>
                                    ))}
                                </div>
                            </SidebarCard>
                        </div>
                    </aside>
                </div>
            </PageWrapper>

            <Modal
                open={membersOpen}
                onOpenChange={setMembersOpen}
                title={
                    <div className="flex items-center justify-between gap-3 pr-8">
                        <span>Members</span>
                        <div className="flex items-center gap-1 rounded-lg bg-white/[0.05] p-1 ring-1 ring-white/10">
                            <button className={cn("rounded-md p-1.5 transition", view === "grid" ? "bg-white/15 text-white" : "text-[--muted] hover:text-white")} onClick={() => setView("grid")} aria-label="Grid">
                                <LuLayoutGrid className="size-4" />
                            </button>
                            <button className={cn("rounded-md p-1.5 transition", view === "leaderboard" ? "bg-white/15 text-white" : "text-[--muted] hover:text-white")} onClick={() => setView("leaderboard")} aria-label="Leaderboard">
                                <LuList className="size-4" />
                            </button>
                        </div>
                    </div>
                }
                contentClass="max-w-5xl"
            >
                {view === "grid" ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {sorted.map(profile => <CommunityProfileCard key={profile.id} profile={profile} />)}
                    </div>
                ) : (
                    <div className="overflow-x-auto"><div className="min-w-[36rem]"><LeaderboardView profiles={sorted} /></div></div>
                )}
            </Modal>
        </>
    )
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 rounded-full bg-black/25 px-3 py-1.5 ring-1 ring-white/[0.08] backdrop-blur-md backdrop-saturate-150">
            <span className="text-brand-300">{icon}</span>
            <span className="text-sm font-semibold tabular-nums">{value}</span>
            <span className="text-xs text-[--muted]">{label}</span>
        </div>
    )
}

function SidebarCard({ title, icon, action, children }: { title: string, icon: React.ReactNode, action?: React.ReactNode, children: React.ReactNode }) {
    return (
        <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.07] backdrop-blur-md backdrop-saturate-150">
            <div className="mb-3 flex items-center gap-2">
                <span className="text-brand-300">{icon}</span>
                <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
                <span className="ml-auto">{action}</span>
            </div>
            {children}
        </section>
    )
}

function MemberRow({ profile, isMe }: { profile: Handlers_CommunityProfile, isMe: boolean }) {
    const tier = getLevelTier(profile.currentLevel)
    const current = xpForLevel(profile.currentLevel)
    const next = xpForLevel(profile.currentLevel + 1)
    const pct = next > current ? Math.max(0, Math.min(100, ((profile.totalXP - current) / (next - current)) * 100)) : 0
    return (
        <SeaLink href={`/profile/user?id=${profile.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-white/[0.05]">
            <LevelRingAvatar profile={profile} size={40} xpBarFillOverride={profile.xpBarFillCss || undefined} />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                    <p className="truncate text-sm font-semibold" style={profile.nameColorCss ? { color: profile.nameColorCss } : undefined}>{profile.name}</p>
                    {isMe && <span className="shrink-0 text-[0.65rem] text-[--muted]">you</span>}
                </div>
                <div className="mt-1 flex items-center gap-2">
                    <span className={cn("shrink-0 text-[0.7rem] font-bold", tier.label)}>Lv {profile.currentLevel}</span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: profile.xpBarFillCss || "rgb(var(--color-brand-400))" }} />
                    </div>
                </div>
            </div>
        </SeaLink>
    )
}

function CommunitySkeleton() {
    return (
        <PageWrapper className="mx-auto max-w-[96rem] space-y-6 p-4 sm:p-8">
            <Skeleton className="h-28 rounded-3xl" />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
                </div>
                <Skeleton className="hidden h-96 rounded-2xl lg:block" />
            </div>
        </PageWrapper>
    )
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
    return Math.floor(100 * Math.pow(level - 1, 1.7))
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
                        {(() => {
                            const xpIsGradient = !!xpBarFillCss && xpBarFillCss.startsWith("linear-gradient")
                            const useXp = xpIsGradient
                            const useNameGrad = !useXp && !!nameGradientCss
                            const style: React.CSSProperties = useXp
                                ? { backgroundImage: xpBarFillCss, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
                                : useNameGrad
                                    ? { backgroundImage: nameGradientCss, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                                    : nameColorCss ? { color: nameColorCss } : {}
                            return (
                                <p
                                    className={"font-semibold text-sm truncate" + ((useXp || useNameGrad) ? " sea-name-shine" : "")}
                                    style={style}
                                >
                                    {profile.name}
                                </p>
                            )
                        })()}
                        {/* Show milestone name (currentMilestoneName) publicly visible to all viewers */}
                        {(profile as any).currentMilestoneName && (
                            <p className="text-[10px] font-semibold truncate mb-0.5 text-[--color-brand-300]">
                                {(profile as any).currentMilestoneName}
                            </p>
                        )}
                        <p className={cn("text-xs font-bold", colors.label)}>Lv. {profile.currentLevel}</p>
                    </div>
                    {xpBarFillCss && (
                        <div className="relative w-full h-1.5 rounded-full overflow-hidden bg-white/10">
                            <div
                                className={cn("h-full rounded-full", xpBarAnimClass)}
                                style={{ width: "100%", background: xpBarFillCss, backgroundSize: xpBarAnimClass ? "300% 100%" : undefined }}
                            />
                            <XPBarFxOverlay
                                skin={isSelf ? activeXPBarSkin : undefined}
                                skinId={!isSelf ? profile.xpBarSkinId || undefined : undefined}
                                fillCss={xpBarFillCss}
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
                            {formatNumber(profile.totalXP)} XP
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
                            {(() => {
                                const xpIsGradient = !!xpBarFillCss && xpBarFillCss.startsWith("linear-gradient")
                                const style: React.CSSProperties = xpIsGradient
                                    ? { backgroundImage: xpBarFillCss, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
                                    : {}
                                return (
                                    <p
                                        className={"font-semibold text-sm truncate" + (xpIsGradient ? " sea-name-shine" : "")}
                                        style={style}
                                    >
                                        {profile.name}
                                    </p>
                                )
                            })()}
                            {/* Show milestone name (currentMilestoneName) publicly visible to all viewers */}
                            {(profile as any).currentMilestoneName && (
                                <span className="text-[10px] font-semibold shrink-0 text-[--color-brand-300]">
                                    {(profile as any).currentMilestoneName}
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
                    {formatNumber(profile.totalXP)}
                </span>
            </div>
        </SeaLink>
    )
}
