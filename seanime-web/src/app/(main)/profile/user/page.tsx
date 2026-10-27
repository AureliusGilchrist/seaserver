"use client"

import { lookupAvatarFrame, lookupBannerOverlay, lookupProfileLayout } from "@/lib/rewards/profile-style-definitions"
import { lookupBackground, lookupBorder } from "@/lib/rewards/reward-provider"
import { profileAvatarBorderStyle, profileHeaderBackgroundStyle, profileNameStyle } from "@/lib/rewards/profile-cosmetics"
import { useGetUserAchievements } from "@/api/hooks/achievement.hooks"
import { AchievementsView } from "@/app/(main)/_features/achievement/achievements-view"
import { useGetMyProfile, useGetUserProfile } from "@/api/hooks/community.hooks"
import { useGetProfileComments, type ProfileCommentItem } from "@/api/hooks/profile-comments.hooks"
import { useGetUserProfileStats } from "@/api/hooks/profile-stats.hooks"
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { LevelRingAvatar } from "@/app/(main)/_features/level-ring-avatar"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { tabsTriggerClass, tabsListClass } from "@/components/shared/classnames"

import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter, useSearchParams } from "@/lib/navigation"
import { useAtomValue } from "jotai"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { ActivityTabContent } from "@/app/(main)/_features/profile/activity-tab-content"
import { LuMessagesSquare } from "react-icons/lu"
import { ProfileWallpaper } from "@/app/(main)/profile/_components/profile-wallpaper"
import { ActivityBuffBadge, MyProfilePage, StreakCard, StatsActivityHeatmap, DayOfWeekChart, getLevelColor } from "@/app/(main)/profile/me/page"
import { getProfileOwnerMilestoneName } from "@/lib/theme/anime-themes/anime-theme-provider"
import { XPBarFill } from "@/lib/rewards/xp-bar-fill"
import * as React from "react"
import { profileAccentStyle } from "@/lib/rewards/profile-accent"
import {
    LuTrophy, LuStar, LuArrowLeft, LuCalendar, LuBookOpen,
    LuTv, LuActivity, LuListVideo, LuMessageSquare, LuMessageCircle,
} from "react-icons/lu"
import { SeaLink } from "@/components/shared/sea-link"
import { Stats } from "@/components/ui/stats"
import { ToWatchList } from "@/app/(main)/profile/_components/to-watch-list"
import { formatNumber } from "@/lib/helpers/number"
import { __isDesktop__ } from "@/types/constants"

export default function Page() {
    const searchParams = useSearchParams()
    const currentProfile = useAtomValue(currentProfileAtom)
    // The atom is only filled on profile login, so after a reload ask the server who "me" is
    const { data: me } = useGetMyProfile()
    const id = Number(searchParams.get("id")) || 0
    const ownId = currentProfile?.id ?? me?.profile?.id
    // Your own profile is the editable page, on the same URL everyone else sees
    if (id > 0 && ownId === id) return <MyProfilePage />
    return <UserProfilePage />
}

