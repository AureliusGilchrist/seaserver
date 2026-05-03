"use client"

import React from "react"
import { LuLock, LuCheck, LuMousePointer2, LuTag, LuPalette, LuFrame, LuImage, LuZap, LuSparkles, LuVolume2, LuPlay, LuWand, LuCreditCard, LuCircleDot, LuType, LuDroplets, LuLayoutDashboard, LuPanelLeft, LuChevronsUpDown, LuSlidersHorizontal } from "react-icons/lu"
import {
    UI_CUSTOMIZE_CATEGORIES,
    type UICustomizeCategoryId,
    type UIPreset,
} from "@/lib/ui-customize/ui-customize-definitions"
import { useUICustomize } from "@/lib/ui-customize/ui-customize-provider"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { LevelRingAvatar } from "@/app/(main)/_features/level-ring-avatar"
import { useSound } from "@/lib/sounds/sound-provider"
import { cn } from "@/components/ui/core/styling"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ALL_CURSOR_DEFINITIONS } from "@/lib/cursors/cursor-generator"
import { useCursor } from "@/lib/cursors/cursor-provider"
import { useRewards } from "@/lib/rewards/reward-provider"
import {
    TITLE_REWARDS,
    NAME_COLOR_REWARDS,
    BORDER_REWARDS,
    BACKGROUND_REWARDS,
    XP_BAR_SKIN_REWARDS,
    PARTICLE_SET_REWARDS,
    ALL_EGG_REWARDS,
    EGG_NAME_COLOR_REWARDS,
    EGG_BORDER_REWARDS,
    EGG_PARTICLE_REWARDS,
    type TitleReward,
    type NameColorReward,
    type BorderReward,
    type BackgroundReward,
    type XPBarSkinReward,
    type ParticleSetReward,
} from "@/lib/rewards/reward-definitions"

