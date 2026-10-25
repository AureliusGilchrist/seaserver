"use client"

import { lookupAvatarFrame, lookupBannerOverlay, lookupProfileLayout } from "@/lib/rewards/profile-style-definitions"
import { profileAvatarBorderStyle, profileHeaderBackgroundStyle, profileNameStyle } from "@/lib/rewards/profile-cosmetics"
import { useGetAchievements } from "@/api/hooks/achievement.hooks"
import { useServerMutation } from "@/api/client/requests"
import { API_ENDPOINTS } from "@/api/generated/endpoints"
import {
    useGetAniListStats,
    useGetAnilistCharacterDetails,
    useGetAnilistStaffDetails,
    useGetAnilistStudioDetails,
} from "@/api/hooks/anilist.hooks"
import { useAnilistMediaById } from "./_lib/anilist-media-by-id"
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
    ProfileStats_ActivityDay,
    ProfileStats_PersonalityResult,
    ProfileStats_StreakInfo,
} from "@/api/generated/types"
type Handlers_RecentAchievementEntry = any
type Handlers_ShowcaseEntry = any
import { CustomLibraryBanner } from "@/app/(main)/(library)/_containers/custom-library-banner"
import { AchievementShowcase } from "@/app/(main)/_features/achievement/achievement-showcase"
import { LevelRingAvatar } from "@/app/(main)/_features/level-ring-avatar"
import { ActivityHeatmap } from "@/app/(main)/_features/profile/activity-heatmap"
import { ProfileWallpaper, ProfileWallpaperEditor } from "@/app/(main)/profile/_components/profile-wallpaper"
import { PageWrapper } from "@/components/shared/page-wrapper"
import { tabsTriggerClass, tabsListClass } from "@/components/shared/classnames"
import { Badge } from "@/components/ui/badge"
import { BarChart, DonutChart, AreaChart } from "@/components/ui/charts"
import { cn } from "@/components/ui/core/styling"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Modal } from "@/components/ui/modal"
import { Separator } from "@/components/ui/separator"
import { Stats } from "@/components/ui/stats"
import { formatNumber } from "@/lib/helpers/number"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAtomValue, useSetAtom } from "jotai/react"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { useRouter, useSearchParams } from "@/lib/navigation"
import { getMilestoneName, useAnimeTheme, useThemeMilestoneName } from "@/lib/theme/anime-themes/anime-theme-provider"
import { ANIME_THEMES } from "@/lib/theme/anime-themes"
import { RewardShop } from "@/app/(main)/profile/me/_components/reward-shop"
import { useRewards } from "@/lib/rewards/reward-provider"
import { XPBarFill } from "@/lib/rewards/xp-bar-fill"
import { __isDesktop__ } from "@/types/constants"
import { userSoundLevelAtom } from "@/lib/sounds/sound-provider"
import { LuGift, LuImage } from "react-icons/lu"
import { useEasterEggs } from "@/lib/easter-eggs/easter-egg-engine"
import { EASTER_EGG_DEFINITIONS } from "@/lib/easter-eggs/easter-egg-definitions"
import * as React from "react"
import { profileAccentStyle } from "@/lib/rewards/profile-accent"
import {
    LuTrophy, LuStar, LuPencil, LuCheck, LuX, LuFlame,
    LuCalendar, LuBookOpen, LuTv, LuClock, LuActivity, LuListVideo,
    LuGlobe, LuHourglass, LuLock, LuZap, LuDownload, LuEye, LuEyeOff, LuHeart,
} from "react-icons/lu"