function UserProfilePage() {
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
    const currentLevel = level?.currentLevel ?? 1
    const milestoneName = getProfileOwnerMilestoneName(profile?.themeId, currentLevel)

    // Resolve XP bar fill from the profile's stored skin CSS
    const xpBarFillCss = profile?.xpBarFillCss || undefined
    const xpBarAnimClass = profile?.xpBarAnimClass || undefined

    // Derive a solid accent color from the XP bar fill for scoped brand overrides
    const profileAccentVars = React.useMemo(() => profileAccentStyle(xpBarFillCss), [xpBarFillCss])

    // Name style: driven by xpBarFillCss skin first, then nameGradientCss/nameColorCss
    const nameStyle: React.CSSProperties = profileNameStyle({
        nameColor: profile?.nameColorCss,
        nameGradient: profile?.nameGradientCss,
        xpBarFill: xpBarFillCss,
    })
    // Their published border and header background (Reward Shop), drawn as on their own page.
    const avatarBorderStyle = profileAvatarBorderStyle(lookupBorder(profile?.profileBorderId ?? ""))
    const headerBgStyle = profileHeaderBackgroundStyle(lookupBackground(profile?.profileBgId ?? ""))
    const avatarFrame = lookupAvatarFrame(profile?.avatarFrameId)
    const bannerOverlay = lookupBannerOverlay(profile?.bannerOverlayId)
    const profileLayout = lookupProfileLayout(profile?.profileLayoutId)
    const nameHasGradient = Boolean(nameStyle.backgroundImage)

    // Title/level label style: same fill as XP bar skin
    const titleStyle: React.CSSProperties = xpBarFillCss
        ? xpBarFillCss.startsWith("linear-gradient")
            ? { backgroundImage: xpBarFillCss, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
            : { color: xpBarFillCss }
        : {}

    // Resolved display title text (falls back to milestone name or level label)
    const displayTitleText = profile?.displayTitle || null

    const hasGradientFill = !!xpBarFillCss?.includes("gradient")
    const profilePageStyle: React.CSSProperties = hasGradientFill
        ? { ...profileAccentVars, ["--profile-fill" as string]: xpBarFillCss }
        : profileAccentVars

    return (
        <div
            className="sea-profile-accent"
            style={profilePageStyle}
            data-profile-fill={hasGradientFill ? "" : undefined}
            data-profile-fx={hasGradientFill && xpBarAnimClass ? "" : undefined}
        >
            <ProfileWallpaper url={profile!.wallpaperUrl} effects={profile!.wallpaperEffects} />
            {profile!.bannerImage ? (
                <div
                    className={cn(
                        "relative h-[190px] sm:-mt-20 sm:h-[300px] w-full overflow-hidden lg:mt-0 lg:-ml-20 lg:w-[calc(100%+5rem)]",
                        __isDesktop__ && "lg:-mt-4",
                    )}
                >
                    <div
                        className="absolute inset-0 bg-no-repeat bg-cover"
                        style={{ backgroundImage: `url(${profile!.bannerImage})`, backgroundPosition: "center center", backgroundSize: "cover" }}
                    />
                    {bannerOverlay?.overlayCss && (
                        <div
                            data-profile-banner-overlay
                            className="absolute inset-0 z-[1] pointer-events-none"
                            style={{ background: bannerOverlay.overlayCss, mixBlendMode: bannerOverlay.blend as any }}
                        />
                    )}
                    {/* Top gradient - fade from background to transparent */}
                    <div className="absolute top-0 left-0 right-0 h-[5rem] bg-gradient-to-b from-[--background] to-transparent z-[2]" />
                    {/* Left fade - for sidebar transparency */}
                    <div className="hidden lg:block absolute left-0 top-0 w-[20rem] h-full bg-gradient-to-r from-[--background] to-transparent z-[2] opacity-50" />
                    {/* Bottom gradient - lighter so the banner image stays clear */}
                    <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-t from-[--background] from-0% to-transparent to-100% z-[3]" />
                </div>
            ) : (
                <CustomLibraryBanner discrete />
            )}
            <PageWrapper className={cn("p-4 sm:p-8 space-y-6", profile!.bannerImage && "-mt-20 sm:-mt-40 relative z-10")}>
                <SeaLink href="/community">
                    <span className="text-[--muted] hover:text-white text-sm flex items-center gap-1 mb-4">
                        <LuArrowLeft className="size-4" /> Community
                    </span>
                </SeaLink>
                {/* Unified Profile Header */}
                <div
                    className={cn("flex flex-col sm:flex-row items-center gap-6 pb-2 border-b border-[--border] relative", headerBgStyle.background && "rounded-xl p-4", profileLayout?.className)}
                    style={headerBgStyle}
                >
                    <div style={avatarBorderStyle} className={cn("rounded-full shrink-0", avatarFrame?.className)}>
                        <LevelRingAvatar
                            profile={{
                                currentLevel: level?.currentLevel ?? 1,
                                totalXP: level?.totalXP ?? 0,
                                avatarPath: profile!.avatarPath,
                                anilistAvatar: profile!.anilistAvatar,
                                name: profile!.name,
                            }}
                            size={120}
                            xpBarFillOverride={xpBarFillCss}
                            xpBarAnimClass={xpBarAnimClass}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <h1 className={cn("sea-profile-name text-2xl sm:text-3xl font-bold break-words sm:truncate", nameHasGradient && "sea-name-shine")} style={nameStyle}>
                                {profile!.name}
                                {profile!.anilistUsername && (
                                    <span className="text-[--muted] font-normal" style={{}}> ({profile!.anilistUsername})</span>
                                )}
                            </h1>
                            <span
                                className={cn("text-lg font-bold", !xpBarFillCss && levelColors.label, xpBarFillCss?.startsWith("linear-gradient") && "sea-name-shine")}
                                style={titleStyle}
                            >
                                {displayTitleText ?? milestoneName ?? `Level ${currentLevel}`}
                            </span>
                            {(milestoneName || displayTitleText) && (
                                <span className="text-sm text-[--muted]">Lv. {currentLevel}</span>
                            )}
                            {level && level.multiplier > 1 && (
                                <ActivityBuffBadge multiplier={level.multiplier} />
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-6 mt-2">
                            <div className="flex items-center gap-2 text-[--muted]">
                                <LuStar className="size-4" />
                                <span className="font-semibold">{formatNumber(level?.totalXP ?? 0)}</span>
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
                                <p className="text-[--muted] text-sm max-w-md line-clamp-3 sm:line-clamp-none sm:truncate">
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
                            <span>{milestoneName ?? `Level ${level.currentLevel}`}</span>
                            <span>Level {level.currentLevel + 1}</span>
                        </div>
                        <div
                            className="h-2 rounded-full overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.1)" }}
                        >
                            {/* XPBarFill renders the bar in 2 layers (solid base + moving sheen) so the user's
                                progress is always clearly visible while preserving the animated "general effect". */}
                            <XPBarFill
                                percent={level.xpNeededForLevel > 0 ? (level.xpInCurrentLevel / level.xpNeededForLevel) * 100 : 100}
                                fillCss={xpBarFillCss}
                                animClass={xpBarAnimClass}
                                heightClass="h-full"
                                trackCss="transparent"
                                fallbackBgClass={!xpBarFillCss ? levelColors.ring.replace("stroke-", "bg-") : undefined}
                            />
                        </div>
                        <div className="text-xs text-[--muted] text-center">
                            {formatNumber(level.xpInCurrentLevel)} / {formatNumber(level.xpNeededForLevel)} XP
                        </div>
                    </div>
                )}
                {/* Tabs */}
                <Tabs
                    value={activeTab}
                    onValueChange={(v: string) => router.push(`/profile/user?id=${id}&tab=${v}`)}
                >
                    <TabsList className={profileTabsListClass}>
                        <TabsTrigger value="activity" className={profileTabsTriggerClass}>
                            <LuActivity className="mr-1.5" /> Activity
                        </TabsTrigger>
                        <TabsTrigger value="towatch" className={profileTabsTriggerClass}>
                            <LuListVideo className="mr-1.5" /> Todo List
                        </TabsTrigger>
                        <TabsTrigger value="stats" className={profileTabsTriggerClass}>
                            <LuStar className="mr-1.5" /> Stats
                        </TabsTrigger>
                        <TabsTrigger value="achievements" className={profileTabsTriggerClass}>
                            <LuTrophy className="mr-1.5" /> Achievements
                        </TabsTrigger>
                        <TabsTrigger value="comments" className={profileTabsTriggerClass}>
                            <LuMessageSquare className="mr-1.5" /> Comments
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="activity" className="space-y-6 mt-6">
                        <ActivityTabContent
                            userId={id}
                            animeStreak={animeStreak}
                            mangaStreak={mangaStreak}
                            activityHeatmap={activityHeatmap}
                            showcase={showcase}
                            recentAchievements={recentAchievements}
                            anilistProfile={profile?.anilistUsername ? {
                                avatar: profile.anilistAvatar,
                                banner: profile.bannerImage,
                                bio: profile.bio,
                                name: profile.name,
                            } : undefined}
                        />
                    </TabsContent>
                    <TabsContent value="towatch" className="space-y-6 mt-6">
                        {/* What this person means to watch next — the list is theirs, so it is shown
                            read-only: the order and the watch button stay, the editing does not. */}
                        <ToWatchList profileId={id} readOnly />
                    </TabsContent>
                    <TabsContent value="stats" className="space-y-6 mt-6">
                        <UserStatsTabContent userId={id} xpBarFillCss={xpBarFillCss} />
                    </TabsContent>
                    <TabsContent value="achievements" className="space-y-6 mt-6">
                        <UserAchievementsTabContent userId={id} ownerName={profile?.name} />
                    </TabsContent>
                    <TabsContent value="comments" className="space-y-6 mt-6">
                        <ProfileCommentsTabContent userId={id} />
                    </TabsContent>
                </Tabs>
            </PageWrapper>
        </div>
    )
}