type Props = {
    currentLevel: number
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function LockBadge() {
    return (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center">
            <LuLock className="text-[10px] text-gray-400" />
        </div>
    )
}

function EggBadge() {
    return (
        <div className="absolute top-1 left-1 text-[11px] leading-none" title="Easter Egg Exclusive">
            🥚
        </div>
    )
}

function ActiveBadge() {
    return (
        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center">
            <LuCheck className="text-[10px] text-white" />
        </div>
    )
}

function LevelTag({ level }: { level: number }) {
    return <span className="text-[10px] text-[--muted]">Lv. {level}</span>
}

function CardBase({
    isActive,
    isUnlocked,
    onClick,
    children,
    className,
}: {
    isActive: boolean
    isUnlocked: boolean
    onClick: () => void
    children: React.ReactNode
    className?: string
}) {
    return (
        <button
            disabled={!isUnlocked}
            onClick={onClick}
            className={cn(
                "sea-hoverable relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all text-left",
                isActive
                    ? "border-brand-500 bg-brand-500/15 shadow-lg shadow-brand-500/20"
                    : isUnlocked
                        ? "border-[--border] bg-gray-900/40 hover:border-brand-500/50 hover:bg-gray-900/60"
                        : "border-[--border] bg-gray-900/20 opacity-50 cursor-not-allowed",
                className,
            )}
        >
            {isActive && <ActiveBadge />}
            {!isUnlocked && <LockBadge />}
            {children}
        </button>
    )
}

// ─── Cursor Tab ───────────────────────────────────────────────────────────────

const CURSOR_TIER_LABELS: { label: string; min: number; max: number }[] = [
    { label: "Basic (1-60)",      min: 1,   max: 60   },
    { label: "Vivid (61-100)",    min: 61,  max: 100  },
    { label: "Metallic (101-200)", min: 101, max: 200  },
    { label: "Neon (201-300)",    min: 201, max: 300  },
    { label: "Pastel (301-400)",  min: 301, max: 400  },
    { label: "Void (401-500)",    min: 401, max: 500  },
    { label: "Fire (501-600)",    min: 501, max: 600  },
    { label: "Ice (601-700)",     min: 601, max: 700  },
    { label: "Cosmic (701-800)",  min: 701, max: 800  },
    { label: "Divine (801-900)",  min: 801, max: 900  },
    { label: "Prismatic (901+)",  min: 901, max: 1000 },
]

function CursorTab({ currentLevel }: { currentLevel: number }) {
    const { activeCursorId, setActiveCursorId } = useCursor()
    const [tierIdx, setTierIdx] = React.useState(0)

    const tier = CURSOR_TIER_LABELS[tierIdx]
    const visible = ALL_CURSOR_DEFINITIONS.filter(c => c.requiredLevel >= tier.min && c.requiredLevel <= tier.max)
    const unlocked = ALL_CURSOR_DEFINITIONS.filter(c => c.requiredLevel <= currentLevel).length

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-[--muted]">
                    <LuMousePointer2 />
                    <span>{unlocked}/{ALL_CURSOR_DEFINITIONS.length} unlocked</span>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                    {CURSOR_TIER_LABELS.map((t, i) => (
                        <button
                            key={t.label}
                            onClick={() => setTierIdx(i)}
                            className={cn(
                                "px-2.5 py-1 text-xs rounded-full border transition",
                                tierIdx === i
                                    ? "border-brand-500 bg-brand-500/20 text-brand-300"
                                    : "border-[--border] text-[--muted] hover:border-brand-500/50",
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {visible.map(cursor => {
                    const isUnlocked = cursor.requiredLevel <= currentLevel
                    const isActive = activeCursorId === cursor.id
                    return (
                        <CardBase key={cursor.id} isActive={isActive} isUnlocked={isUnlocked} onClick={() => setActiveCursorId(cursor.id)}>
                            <div className="w-12 h-12 flex items-center justify-center">
                                {cursor.icon ? (
                                    <img src={cursor.icon} alt={cursor.name} className="w-10 h-10 object-contain" draggable={false} />
                                ) : (
                                    <LuMousePointer2 className="text-2xl text-[--muted]" />
                                )}
                            </div>
                            <div className="text-center w-full">
                                <p className="text-xs font-medium leading-tight truncate w-full">{cursor.name}</p>
                                {!isUnlocked && <LevelTag level={cursor.requiredLevel} />}
                            </div>
                        </CardBase>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Titles Tab ───────────────────────────────────────────────────────────────

// ── Level-colour palette for themed titles ────────────────────────────────────
const THEME_TITLE_COLORS = [
    "#94a3b8","#a3e635","#67e8f9","#fb7185","#c084fc","#f472b6","#facc15","#fbbf24",
    "#4ade80","#fcd34d","#34d399","#f87171","#38bdf8","#22d3ee","#60a5fa","#a3a3a3",
    "#d97706","#6ee7b7","#e879f9","#fff","#f97316","#818cf8","#fde68a","#fda4af",
]

function TitlesTab({ currentLevel }: { currentLevel: number }) {
    const { activeTitle, setActiveTitle } = useRewards()
    const { config } = useAnimeTheme()

    // Generate theme-specific titles from milestoneNames if available
    const themeSpecificTitles = React.useMemo((): TitleReward[] | null => {
        if (!config.milestoneNames || config.id === "seanime") return null
        const entries = Object.entries(config.milestoneNames)
            .map(([lvl, name]) => ({ lvl: Number(lvl), name }))
            .sort((a, b) => a.lvl - b.lvl)
        return entries.map(({ lvl, name }, i) => ({
            id: `milestone-${config.id}-${lvl}`,
            type: "title" as const,
            name,
            text: name,
            requiredLevel: lvl,
            color: THEME_TITLE_COLORS[i % THEME_TITLE_COLORS.length],
            description: `${config.displayName} rank — level ${lvl}+`,
        }))
    }, [config.milestoneNames, config.id, config.displayName])

    const titles = themeSpecificTitles ?? TITLE_REWARDS
    const unlocked = titles.filter(r => r.requiredLevel <= currentLevel).length
    // Hide locked rank titles until earned — non-rank (TITLE_REWARDS) entries are always shown
    const displayTitles = themeSpecificTitles
        ? titles.filter(r => r.requiredLevel <= currentLevel)
        : titles

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-[--muted]">
                    <LuTag />
                    <span>{unlocked}/{titles.length} unlocked</span>
                </div>
                {themeSpecificTitles && (
                    <span className="text-xs text-[--muted] italic">
                        {config.displayName} ranks active
                    </span>
                )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {displayTitles.map((reward: TitleReward) => {
                    const isUnlocked = reward.requiredLevel <= currentLevel
                    const isActive = activeTitle?.id === reward.id
                    return (
                        <CardBase key={reward.id} isActive={isActive} isUnlocked={isUnlocked} onClick={() => setActiveTitle(reward.id)} className="items-start">
                            <div className="w-full">
                                <p
                                    className="text-sm font-semibold leading-tight"
                                    style={reward.color ? { color: reward.color } : undefined}
                                >
                                    {reward.icon && <span className="mr-1">{reward.icon}</span>}
                                    {reward.text}
                                </p>
                                <p className="text-xs text-[--muted] mt-0.5 leading-tight">{reward.description}</p>
                                {!isUnlocked && <LevelTag level={reward.requiredLevel} />}
                            </div>
                        </CardBase>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Name Colors Tab ──────────────────────────────────────────────────────────

function NameColorsTab({ currentLevel }: { currentLevel: number }) {
    const { activeNameColor, setActiveNameColor, isEggUnlocked } = useRewards()
    const allRewards = [...NAME_COLOR_REWARDS, ...EGG_NAME_COLOR_REWARDS]
    const unlocked = allRewards.filter(r => r.requiredLevel <= currentLevel || isEggUnlocked(r.id)).length

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-[--muted]">
                <LuPalette />
                <span>{unlocked}/{allRewards.length} unlocked</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {allRewards.map((reward: NameColorReward) => {
                    const isEgg = reward.requiredLevel >= 9999
                    const isUnlocked = isEgg ? isEggUnlocked(reward.id) : reward.requiredLevel <= currentLevel
                    const isActive = activeNameColor?.id === reward.id
                    return (
                        <CardBase key={reward.id} isActive={isActive} isUnlocked={isUnlocked} onClick={() => setActiveNameColor(reward.id)} className="items-start">
                            {isEgg && <EggBadge />}
                            <div className="w-full space-y-1.5">
                                <div className="w-full h-6 rounded" style={{ background: reward.gradientCss ?? reward.color }} />
                                <p className="text-xs font-medium leading-tight">{reward.name}</p>
                                <p className="text-xs text-[--muted] leading-tight">{reward.description}</p>
                                {!isUnlocked && (isEgg ? <span className="text-[10px] text-amber-400">🥚 Easter Egg</span> : <LevelTag level={reward.requiredLevel} />)}
                            </div>
                        </CardBase>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Borders Tab ─────────────────────────────────────────────────────────────

function BordersTab({ currentLevel }: { currentLevel: number }) {
    const { activeBorder, setActiveBorder, isEggUnlocked } = useRewards()
    const allRewards = [...BORDER_REWARDS, ...EGG_BORDER_REWARDS]
    const unlocked = allRewards.filter(r => r.requiredLevel <= currentLevel || isEggUnlocked(r.id)).length

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-[--muted]">
                <LuFrame />
                <span>{unlocked}/{allRewards.length} unlocked</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {allRewards.map((reward: BorderReward) => {
                    const isEgg = reward.requiredLevel >= 9999
                    const isUnlocked = isEgg ? isEggUnlocked(reward.id) : reward.requiredLevel <= currentLevel
                    const isActive = activeBorder?.id === reward.id
                    return (
                        <CardBase key={reward.id} isActive={isActive} isUnlocked={isUnlocked} onClick={() => setActiveBorder(reward.id)} className="items-start">
                            {isEgg && <EggBadge />}
                            <div className="w-full space-y-1.5">
                                <div className="w-full h-10 rounded-lg bg-gray-800" style={{ border: reward.borderCss, boxShadow: reward.glowCss }} />
                                <p className="text-xs font-medium leading-tight">{reward.icon && <span className="mr-1">{reward.icon}</span>}{reward.name}</p>
                                <p className="text-xs text-[--muted] leading-tight">{reward.description}</p>
                                {!isUnlocked && (isEgg ? <span className="text-[10px] text-amber-400">🥚 Easter Egg</span> : <LevelTag level={reward.requiredLevel} />)}
                            </div>
                        </CardBase>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Backgrounds Tab ─────────────────────────────────────────────────────────

function BackgroundsTab({ currentLevel }: { currentLevel: number }) {
    const { activeBackground, setActiveBackground } = useRewards()
    const unlocked = BACKGROUND_REWARDS.filter(r => r.requiredLevel <= currentLevel).length

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-[--muted]">
                <LuImage />
                <span>{unlocked}/{BACKGROUND_REWARDS.length} unlocked</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {BACKGROUND_REWARDS.map((reward: BackgroundReward) => {
                    const isUnlocked = reward.requiredLevel <= currentLevel
                    const isActive = activeBackground?.id === reward.id
                    return (
                        <CardBase key={reward.id} isActive={isActive} isUnlocked={isUnlocked} onClick={() => setActiveBackground(reward.id)} className="items-start">
                            <div className="w-full space-y-1.5">
                                {/* Background preview */}
                                <div
                                    className="w-full h-14 rounded-lg"
                                    style={{ background: reward.backgroundCss === "transparent" ? "#1e293b" : reward.backgroundCss }}
                                />
                                <p className="text-xs font-medium leading-tight">{reward.icon && <span className="mr-1">{reward.icon}</span>}{reward.name}</p>
                                <p className="text-xs text-[--muted] leading-tight">{reward.description}</p>
                                {!isUnlocked && <LevelTag level={reward.requiredLevel} />}
                            </div>
                        </CardBase>
                    )
                })}
            </div>
        </div>
    )
}

// ─── XP Bar Skins Tab ─────────────────────────────────────────────────────────

type XPBarCategory = "colors" | "gradients" | "moving" | "effects"

const XP_BAR_CATEGORY_META: { id: XPBarCategory; label: string; description: string }[] = [
    { id: "colors",    label: "Colors",    description: "Solid single-color fills." },
    { id: "gradients", label: "Gradients", description: "Static multi-color gradient fills." },
    { id: "moving",    label: "Moving",    description: "Animated, shimmering fills." },
    { id: "effects",   label: "Effects",   description: "Fills that bleed into the surrounding UI." },
]

function XPBarSkinCard({ reward, currentLevel }: { reward: XPBarSkinReward; currentLevel: number }) {
    const { activeXPBarSkin, setActiveXPBarSkin } = useRewards()
    const isUnlocked = reward.requiredLevel <= currentLevel
    const isActive = activeXPBarSkin?.id === reward.id
    return (
        <CardBase isActive={isActive} isUnlocked={isUnlocked} onClick={() => setActiveXPBarSkin(reward.id)} className="items-start">
            <div className="w-full space-y-2">
                {/* Ring + bar preview */}
                <div className="flex items-center gap-3">
                    <LevelRingAvatar
                        profile={{ currentLevel, name: "?" }}
                        size={44}
                        xpBarFillOverride={reward.fillCss}
                    />
                    <div className="flex-1">
                        <div
                            className="w-full h-3 rounded-full overflow-hidden"
                            style={{ background: reward.trackCss ?? "rgba(255,255,255,0.1)" }}
                        >
                            <div
                                className={cn("h-full rounded-full", reward.animClass)}
                                style={{ width: "65%", background: reward.fillCss }}
                            />
                        </div>
                    </div>
                </div>
                <p className="text-xs font-medium leading-tight">{reward.icon && <span className="mr-1">{reward.icon}</span>}{reward.name}</p>
                <p className="text-xs text-[--muted] leading-tight">{reward.description}</p>
                {!isUnlocked && <LevelTag level={reward.requiredLevel} />}
            </div>
        </CardBase>
    )
}

function XPBarsTab({ currentLevel }: { currentLevel: number }) {
    const [activeCategory, setActiveCategory] = React.useState<XPBarCategory>("colors")
    const unlocked = XP_BAR_SKIN_REWARDS.filter(r => r.requiredLevel <= currentLevel).length
    const visible = XP_BAR_SKIN_REWARDS.filter(r => r.category === activeCategory)
    const catMeta = XP_BAR_CATEGORY_META.find(c => c.id === activeCategory)!

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-[--muted]">
                    <LuZap />
                    <span>{unlocked}/{XP_BAR_SKIN_REWARDS.length} unlocked</span>
                </div>
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-1 p-1 bg-[--background] border border-[--border] rounded-lg">
                {XP_BAR_CATEGORY_META.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            activeCategory === cat.id
                                ? "bg-[--color-brand-800]/60 text-[--color-brand-200] border border-[--color-brand-700]/50"
                                : "text-[--muted] hover:text-[--foreground] hover:bg-white/5",
                        )}
                    >
                        {cat.id === "colors"    && <LuPalette   className="w-3 h-3" />}
                        {cat.id === "gradients" && <LuImage     className="w-3 h-3" />}
                        {cat.id === "moving"    && <LuSparkles  className="w-3 h-3" />}
                        {cat.id === "effects"   && <LuZap       className="w-3 h-3" />}
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Category description */}
            <p className="text-xs text-[--muted] italic">{catMeta.description}</p>

            {/* Skin grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {visible.map((reward: XPBarSkinReward) => (
                    <XPBarSkinCard key={reward.id} reward={reward} currentLevel={currentLevel} />
                ))}
            </div>
        </div>
    )
}

// ─── Particles Tab ────────────────────────────────────────────────────────────

function ParticlesTab({ currentLevel }: { currentLevel: number }) {
    const { activeParticleSets, toggleParticleSet, isParticleSetActive, isEggUnlocked } = useRewards()
    const allParticles = [...PARTICLE_SET_REWARDS.filter(r => r.id !== "particles-none"), ...EGG_PARTICLE_REWARDS]
    const unlocked = allParticles.filter(r => (r.requiredLevel < 9999 && r.requiredLevel <= currentLevel) || isEggUnlocked(r.id)).length

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-[--muted]">
                    <LuSparkles />
                    <span>{unlocked}/{allParticles.length} unlocked</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[--muted]">
                    <span className="px-2 py-0.5 rounded-full bg-white/5 border border-[--border]">
                        {activeParticleSets.length}/3 active — click to toggle
                    </span>
                    {activeParticleSets.length > 0 && (
                        <button
                            onClick={() => toggleParticleSet("particles-none")}
                            className="px-2 py-0.5 rounded-full bg-red-900/30 border border-red-700/40 text-red-400 hover:bg-red-900/50 transition-colors"
                        >
                            Clear all
                        </button>
                    )}
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {allParticles.map((reward: ParticleSetReward) => {
                    const isEgg = reward.requiredLevel >= 9999
                    const isUnlocked = isEgg ? isEggUnlocked(reward.id) : reward.requiredLevel <= currentLevel
                    const isActive = isParticleSetActive(reward.id)
                    const canAdd = activeParticleSets.length < 3 || isActive
                    return (
                        <CardBase
                            key={reward.id}
                            isActive={isActive}
                            isUnlocked={isUnlocked && canAdd}
                            onClick={() => isUnlocked && toggleParticleSet(reward.id)}
                        >
                            {isEgg && <EggBadge />}
                            <div className="text-3xl">{reward.previewEmoji}</div>
                            <div className="text-center w-full">
                                <p className="text-xs font-medium leading-tight">{reward.name}</p>
                                <p className="text-[10px] text-[--muted] leading-tight mt-0.5">{reward.description}</p>
                                {!isUnlocked && (isEgg ? <span className="text-[10px] text-amber-400">🥚 Easter Egg</span> : <LevelTag level={reward.requiredLevel} />)}
                                {isUnlocked && !canAdd && !isActive && (
                                    <span className="text-[10px] text-amber-400">Max 3</span>
                                )}
                            </div>
                        </CardBase>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Sound Pack Tab ──────────────────────────────────────────────────────────

function SoundPackTab({ currentLevel }: { currentLevel: number }) {
    const { activeSoundPackId, setActiveSoundPackId, soundVolume, setSoundVolume, soundPacks, playSound } = useSound()

    return (
        <div className="space-y-5">
            {/* Volume */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-[--paper] border border-[--border]">
                <LuVolume2 className="w-4 h-4 text-[--muted] shrink-0" />
                <span className="text-sm text-[--muted] shrink-0 w-16">SFX Volume</span>
                <div className="flex-1 relative h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-[--color-brand-500] rounded-full" style={{ width: `${soundVolume * 100}%` }} />
                    <input type="range" min={0} max={1} step={0.01} value={soundVolume}
                        onChange={e => { setSoundVolume(Number(e.target.value)); playSound("buttonClick") }}
                        className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
                </div>
                <span className="text-sm text-[--muted] w-10 text-right tabular-nums">{Math.round(soundVolume * 100)}%</span>
            </div>
            {/* Pack grid */}
            <div className="flex items-center gap-2 text-sm text-[--muted]">
                <LuVolume2 />
                <span>{soundPacks.filter((p: { requiredLevel: number }) => p.requiredLevel <= currentLevel).length}/{soundPacks.length} unlocked</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {soundPacks.map((pack: { id: string; name: string; emoji: string; description: string; requiredLevel: number }) => {
                    const isUnlocked = pack.requiredLevel <= currentLevel
                    const isActive = activeSoundPackId === pack.id
                    return (
                        <CardBase key={pack.id} isActive={isActive} isUnlocked={isUnlocked}
                            onClick={() => { setActiveSoundPackId(pack.id); playSound("itemUnlock") }}
                        >
                            <div className="text-3xl">{pack.emoji}</div>
                            <div className="text-center w-full">
                                <p className="text-xs font-medium leading-tight">{pack.name}</p>
                                <p className="text-[10px] text-[--muted] leading-tight mt-0.5">{pack.description}</p>
                                {!isUnlocked && <LevelTag level={pack.requiredLevel} />}
                                {isActive && (
                                    <button
                                        onClick={e => { e.stopPropagation(); playSound("notification") }}
                                        className="mt-1 flex items-center justify-center gap-1 text-[10px] text-[--color-brand-400] hover:text-[--color-brand-300] mx-auto"
                                    >
                                        <LuPlay className="w-2.5 h-2.5" /> Preview
                                    </button>
                                )}
                            </div>
                        </CardBase>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Preview swatches ────────────────────────────────────────────────────────

function UIPreviewSwatch({ previewCss }: { previewCss?: string }) {
    const id = React.useId().replace(/:/g, "")
    return (
        <>
            {previewCss && (
                <style>{`.sea-swatch-${id}{${previewCss}}`}</style>
            )}
            <div className={cn("w-full h-8 rounded-lg overflow-hidden border border-white/10", previewCss && `sea-swatch-${id}`)}
                style={!previewCss ? { background: "#374151" } : undefined}
            />
        </>
    )
}

// Animated bar that slides left→right using the preset's exact duration+easing
function AnimationPreviewSwatch({ preset }: { preset: UIPreset }) {
    const dur  = preset.cssVars?.["--sea-dur"]  ?? "200ms"
    const ease = preset.cssVars?.["--sea-ease"] ?? "ease"
    const id   = React.useId().replace(/:/g, "")
    return (
        <>
            <style>{`.sea-ap-${id}{animation:sea-anim-preview ${dur} ${ease} infinite alternate;}`}</style>
            <div className="w-full h-8 rounded-lg overflow-hidden border border-white/10 relative bg-[#111827]">
                <div className={`sea-ap-${id} absolute inset-y-1 w-1/3 rounded bg-gradient-to-r from-indigo-500 to-purple-500`} />
            </div>
        </>
    )
}

// Mini card that auto-plays the hover animation in a slow loop
function HoverPreviewSwatch({ preset }: { preset: UIPreset }) {
    const scale = preset.cssVars?.["--sea-hover-scale"] ?? "1"
    const lift  = preset.cssVars?.["--sea-hover-lift"]  ?? "0px"
    const glow  = preset.cssVars?.["--sea-hover-glow"]  ?? "none"
    const dur   = preset.cssVars?.["--sea-hover-dur"]   ?? "200ms"
    const id    = React.useId().replace(/:/g, "")
    const loopDur = `${(parseFloat(dur) * 6).toFixed(0)}ms`
    return (
        <>
            <style>{`
                @keyframes sea-hp-${id} {
                    0%,100%{transform:scale(1) translateY(0);box-shadow:none;}
                    50%{transform:scale(${scale}) translateY(${lift});box-shadow:${glow};}
                }
                .sea-hp-${id}{animation:sea-hp-${id} ${loopDur} ease-in-out infinite;}
            `}</style>
            <div className="w-full h-8 rounded-lg overflow-hidden border border-white/10 bg-[#111827] flex items-center justify-center">
                <div className={`sea-hp-${id} w-4/5 h-5 rounded-md bg-[#252840] border border-white/10`} />
            </div>
        </>
    )
}

// Mini card that replays the chosen page-transition animation on loop
function TransitionPreviewSwatch({ preset }: { preset: UIPreset }) {
    const transClass = preset.cssVars?.["--sea-page-transition"] ?? ""
    const id = React.useId().replace(/:/g, "")
    const kfMap: Record<string, string> = {
        "sea-page-fade":        `0%,100%{opacity:0}40%{opacity:1}70%{opacity:1}`,
        "sea-page-slide-up":    `0%,100%{opacity:0;transform:translateY(8px)}40%{opacity:1;transform:translateY(0)}70%{opacity:1;transform:translateY(0)}`,
        "sea-page-scale":       `0%,100%{opacity:0;transform:scale(0.92)}40%{opacity:1;transform:scale(1)}70%{opacity:1;transform:scale(1)}`,
        "sea-page-slide-right": `0%,100%{opacity:0;transform:translateX(-8px)}40%{opacity:1;transform:translateX(0)}70%{opacity:1;transform:translateX(0)}`,
        "":                     `0%,100%{opacity:1}`,
    }
    const kf = kfMap[transClass] ?? kfMap["sea-page-fade"]
    return (
        <>
            <style>{`
                @keyframes sea-tp-${id} { ${kf} }
                .sea-tp-${id}{animation:sea-tp-${id} 2.2s ease-in-out infinite;}
            `}</style>
            <div className="w-full h-8 rounded-lg overflow-hidden border border-white/10 bg-[#0e0e17] flex items-center justify-center">
                <div className={`sea-tp-${id} w-4/5 h-5 rounded-md bg-[#252840] border border-white/10`} />
            </div>
        </>
    )
}

// ─── Visual Effects preview swatch ───────────────────────────────────────────

function EffectsPreviewSwatch({ preset }: { preset: UIPreset }) {
    const vignette   = parseFloat(preset.cssVars?.["--sea-vignette"]  ?? "0")
    const glow       = parseFloat(preset.cssVars?.["--sea-glow"]      ?? "0")
    const grain      = parseFloat(preset.cssVars?.["--sea-grain"]     ?? "0")
    const hasLines   = preset.cssVars?.["--sea-scanlines"] === "1"
    const hasDeepSea = preset.cssVars?.["--sea-deep-sea"]  === "1"
    const hasInkWash = preset.cssVars?.["--sea-ink-wash"]  === "1"
    const id = React.useId().replace(/:/g, "")
    return (
        <div className="w-full h-8 rounded-lg overflow-hidden border border-white/10 relative" style={{ background: "#120a20" }}>
            {/* Base gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/50 via-purple-900/30 to-blue-900/40" />
            {/* Deep Sea tint */}
            {hasDeepSea && <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(3,105,161,0.55),rgba(7,89,133,0.75))", mixBlendMode: "multiply" }} />}
            {/* Ink Wash */}
            {hasInkWash && <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#111,#222 50%,#0d0d0d)", opacity: 0.7 }} />}
            {/* Vignette */}
            {vignette > 0 && (
                <div className="absolute inset-0" style={{
                    background: `radial-gradient(ellipse at center, transparent ${Math.max(0, 60 - vignette * 30)}%, rgba(0,0,0,${vignette * 0.85}) 100%)`
                }} />
            )}
            {/* Glow — animated */}
            {glow > 0 && (
                <>
                    <style>{`@keyframes efx-${id}{0%,100%{opacity:0.45}50%{opacity:1}}.efx-g-${id}{animation:efx-${id} 2s ease-in-out infinite}`}</style>
                    <div className={`efx-g-${id} absolute inset-0`} style={{
                        background: `radial-gradient(ellipse at center, rgba(139,92,246,${glow * 0.75}) 0%, transparent 75%)`,
                        mixBlendMode: "screen",
                    }} />
                </>
            )}
            {/* Grain */}
            {grain > 0 && (
                <div className="absolute inset-0" style={{
                    opacity: grain * 0.85,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundSize: "32px 32px",
                    mixBlendMode: "overlay",
                }} />
            )}
            {/* Scanlines */}
            {hasLines && (
                <div className="absolute inset-0" style={{
                    background: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.3) 2px,rgba(0,0,0,0.3) 4px)"
                }} />
            )}
        </div>
    )
}

// ─── UI Enhancements tab (10 horizontal inner tabs) ──────────────────────────

const UI_TAB_ICONS: Record<string, React.ReactNode> = {
    animations:  <LuWand className="w-3 h-3" />,
    cards:       <LuCreditCard className="w-3 h-3" />,
    radius:      <LuCircleDot className="w-3 h-3" />,
    typography:  <LuType className="w-3 h-3" />,
    accent:      <LuDroplets className="w-3 h-3" />,
    effects:     <LuSparkles className="w-3 h-3" />,
    layout:      <LuLayoutDashboard className="w-3 h-3" />,
    sidebar:     <LuPanelLeft className="w-3 h-3" />,
    transitions: <LuChevronsUpDown className="w-3 h-3" />,
    scrollbar:   <LuSlidersHorizontal className="w-3 h-3" />,
}

function UIPresetsGrid({ category, currentLevel }: { category: typeof UI_CUSTOMIZE_CATEGORIES[number]; currentLevel: number }) {
    const { state, setPreset } = useUICustomize()
    const activeId = state[category.id as UICustomizeCategoryId]

    const renderSwatch = (preset: UIPreset) => {
        switch (category.id) {
            case "animations":   return <AnimationPreviewSwatch preset={preset} />
            case "hover":        return <HoverPreviewSwatch preset={preset} />
            case "transitions":  return <TransitionPreviewSwatch preset={preset} />
            case "effects":      return <EffectsPreviewSwatch preset={preset} />
            default:             return <UIPreviewSwatch previewCss={preset.previewCss} />
        }
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {(category.presets as readonly UIPreset[]).map(preset => {
                const required = preset.requiredLevel ?? 1
                const isUnlocked = currentLevel >= required
                const isActive = activeId === preset.id
                return (
                    <button
                        key={preset.id}
                        disabled={!isUnlocked}
                        onClick={() => isUnlocked && setPreset(category.id as UICustomizeCategoryId, preset.id)}
                        className={cn(
                            "sea-hoverable relative flex flex-col items-start gap-1.5 p-2.5 rounded-xl border text-left transition-all",
                            isActive
                                ? "border-[--color-brand-500] bg-[--color-brand-900]/30 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                                : isUnlocked
                                    ? "border-[--border] bg-[--paper] hover:border-[--color-brand-600] hover:bg-[--paper]/80"
                                    : "border-[--border] bg-[--paper]/50 opacity-50 cursor-not-allowed",
                        )}
                    >
                        {renderSwatch(preset)}
                        <div className="w-full">
                            <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-semibold truncate leading-tight">{preset.name}</span>
                                {isActive && <LuCheck className="w-3 h-3 text-[--color-brand-400] shrink-0" />}
                                {!isUnlocked && <LuLock className="w-3 h-3 text-gray-500 shrink-0" />}
                            </div>
                            {!isUnlocked && (
                                <p className="text-[10px] text-[--muted] mt-0.5">Lv. {required}</p>
                            )}
                        </div>
                    </button>
                )
            })}
        </div>
    )
}

function UIEnhancementsSection({ currentLevel }: { currentLevel: number }) {
    const [activeInner, setActiveInner] = React.useState<string>("animations")
    const activeCategory = UI_CUSTOMIZE_CATEGORIES.find(c => c.id === activeInner)!

    return (
        <div className="space-y-3">
            {/* 10 horizontal inner tabs */}
            <div className="flex flex-wrap gap-1 p-1 bg-[--background] border border-[--border] rounded-lg">
                {UI_CUSTOMIZE_CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveInner(cat.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            activeInner === cat.id
                                ? "bg-[--color-brand-800]/60 text-[--color-brand-200] border border-[--color-brand-700]/50"
                                : "text-[--muted] hover:text-[--foreground] hover:bg-white/5",
                        )}
                    >
                        {UI_TAB_ICONS[cat.id]}
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <UIPresetsGrid category={activeCategory} currentLevel={currentLevel} />
        </div>
    )
}

// ─── Main Shop ────────────────────────────────────────────────────────────────

type MainSection = "profile" | "ui"

export function RewardShop({ currentLevel }: Props) {
    const [section, setSection] = React.useState<MainSection>("profile")

    return (
        <div className="flex gap-4 min-h-[400px]">
            {/* Vertical left sidebar */}
            <div className="flex flex-col gap-1 w-44 shrink-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[--muted] px-2 mb-1">Sections</p>

                <button
                    onClick={() => setSection("profile")}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all",
                        section === "profile"
                            ? "bg-[--color-brand-900]/50 text-[--color-brand-200] border border-[--color-brand-700]/40"
                            : "text-[--muted] hover:text-[--foreground] hover:bg-white/5 border border-transparent",
                    )}
                >
                    <LuSparkles className="w-4 h-4 shrink-0" />
                    Profile Visuals
                </button>

                <button
                    onClick={() => setSection("ui")}
                    className={cn(
                        "flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold text-left transition-all mt-1",
                        section === "ui"
                            ? "bg-[--color-brand-800]/60 text-[--color-brand-100] border border-[--color-brand-600]/50 shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                            : "text-[--foreground] hover:bg-white/5 border border-[--border]",
                    )}
                >
                    <LuWand className="w-4 h-4 shrink-0 text-[--color-brand-400]" />
                    <span>UI Enhancements</span>
                </button>

                {section === "ui" && (
                    <div className="mt-1 pl-2 text-[10px] text-[--muted] leading-relaxed">
                        Customize animations, card style, colors, layout and more.
                    </div>
                )}
            </div>

            {/* Right content */}
            <div className="flex-1 min-w-0">
                {section === "profile" && (
                    <Tabs defaultValue="titles" className="w-full">
                        <TabsList className="mb-4 flex flex-wrap gap-1 h-auto bg-transparent border border-[--border] p-1 rounded-lg">
                            <TabsTrigger value="titles"  className="flex items-center gap-1.5 text-xs"><LuTag       className="shrink-0" /> Titles</TabsTrigger>
                            <TabsTrigger value="xpbars"  className="flex items-center gap-1.5 text-xs"><LuZap       className="shrink-0" /> XP Bars</TabsTrigger>
                        </TabsList>

                        <TabsContent value="titles">  <TitlesTab  currentLevel={currentLevel} /> </TabsContent>
                        <TabsContent value="xpbars">  <XPBarsTab  currentLevel={currentLevel} /> </TabsContent>
                    </Tabs>
                )}

                {section === "ui" && (
                    <Tabs defaultValue="enhancements" className="w-full">
                        <TabsList className="mb-4 flex flex-wrap gap-1 h-auto bg-transparent border border-[--border] p-1 rounded-lg">
                            <TabsTrigger value="enhancements" className="flex items-center gap-1.5 text-xs"><LuWand          className="shrink-0" /> Enhancements</TabsTrigger>
                            <TabsTrigger value="particles"    className="flex items-center gap-1.5 text-xs"><LuSparkles      className="shrink-0" /> Particles</TabsTrigger>
                            <TabsTrigger value="cursors"      className="flex items-center gap-1.5 text-xs"><LuMousePointer2 className="shrink-0" /> Cursors</TabsTrigger>
                            <TabsTrigger value="sounds"       className="flex items-center gap-1.5 text-xs"><LuVolume2       className="shrink-0" /> Sounds</TabsTrigger>
                        </TabsList>
                        <TabsContent value="enhancements"><UIEnhancementsSection currentLevel={currentLevel} /></TabsContent>
                        <TabsContent value="particles">   <ParticlesTab currentLevel={currentLevel} /></TabsContent>
                        <TabsContent value="cursors">     <CursorTab    currentLevel={currentLevel} /></TabsContent>
                        <TabsContent value="sounds">      <SoundPackTab currentLevel={currentLevel} /></TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    )
}