function formatDescription(desc: string, thresholds?: number[], tierIdx?: number): React.ReactNode {
    if (!desc.includes("{threshold}") || !thresholds?.length) return desc
    const idx = tierIdx != null ? tierIdx : 0
    const val = thresholds[Math.min(idx, thresholds.length - 1)]
    const parts = desc.split("{threshold}")
    return <>{parts[0]}<strong className="text-[--foreground]">{formatNumber(val)}</strong>{parts[1]}</>
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

/** `/profile/me` is an alias of the canonical `/profile/user?id=<own id>`. */
export default function Page() {
    const currentProfile = useAtomValue(currentProfileAtom)
    const router = useRouter()
    const searchParams = useSearchParams()
    const ownId = currentProfile?.id

    React.useEffect(() => {
        if (!ownId) return
        const tab = searchParams.get("tab")
        router.replace(`/profile/user?id=${ownId}${tab ? `&tab=${tab}` : ""}`)
    }, [ownId])

    return ownId ? null : <MyProfilePage />
}

export function MyProfilePage() {
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
    const currentLevel = level?.currentLevel ?? 1
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const milestoneName = useThemeMilestoneName(currentLevel)
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const setUserSoundLevel = useSetAtom(userSoundLevelAtom)
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => { setUserSoundLevel(currentLevel) }, [currentLevel, setUserSoundLevel])
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { activeTitle, activeNameColor, activeBorder, activeBackground, activeXPBarSkin, effectiveXPBarFill, avatarFrameId, bannerOverlayId, profileLayoutId } = useRewards()
    const avatarFrame = lookupAvatarFrame(avatarFrameId)
    const bannerOverlay = lookupBannerOverlay(bannerOverlayId)
    const profileLayout = lookupProfileLayout(profileLayoutId)
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { config: themeConfig } = useAnimeTheme()

    // Resolve display text for milestone-based titles (e.g. "milestone-tokyo-ghoul-75")
    // activeTitle.text is already the resolved name (set at selection time via lookupTitle),
    // but fall back to the theme config lookup for legacy stored titles that still carry the raw ID.
    const resolvedTitleText = React.useMemo(() => {
        if (!activeTitle) return null
        const m = activeTitle.id.match(/^milestone-(.+)-(\d+)$/)
        if (m) {
            // Prefer the name embedded in the title object (resolved at selection time)
            if (activeTitle.text && activeTitle.text !== activeTitle.id) return activeTitle.text
            // Legacy fallback: try the current theme's milestone names
            if (themeConfig.milestoneNames) {
                const fromCurrentTheme = getMilestoneName(Number(m[2]), themeConfig.milestoneNames)
                if (fromCurrentTheme) return fromCurrentTheme
            }
            // Last resort: look up from ANIME_THEMES using the title's own themeId
            const name = getMilestoneName(Number(m[2]), ANIME_THEMES?.[m[1] as keyof typeof ANIME_THEMES]?.milestoneNames)
            if (name) return name
        }
        return activeTitle.text
    }, [activeTitle, themeConfig.milestoneNames])

    const nameStyle: React.CSSProperties = profileNameStyle({
        nameColor: activeNameColor?.color,
        nameGradient: activeNameColor?.gradientCss,
        xpBarFill: activeXPBarSkin?.fillCss,
    })
    const nameHasGradient = Boolean(nameStyle.backgroundImage)

    const avatarBorderStyle: React.CSSProperties = profileAvatarBorderStyle(activeBorder)
    const headerBgStyle: React.CSSProperties = profileHeaderBackgroundStyle(activeBackground)

    // Derive a solid accent color from XP bar fill for scoped brand overrides
    const profileAccentVars = React.useMemo(() => profileAccentStyle(effectiveXPBarFill), [effectiveXPBarFill])

    // Merge any page-level effect vars from the active XP bar skin (effects category)
    const pageEffectVarsStyle: React.CSSProperties = activeXPBarSkin?.pageEffectVars
        ? Object.fromEntries(
            Object.entries(activeXPBarSkin.pageEffectVars).map(([k, v]) => [k as string, v]),
        ) as React.CSSProperties
        : {}

    const profilePageStyle: React.CSSProperties = {
        ...profileAccentVars,
        ...pageEffectVarsStyle,
        ...(effectiveXPBarFill?.includes("gradient") ? { ["--profile-fill" as string]: effectiveXPBarFill } : {}),
    }
    const profileFillAttrs = effectiveXPBarFill?.includes("gradient")
        ? { "data-profile-fill": "", "data-profile-fx": activeXPBarSkin?.animClass ? "" : undefined }
        : {}

    return (
        <div className="sea-profile-accent" style={profilePageStyle} {...profileFillAttrs}>
            {activeTab !== "wallpaper" && <ProfileWallpaper url={profile!.wallpaperUrl} effects={profile!.wallpaperEffects} />}
            {/* Banner */}
            {profile!.bannerImage ? (
                <div
                    className={cn(
                        "relative -mt-20 h-[320px] w-full overflow-hidden lg:mt-0 lg:-ml-20 lg:w-[calc(100%+5rem)]",
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
            <PageWrapper className={cn("p-4 sm:p-8 space-y-6", profile!.bannerImage && "-mt-44 relative z-10")}>
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
                            xpBarFillOverride={effectiveXPBarFill || undefined}
                            // A moving skin moves here too, exactly as it does in the shop — the
                            // ring is the same bar in a different shape.
                            xpBarAnimClass={activeXPBarSkin?.animClass}
                            xpBarTrackCss={activeXPBarSkin?.trackCss}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <h1 className={cn("sea-profile-name text-3xl font-bold truncate", nameHasGradient && "sea-name-shine")} style={nameStyle}>
                                {profile!.name}
                                {profile!.anilistUsername && (
                                    <span className="text-[--muted] font-normal" style={{}}> ({profile!.anilistUsername})</span>
                                )}
                            </h1>
                            <span
                                className={cn(
                                    "text-lg font-bold",
                                    activeXPBarSkin?.fillCss?.startsWith("linear-gradient") && "sea-name-shine",
                                )}
                                style={
                                    activeXPBarSkin?.fillCss
                                        ? activeXPBarSkin.fillCss.startsWith("linear-gradient")
                                            ? { backgroundImage: activeXPBarSkin.fillCss, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
                                            : { color: activeXPBarSkin.fillCss }
                                        : undefined
                                }
                            >
                                {resolvedTitleText ?? milestoneName ?? `Level ${currentLevel}`}
                            </span>
                            {(milestoneName || resolvedTitleText) && (
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
                            <span>{milestoneName ?? `Level ${level.currentLevel}`}</span>
                            <span>???</span>
                        </div>
                        <XPBarFill
                            percent={level.xpNeededForLevel > 0 ? (level.xpInCurrentLevel / level.xpNeededForLevel) * 100 : 100}
                            fillCss={activeXPBarSkin?.fillCss ?? `var(--sea-xpbar-fill, ${levelColors.ring.replace("stroke-", "")})`}
                            animClass={activeXPBarSkin?.animClass ?? null}
                            trackCss={activeXPBarSkin?.trackCss ?? "rgba(255,255,255,0.1)"}
                            heightClass="h-2"
                        />
                        <div className="text-xs text-[--muted] text-center">
                            {formatNumber(level.xpInCurrentLevel)} / {formatNumber(level.xpNeededForLevel)} XP
                        </div>
                    </div>
                )}
                {/* Tabs */}
                <Tabs
                    value={activeTab}
                    onValueChange={(v: string) => router.push(`/profile/user?id=${profile.id}&tab=${v}`)}
                >
                    <TabsList className={tabsListClass}>
                        <TabsTrigger value="activity" className={tabsTriggerClass}>
                            <LuActivity className="mr-1.5" /> Activity
                        </TabsTrigger>
                        <TabsTrigger value="timeline" className={tabsTriggerClass}>
                            <LuMessagesSquare className="mr-1.5" /> Timeline
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
                        <TabsTrigger value="rewards" className={tabsTriggerClass}>
                            <LuGift className="mr-1.5" /> Rewards
                        </TabsTrigger>
                        <TabsTrigger value="wallpaper" className={tabsTriggerClass}>
                            <LuImage className="mr-1.5" /> Wallpaper
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
                    <TabsContent value="timeline" className="space-y-6 mt-6">
                        <ProfileTimeline profileId={profile.id} profileName={profile.name} />
                    </TabsContent>
                    <TabsContent value="stats" className="space-y-6 mt-6">
                        <StatsTabContent />
                    </TabsContent>
                    <TabsContent value="achievements" className="space-y-6 mt-6">
                        <AchievementsTabContent editable isAdmin={profile?.isAdmin ?? false} />
                    </TabsContent>
                    <TabsContent value="favorites" className="space-y-6 mt-6">
                        <FavoritesTabContent />
                    </TabsContent>
                    <TabsContent value="rewards" className="space-y-6 mt-6">
                        <RewardShop currentLevel={level?.currentLevel ?? 1} />
                    </TabsContent>
                    <TabsContent value="wallpaper" className="space-y-6 mt-6">
                        <ProfileWallpaperEditor
                            key={`${profile!.wallpaperUrl ?? ""}|${profile!.wallpaperEffects ?? ""}`}
                            currentUrl={profile!.wallpaperUrl}
                            currentEffects={profile!.wallpaperEffects}
                        />
                    </TabsContent>
                    <TabsContent value="secrets" className="space-y-6 mt-6">
                        <EasterEggSecrets />
                    </TabsContent>
                </Tabs>
            </PageWrapper>
        </div>
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
                <span className="text-sm text-gray-400">{formatNumber(found.length)} / {formatNumber(total)} found</span>
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
import { ProfileTimeline } from "@/app/(main)/_features/profile/profile-timeline"
import { LuMessagesSquare } from "react-icons/lu"

// ─────────────────────── Stats Tab (lazy) ───────────────────────

function StatsTabContent() {
    const [selectedYear, setSelectedYear] = React.useState<number | undefined>(undefined)
    const { data: profileStats, isLoading: profileLoading } = useGetProfileStats(selectedYear)
    const { data: anilistStats, isLoading: anilistLoading } = useGetAniListStats(true)
    const { activeXPBarSkin, effectiveXPBarFill } = useRewards()

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

            <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <LuCalendar className="text-brand-300" />
                            Activity
                        </h2>
                        <p className="text-xs text-[--muted] mt-0.5">
                            Every day you watched or read something, in your own color.
                        </p>
                    </div>
                    {/* A control rather than a bare select: the range is part of reading the grid,
                        so it sits with the grid and looks like something you can change. */}
                    <div className="flex items-center gap-1 rounded-lg border border-[--border] bg-gray-900/60 p-1">
                        {yearOptions.map((y) => {
                            const active = (selectedYear ?? undefined) === (y ?? undefined)
                            return (
                                <button
                                    key={y ?? "rolling"}
                                    onClick={() => setSelectedYear(y ?? undefined)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums",
                                        active
                                            ? "bg-[--subtle] text-white"
                                            : "text-[--muted] hover:text-white hover:bg-white/5",
                                    )}
                                >
                                    {y ? `${y}` : "Last 365 days"}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="relative z-[1] rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur-md">
                    <StatsActivityHeatmap days={profileStats?.activityHeatmap} fillCss={effectiveXPBarFill || undefined} />
                </div>

                <div className="relative z-[1] rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur-md">
                    <DayOfWeekChart patterns={profileStats?.watchPatterns?.byDayOfWeek} />
                </div>
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

function AchievementsTabContent({ editable, isAdmin }: { editable?: boolean; isAdmin?: boolean }) {
    const { data, isLoading } = useGetAchievements()
    const { config: animeConfig } = useAnimeTheme()
    const [selectedCategory, setSelectedCategory] = React.useState<Achievement_Category | "all">("all")
    const { mutate: resetAchievements, isPending: isResetting } = useServerMutation({
        endpoint: API_ENDPOINTS.ACHIEVEMENT.ResetAchievements.endpoint,
        method: "POST",
        onSuccess: () => { window.location.reload() },
    })
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
                    <p className="text-[--muted]">{formatNumber(unlockedCount)} / {formatNumber(totalCount)} unlocked</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    {editable && isAdmin && (
                        <button
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                                "text-red-400/70 border border-red-500/20 hover:bg-red-900/20 hover:text-red-300",
                                isResetting && "opacity-50 pointer-events-none",
                            )}
                            onClick={() => {
                                if (confirm("Reset ALL achievements and XP? This cannot be undone.")) {
                                    resetAchievements()
                                }
                            }}
                            disabled={isResetting}
                            title="Admin: clear all achievements and XP"
                        >
                            {isResetting ? <LoadingSpinner className="size-3" /> : <LuX className="size-3" />}
                            Reset
                        </button>
                    )}
                    <ProgressRing value={totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0} />
                </div>
            </div>

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
        <div className="relative z-[1] rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur-md space-y-2">
            <div className="flex items-center gap-2 text-[--muted]">
                {icon}
                <span className="text-sm font-medium">{label}</span>
            </div>
            <div className="flex items-end gap-6">
                <div>
                    <div className="flex items-center gap-2">
                        <LuFlame className={cn("text-2xl", (streak?.current ?? 0) > 0 ? "text-orange-400" : "text-gray-600")} />
                        <span className="text-3xl font-bold tabular-nums">{streak?.current ?? 0}</span>
                    </div>
                    <span className="text-xs text-[--muted]">Current</span>
                </div>
                <div>
                    <span className="text-xl font-semibold text-[--muted] tabular-nums">{streak?.longest ?? 0}</span>
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
    const cardClass = "rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 shadow-xl shadow-black/20 backdrop-blur-md"
    const gridClass = "grid-cols-2 gap-3 divide-y-0 divide-x-0 overflow-visible"

    return (
        <div className="space-y-2">
            <Stats className={cn("w-full", gridClass, "sm:grid-cols-4")} itemClass={cn(cardClass, "p-4 sm:p-5")} size="lg" items={[
                { icon: <LuTv />, name: "Total Anime", value: anilistStats?.animeStats?.count ?? 0 },
                { icon: <LuBookOpen />, name: "Total Manga", value: anilistStats?.mangaStats?.count ?? 0 },
                { icon: <LuHourglass />, name: "Watch Time", value: Math.round((anilistStats?.animeStats?.minutesWatched ?? 0) / 60), unit: "hours" },
                { icon: <LuStar />, name: "Mean Score", value: ((anilistStats?.animeStats?.meanScore ?? 0) / 10).toFixed(1) },
            ]} />
            <Stats className={cn("w-full", gridClass, "sm:grid-cols-3")} itemClass={cn(cardClass, "p-4 sm:p-5")} size="md" items={[
                { icon: <LuTrophy />, name: "Active Days", value: profileStats?.totalActiveDays ?? 0 },
                { icon: <LuTv />, name: "Anime Days", value: profileStats?.totalAnimeDays ?? 0 },
                { icon: <LuBookOpen />, name: "Manga Days", value: profileStats?.totalMangaDays ?? 0 },
            ]} />
            <Stats className={cn("w-full", gridClass, "sm:grid-cols-2")} itemClass={cn(cardClass, "p-4 sm:p-5")} size="md" items={[
                { icon: <LuClock />, name: "Anime hrs/week", value: (profileStats?.animeHoursPerWeek ?? 0).toFixed(1), unit: "hrs" },
                { icon: <LuBookOpen />, name: "Manga ch/week", value: (profileStats?.mangaChaptersPerWeek ?? 0).toFixed(1), unit: "ch" },
            ]} />
        </div>
    )
}

export function StatsActivityHeatmap({ days, fillCss }: { days?: ProfileStats_ActivityDay[]; fillCss?: string }) {
    // One heatmap in the app, drawn the same way wherever it appears: the profile's own year and
    // somebody else's public profile differ only in whose color fills the days.
    return <ActivityHeatmap days={days} fill={fillCss} />
}

export function DayOfWeekChart({ patterns }: { patterns?: number[] }) {
    if (!patterns || patterns.every(v => v === 0)) return null
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const data = dayNames.map((name, i) => ({ name, Activity: patterns[i] ?? 0 }))
    const peak = Math.max(...data.map(d => d.Activity))
    const peakDay = data.find(d => d.Activity === peak)?.name
    return (
        <div className="w-full">
            <div className="flex items-baseline justify-between mb-3">
                <p className="text-sm font-medium">Activity by day of week</p>
                {peakDay && (
                    <p className="text-xs text-[--muted]">
                        Busiest on <span className="text-gray-200">{peakDay}</span>
                    </p>
                )}
            </div>
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
            <div className="relative z-[1] rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-900/30 via-gray-900/70 to-indigo-900/30 p-6 shadow-xl shadow-black/20 backdrop-blur-md space-y-4">
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
            <div>
                <h2 className="text-xl font-semibold">Anime Breakdown</h2>
                <p className="text-xs text-[--muted] mt-0.5">What you watch, and what it scores, straight from AniList.</p>
            </div>

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

            <div>
                <h2 className="text-xl font-semibold">Manga Breakdown</h2>
                <p className="text-xs text-[--muted] mt-0.5">What you read, and what it scores, straight from AniList.</p>
            </div>
            <Stats className="w-full grid-cols-2 gap-3 divide-y-0 divide-x-0 overflow-visible sm:grid-cols-3" itemClass="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur-md sm:p-5" size="lg" items={[
                { icon: <LuBookOpen />, name: "Total Manga", value: stats?.mangaStats?.count ?? 0 },
                { icon: <LuHourglass />, name: "Chapters Read", value: stats?.mangaStats?.chaptersRead ?? 0 },
                { icon: <LuStar />, name: "Mean Score", value: ((stats?.mangaStats?.meanScore ?? 0) / 10).toFixed(1) },
            ]} />
            {mangaGenreData.length > 0 && <ChartSection title="Manga Genres"><BarChart data={mangaGenreData} index="name" categories={["Count", "Avg Score"]} colors={["brand", "blue"]} /></ChartSection>}
        </div>
    )
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
    // A panel, like every other section on this page — a chart floating in whitespace reads as
    // decoration; one with an edge reads as something that was measured.
    return (
        <div className="relative z-[1] rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-black/25 to-black/35 p-4 shadow-xl shadow-black/20 backdrop-blur-md">
            <h3 className="text-sm font-medium mb-3">{title}</h3>
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
                <AchievementIcon svg={definition.IconSVG ?? ""} isUnlocked={isUnlocked} />
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
            <AchievementIcon svg={definition.IconSVG ?? ""} isUnlocked={highestUnlockedTier > 0} />
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
    if (level >= 200) return { ring: "stroke-fuchsia-400", glow: "shadow-fuchsia-400/60", label: "text-fuchsia-400" }
    if (level >= 100) return { ring: "stroke-yellow-400",  glow: "shadow-yellow-400/50",  label: "text-yellow-400"  }
    if (level >=  80) return { ring: "stroke-yellow-400",  glow: "shadow-yellow-400/40",  label: "text-yellow-400"  }
    if (level >=  65) return { ring: "stroke-purple-400",  glow: "shadow-purple-400/50",  label: "text-purple-400"  }
    if (level >=  50) return { ring: "stroke-indigo-400",  glow: "shadow-indigo-400/50",  label: "text-indigo-400"  }
    if (level >=  35) return { ring: "stroke-blue-400",    glow: "shadow-blue-400/50",    label: "text-blue-400"    }
    if (level >=  20) return { ring: "stroke-teal-400",    glow: "shadow-teal-400/40",    label: "text-teal-400"    }
    if (level >=  10) return { ring: "stroke-green-400",   glow: "shadow-green-400/30",   label: "text-green-400"   }
    return                   { ring: "stroke-gray-400",    glow: "shadow-gray-400/30",    label: "text-gray-400"    }
}

// ─────────────────────── Favorites Tab ───────────────────────

function FavoritesTabContent() {
    const { data: animeIds, isLoading: animeLoading } = useGetAnimeFavorites()
    const { data: mangaIds, isLoading: mangaLoading } = useGetMangaFavorites()
    const { data: characterIds, isLoading: characterLoading } = useGetCharacterFavorites()
    const { data: staffIds, isLoading: staffLoading } = useGetStaffFavorites()
    const { data: studioIds, isLoading: studioLoading } = useGetStudioFavorites()

    const sections = [
        { label: "Anime", ids: animeIds, type: "anime" as const },
        { label: "Manga", ids: mangaIds, type: "manga" as const },
        { label: "Characters", ids: characterIds, type: "character" as const },
        { label: "Staff", ids: staffIds, type: "staff" as const },
        { label: "Studios", ids: studioIds, type: "studio" as const },
    ]

    const totalCount = sections.reduce((acc, s) => acc + (s.ids?.length ?? 0), 0)
    const favoritesLoading = animeLoading || mangaLoading || characterLoading || staffLoading || studioLoading

    return (
        <div className="space-y-7">
            <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-500/[0.16] via-black/35 to-black/55 p-5 shadow-xl shadow-black/20 backdrop-blur-2xl sm:p-7">
                <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-brand-400/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 left-1/4 size-56 rounded-full bg-rose-400/10 blur-3xl" />
                <div className="relative flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-400/10 text-rose-200 shadow-lg shadow-rose-950/25">
                            <LuHeart className="size-7" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-200">Your collection</p>
                            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Favorites</h2>
                            <p className="mt-1 text-sm text-white/60">The anime, manga, characters, creators, and studios you love.</p>
                        </div>
                    </div>
                    <div className="min-w-28 rounded-2xl border border-white/10 bg-black/25 px-5 py-3 text-center">
                        <p className="text-2xl font-extrabold tabular-nums text-white">
                            {favoritesLoading ? "…" : formatNumber(totalCount)}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Saved</p>
                    </div>
                </div>
                <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {sections.map(section => (
                        <div key={section.type} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
                            <span className="truncate text-xs font-medium text-white/65">{section.label}</span>
                            <span className="shrink-0 text-sm font-bold tabular-nums text-white">
                                {favoritesLoading ? "—" : formatNumber(section.ids?.length ?? 0)}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {favoritesLoading ? (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-8 text-center text-sm text-[--muted] backdrop-blur-xl">
                    Loading your favorites…
                </div>
            ) : totalCount === 0 ? (
                <div className="relative isolate overflow-hidden rounded-3xl border border-dashed border-white/15 bg-black/20 px-6 py-14 text-center backdrop-blur-xl">
                    <div className="pointer-events-none absolute left-1/2 top-0 size-48 -translate-x-1/2 rounded-full bg-rose-400/10 blur-3xl" />
                    <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-400/10 text-rose-200">
                        <LuHeart className="size-6" />
                    </div>
                    <h3 className="relative mt-4 text-lg font-bold text-white">Your collection starts with a favorite</h3>
                    <p className="relative mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[--muted]">
                        Tap the heart on an anime, manga, character, staff member, or studio page to save it here.
                    </p>
                </div>
            ) : (
                <div className="space-y-8">
                    {sections.map(section => (
                        <FavoriteSection key={section.type} label={section.label} ids={section.ids ?? []} type={section.type} />
                    ))}
                </div>
            )}
        </div>
    )
}

type FavoriteType = "anime" | "manga" | "character" | "staff" | "studio"

function FavoriteSection({ label, ids, type }: { label: string; ids: number[]; type: FavoriteType }) {
    const icon = type === "anime" ? <LuTv className="size-5" />
        : type === "manga" ? <LuBookOpen className="size-5" />
            : type === "character" ? <LuHeart className="size-5" />
                : type === "staff" ? <LuActivity className="size-5" />
                    : <LuGlobe className="size-5" />
    const accent = type === "manga"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-200"
        : type === "character"
            ? "border-amber-300/20 bg-amber-400/10 text-amber-200"
            : type === "staff"
                ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-200"
                : type === "studio"
                    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                    : "border-brand-300/20 bg-brand-400/10 text-brand-200"

    if (ids.length === 0) {
        return (
            <section className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 backdrop-blur-md sm:p-5">
                <div className="flex items-center gap-3">
                    <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border", accent)}>{icon}</div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-white/75">{label}</h3>
                        <p className="mt-0.5 text-xs text-[--muted]">No {label.toLowerCase()} favorited yet</p>
                    </div>
                    <span className="ml-auto rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs font-semibold tabular-nums text-white/40">0</span>
                </div>
            </section>
        )
    }

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border", accent)}>{icon}</div>
                <div className="min-w-0">
                    <h3 className="text-lg font-bold tracking-tight text-white">{label}</h3>
                    <p className="text-xs text-[--muted]">{formatNumber(ids.length)} saved</p>
                </div>
                <span className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold tabular-nums text-white/65">
                    {formatNumber(ids.length)}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {ids.map((id) => (
                    <FavoriteCard key={id} id={id} type={type} />
                ))}
            </div>
        </section>
    )
}

function stripHtml(html: string | null | undefined): string {
    if (!html) return ""
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

function FavoriteCard({ id, type }: { id: number; type: FavoriteType }) {
    if (type === "anime") return <FavoriteAnimeCard id={id} />
    if (type === "manga") return <FavoriteMangaCard id={id} />
    if (type === "character") return <FavoriteCharacterCard id={id} />
    if (type === "staff") return <FavoriteStaffCard id={id} />
    if (type === "studio") return <FavoriteStudioCard id={id} />
    return null
}

function FavoriteCardShell({
    href,
    image,
    title,
    subtitle,
    description,
    isLoading,
    kind,
}: {
    href: string
    image?: string | null
    title?: string | null
    subtitle?: string | null
    description?: string | null
    isLoading?: boolean
    kind: string
}) {
    return (
        <a
            href={href}
            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-black/55 shadow-lg shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-brand-300/35 hover:shadow-2xl hover:shadow-brand-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/70"
        >
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
                {image
                    ? (
                        <img
                            src={image}
                            alt={title ?? ""}
                            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                            loading="lazy"
                        />
                    )
                    : isLoading
                        ? <div className="size-full animate-pulse bg-gradient-to-br from-white/10 via-white/[0.03] to-black/30" />
                        : (
                            <div className="flex size-full flex-col items-center justify-center gap-2 text-white/35">
                                <LuHeart className="size-8" />
                                <span className="text-xs">Artwork unavailable</span>
                            </div>
                        )
                }
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
                <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/80 shadow backdrop-blur-lg">
                    {kind}
                </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
                <p className="line-clamp-2 text-sm font-bold leading-snug text-white" title={title ?? undefined}>
                    {title || (isLoading ? "Loading…" : `#${href.split("=").pop()}`)}
                </p>
                {subtitle && <p className="line-clamp-1 text-[11px] font-medium uppercase tracking-wide text-brand-100/65">{subtitle}</p>}
                {description && (
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/50">{description}</p>
                )}
            </div>
        </a>
    )
}

function FavoriteAnimeCard({ id }: { id: number }) {
    const { data, isLoading } = useAnilistMediaById(id, "anime")
    const d = data as any
    const title = d?.title?.english || d?.title?.romaji || d?.title?.userPreferred || d?.title?.native
    const year = d?.seasonYear ?? d?.startDate?.year ?? null
    const fmt = d?.format ? String(d.format).replace(/_/g, " ") : null
    const subtitle = [fmt, year].filter(Boolean).join(" \u00b7 ")
    return (
        <FavoriteCardShell
            href={`/entry?id=${id}`}
            image={d?.coverImage?.extraLarge || d?.coverImage?.large || d?.coverImage?.medium}
            title={title}
            subtitle={subtitle || undefined}
            description={stripHtml(d?.description)}
            isLoading={isLoading}
            kind="Anime"
        />
    )
}

function FavoriteMangaCard({ id }: { id: number }) {
    const { data, isLoading } = useAnilistMediaById(id, "manga")
    const d = data as any
    const title = d?.title?.english || d?.title?.romaji || d?.title?.userPreferred || d?.title?.native
    const year = d?.startDate?.year ?? null
    const fmt = d?.format ? String(d.format).replace(/_/g, " ") : null
    const subtitle = [fmt, year].filter(Boolean).join(" \u00b7 ")
    return (
        <FavoriteCardShell
            href={`/manga/entry?id=${id}`}
            image={d?.coverImage?.extraLarge || d?.coverImage?.large || d?.coverImage?.medium}
            title={title}
            subtitle={subtitle || undefined}
            description={stripHtml(d?.description)}
            isLoading={isLoading}
            kind="Manga"
        />
    )
}

function FavoriteCharacterCard({ id }: { id: number }) {
    const { data, isLoading } = useGetAnilistCharacterDetails(id)
    return (
        <FavoriteCardShell
            href={`/character?id=${id}`}
            image={data?.image?.large || data?.image?.medium}
            title={data?.name?.full || data?.name?.userPreferred || data?.name?.native}
            subtitle={data?.name?.native && data?.name?.native !== data?.name?.full ? data?.name?.native : undefined}
            description={stripHtml(data?.description)}
            isLoading={isLoading}
            kind="Character"
        />
    )
}

function FavoriteStaffCard({ id }: { id: number }) {
    const { data, isLoading } = useGetAnilistStaffDetails(id)
    const role = (data as any)?.primaryOccupations?.[0] ?? null
    return (
        <FavoriteCardShell
            href={`/staff?id=${id}`}
            image={(data as any)?.image?.large || (data as any)?.image?.medium}
            title={(data as any)?.name?.full || (data as any)?.name?.userPreferred || (data as any)?.name?.native}
            subtitle={role ?? undefined}
            description={stripHtml((data as any)?.description)}
            isLoading={isLoading}
            kind="Staff"
        />
    )
}

function FavoriteStudioCard({ id }: { id: number }) {
    const { data, isLoading } = useGetAnilistStudioDetails(id)
    const cover = (data as any)?.media?.nodes?.[0]?.coverImage?.extraLarge
        || (data as any)?.media?.nodes?.[0]?.coverImage?.large
        || null
    const favCount = (data as any)?.favourites
    const subtitle = [
        (data as any)?.isAnimationStudio ? "Animation studio" : "Studio",
        favCount != null ? `\u2764 ${formatNumber(favCount)}` : null,
    ].filter(Boolean).join(" \u00b7 ")
    return (
        <FavoriteCardShell
            href={`/studio?id=${id}`}
            image={cover}
            title={(data as any)?.name}
            subtitle={subtitle || undefined}
            isLoading={isLoading}
            kind="Studio"
        />
    )
}