// ─────────────────────── Stats Tab ───────────────────────

function UserStatsTabContent({ userId, xpBarFillCss }: { userId: number; xpBarFillCss?: string }) {
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
            <Stats
                className="w-full grid-cols-2 gap-3 divide-y-0 divide-x-0 overflow-visible sm:grid-cols-3"
                itemClass="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur-md sm:p-5"
                size="md"
                items={[
                { icon: <LuTrophy />, name: "Active Days", value: profileStats?.totalActiveDays ?? 0 },
                { icon: <LuTv />, name: "Anime Days", value: profileStats?.totalAnimeDays ?? 0 },
                { icon: <LuBookOpen />, name: "Manga Days", value: profileStats?.totalMangaDays ?? 0 },
                ]}
            />

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
                        className="rounded-lg border border-white/10 bg-gray-900/70 px-3 py-1.5 text-sm backdrop-blur-md"
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
                <div className="relative z-[1] rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur-md">
                    <StatsActivityHeatmap days={profileStats?.activityHeatmap} fillCss={xpBarFillCss} />
                </div>
                <div className="relative z-[1] rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur-md">
                    <DayOfWeekChart patterns={profileStats?.watchPatterns?.byDayOfWeek} />
                </div>
            </div>
        </>
    )
}

// ─────────────────────── Achievements Tab ───────────────────────

function UserAchievementsTabContent({ userId, ownerName }: { userId: number, ownerName?: string }) {
    const { data, isLoading } = useGetUserAchievements(userId)

    if (isLoading) {
        return <div className="flex justify-center py-12"><LoadingSpinner /></div>
    }
    if (!data) return null

    return <AchievementsView data={data} variant="profile" ownerName={ownerName} />
}

// ─────────────────────── Comments Tab ───────────────────────

/**
 * Every comment this profile has left on any show or manga, newest first,
 * with the media it was on and the day/time it was written. Media titles are
 * resolved server-side from the comment author's AniList collection.
 */
function ProfileCommentsTabContent({ userId }: { userId: number }) {
    const { data, isLoading } = useGetProfileComments(userId, true)
    const comments = data?.comments ?? []

    if (isLoading) {
        return <div className="flex justify-center py-12"><LoadingSpinner /></div>
    }

    if (comments.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <LuMessageCircle className="size-8 text-[--muted]" />
                <p className="text-[--muted]">No comments yet</p>
            </div>
        )
    }

    return (
        <>
            <div className="flex items-center gap-3">
                <LuMessageSquare className="size-6 text-[--brand]" />
                <div>
                    <h2 className="text-lg font-semibold">Comments</h2>
                    <p className="text-xs text-[--muted]">{data?.totalCount ?? comments.length} comment(s) across shows and manga</p>
                </div>
            </div>
            <div className="space-y-2">
                {comments.map(c => <ProfileCommentRow key={c.id} comment={c} />)}
            </div>
        </>
    )
}

function ProfileCommentRow({ comment }: { comment: ProfileCommentItem }) {
    // The generated type leaves timestamps optional, so an old comment without one falls back to nothing.
    const date = comment.createdAt ? new Date(comment.createdAt) : undefined
    const dateLabel = date?.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })
    const timeLabel = date?.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    const href = comment.mediaType === "manga" ? `/manga/details?id=${comment.mediaId}` : `/anime/details?id=${comment.mediaId}`

    return (
        <div className="rounded-xl border border-[--border] p-4 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35">
            <div className="flex items-center justify-between gap-3 mb-2">
                <SeaLink href={href}>
                    <span className="text-sm font-semibold hover:underline">
                        {comment.mediaTitle || `#${comment.mediaId}`}
                    </span>
                </SeaLink>
                <span className="text-xs text-[--muted] shrink-0" title={date?.toISOString()}>
                    {dateLabel} · {timeLabel}{comment.isEdited ? " · edited" : ""}
                </span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words text-[--foreground]/90">{comment.content}</p>
        </div>
    )
}

// Phones only (every class is max-sm:): one scrollable row of tabs instead of several wrapped
// rows. Desktop keeps the shared tab classes untouched.
const profileTabsListClass = cn(tabsListClass, "max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:justify-start max-sm:[scrollbar-width:none]")
const profileTabsTriggerClass = cn(tabsTriggerClass, "max-sm:text-sm max-sm:px-3 max-sm:shrink-0")
