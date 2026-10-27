"use client"

import { ProfileStyleTab } from "./profile-style-tab"
import { fetchSharedThemesList, type SharedThemeInfo } from "@/lib/theme/marketplace-theme-loader"
import type { AnimeThemeId } from "@/lib/theme/anime-themes/types"
import { ANIME_THEME_LIST } from "@/lib/theme/anime-themes"
import React from "react"
import {
    LuBell,
    LuCheck,
    LuChevronsUpDown,
    LuCircleDot,
    LuCreditCard,
    LuDroplets,
    LuFrame,
    LuGauge,
    LuHighlighter,
    LuImage,
    LuLayoutDashboard,
    LuLock,
    LuMoon,
    LuMousePointer2,
    LuMusic,
    LuPalette,
    LuPanelLeft,
    LuPanelTop,
    LuPlay,
    LuPointer,
    LuSlidersHorizontal,
    LuSparkles,
    LuTag,
    LuType,
    LuVolume2,
    LuWand,
    LuZap,
} from "react-icons/lu"
import {
    UI_CUSTOMIZE_CATEGORIES,
    type UICustomizeCategoryId,
    type UIPreset,
} from "@/lib/ui-customize/ui-customize-definitions"
import { useUICustomize } from "@/lib/ui-customize/ui-customize-provider"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import { ThemeOstMiniPlayer } from "@/lib/theme/anime-themes/theme-ost-mini-player"
import { LevelRingAvatar } from "@/app/(main)/_features/level-ring-avatar"
import { PageTransitionControls } from "@/components/shared/page-transition-controls"
import { useSound, EXTENDED_SOUND_NAMES, EXTENDED_SOUND_LABELS } from "@/lib/sounds/sound-provider"
import { cn } from "@/components/ui/core/styling"
import { ALL_CURSOR_DEFINITIONS } from "@/lib/cursors/cursor-generator"
import { packFilter } from "@/lib/cursors/cursor-packs"
import { useCursor } from "@/lib/cursors/cursor-provider"
import { useRewards } from "@/lib/rewards/reward-provider"
import { XPBarFxOverlay } from "@/lib/rewards/xpbar-fx-overlay"
import { colord } from "colord"
import {
    TITLE_REWARDS,
    NAME_COLOR_REWARDS,
    BORDER_REWARDS,
    BACKGROUND_REWARDS,
    XP_BAR_SKIN_REWARDS,
    PARTICLE_SET_REWARDS,
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

// Profile visuals are earned with levels. Everything under Interface (enhancements, particles,
// cursors, sounds, music) is free: it changes how the app feels, not what the profile shows off.

const EGG_LEVEL = 9999

// ─── Section header stat ──────────────────────────────────────────────────────

/** Each section reports a one-line tally ("12 of 40 unlocked") for the shop's pinned header. */
const ShopStatContext = React.createContext<(stat: string | null) => void>(() => {})

function useShopStat(stat: string | null) {
    const report = React.useContext(ShopStatContext)
    React.useEffect(() => { report(stat) }, [stat, report])
}

// ─── Shared pieces ────────────────────────────────────────────────────────────

/** A reward card. `locked` is the reason it can't be picked ("Lv 12", "Easter egg"), or false. */
function ShopCard({
    isActive,
    locked = false,
    disabled = false,
    egg = false,
    onClick,
    children,
    className,
}: {
    isActive: boolean
    locked?: string | false
    disabled?: boolean
    egg?: boolean
    onClick: () => void
    children: React.ReactNode
    className?: string
}) {
    const blocked = !!locked || disabled
    return (
        <button
            type="button"
            disabled={blocked}
            onClick={onClick}
            aria-pressed={isActive}
            className={cn(
                "sea-hoverable group relative flex flex-col gap-2 p-3 rounded-2xl border text-left transition-all duration-200",
                isActive
                    ? "border-brand-400/70 bg-brand-500/[0.12] ring-1 ring-brand-400/40 shadow-[0_10px_30px_-14px_rgb(var(--color-brand-500)/0.7)]"
                    : blocked
                        ? "border-white/[0.05] bg-white/[0.015] cursor-not-allowed"
                        : "border-white/[0.07] bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05]",
                className,
            )}
        >
            <div className={cn("contents", blocked && "[&>*]:opacity-45 [&>*]:saturate-50")}>{children}</div>
            {egg && (
                <span className="absolute top-2 left-2 text-[11px] leading-none" title="Easter egg exclusive">🥚</span>
            )}
            {isActive && (
                <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-brand-400 text-black shadow-md">
                    <LuCheck className="size-3" strokeWidth={3} />
                </span>
            )}
            {!isActive && locked && (
                <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/10 backdrop-blur">
                    <LuLock className="size-2.5" />
                    {locked}
                </span>
            )}
        </button>
    )
}

function lockFor(reward: { id: string, requiredLevel: number }, currentLevel: number, isEggUnlocked?: (id: string) => boolean): string | false {
    if (reward.requiredLevel >= EGG_LEVEL) return isEggUnlocked?.(reward.id) ? false : "Easter egg"
    return reward.requiredLevel <= currentLevel ? false : `Lv ${reward.requiredLevel}`
}

type SegmentItem<T extends string> = { id: T, label: string, icon?: React.ReactNode }

function Segmented<T extends string>({ items, value, onChange, className }: {
    items: SegmentItem<T>[]
    value: T
    onChange: (v: T) => void
    className?: string
}) {
    return (
        <div role="tablist" className={cn("flex flex-wrap gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]", className)}>
            {items.map(item => {
                const on = item.id === value
                return (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => onChange(item.id)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
                            on
                                ? "bg-white/[0.1] text-white shadow-sm ring-1 ring-white/[0.08]"
                                : "text-[--muted] hover:bg-white/[0.04] hover:text-white",
                        )}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                )
            })}
        </div>
    )
}

function Panel({ children, className }: { children: React.ReactNode, className?: string }) {
    return <div className={cn("rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>{children}</div>
}

function GroupLabel({ children, hint }: { children: React.ReactNode, hint?: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[--muted]">{children}</p>
            {hint && <p className="text-xs text-[--muted]">{hint}</p>}
        </div>
    )
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean, onChange: (v: boolean) => void, label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            onClick={() => onChange(!checked)}
            className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
                checked ? "bg-brand-500" : "bg-white/15",
            )}
        >
            <span
                className={cn(
                    "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200",
                    checked && "translate-x-4",
                )}
            />
        </button>
    )
}

const grid = {
    compact: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3",
    wide: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3",
    medium: "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3",
}

// ─── Titles ───────────────────────────────────────────────────────────────────

// Colours for themed rank titles, by rank order.
const THEME_TITLE_COLORS = [
    "#94a3b8","#a3e635","#67e8f9","#fb7185","#c084fc","#f472b6","#facc15","#fbbf24",
    "#4ade80","#fcd34d","#34d399","#f87171","#38bdf8","#22d3ee","#60a5fa","#a3a3a3",
    "#d97706","#6ee7b7","#e879f9","#fff","#f97316","#818cf8","#fde68a","#fda4af",
]

function TitlesTab({ currentLevel }: { currentLevel: number }) {
    const { activeTitle, setActiveTitle } = useRewards()
    const { config } = useAnimeTheme()

    // A theme with its own rank names replaces the general titles with those ranks.
    const themeSpecificTitles = React.useMemo((): TitleReward[] | null => {
        if (!config.milestoneNames || config.id === "seanime") return null
        return Object.entries(config.milestoneNames)
            .map(([lvl, name]) => ({ lvl: Number(lvl), name }))
            .sort((a, b) => a.lvl - b.lvl)
            .map(({ lvl, name }, i) => ({
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
    // Rank titles stay hidden until earned; general titles are all shown.
    const displayTitles = themeSpecificTitles ? titles.filter(r => r.requiredLevel <= currentLevel) : titles
    useShopStat(`${unlocked} of ${titles.length} unlocked`)

    return (
        <div className="space-y-4">
            {themeSpecificTitles && (
                <p className="text-xs text-[--muted]">
                    Your theme, <span className="text-white/90">{config.displayName}</span>, has its own ranks. New ones appear as you level up.
                </p>
            )}
            <div className={grid.medium}>
                {displayTitles.map((reward: TitleReward) => (
                    <ShopCard
                        key={reward.id}
                        isActive={activeTitle?.id === reward.id}
                        locked={lockFor(reward, currentLevel)}
                        onClick={() => setActiveTitle(reward.id)}
                    >
                        <p className="pr-12 text-sm font-semibold leading-tight" style={reward.color ? { color: reward.color } : undefined}>
                            {reward.icon && <span className="mr-1">{reward.icon}</span>}
                            {reward.text}
                        </p>
                        <p className="text-xs text-[--muted] leading-snug">{reward.description}</p>
                    </ShopCard>
                ))}
            </div>
        </div>
    )
}

// ─── Name colours ─────────────────────────────────────────────────────────────

function NameColorsTab({ currentLevel }: { currentLevel: number }) {
    const {
        activeNameColor, setActiveNameColor, isEggUnlocked,
        shineEnabled, shineDirection, shineDuration, shineEasing,
        setShineEnabled, setShineDirection, setShineDuration, setShineEasing,
    } = useRewards()
    const allRewards = [...NAME_COLOR_REWARDS, ...EGG_NAME_COLOR_REWARDS]
    const unlocked = allRewards.filter(r => !lockFor(r, currentLevel, isEggUnlocked)).length
    useShopStat(`${unlocked} of ${allRewards.length} unlocked`)

    const hasGradient = Boolean(activeNameColor?.gradientCss)
    const sampleGradient = activeNameColor?.gradientCss ?? "linear-gradient(90deg,#f43f5e,#f97316,#facc15,#4ade80,#60a5fa,#a78bfa)"

    return (
        <div className="space-y-5">
            <Panel className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="flex items-center gap-2 text-sm font-semibold"><LuSparkles className="text-brand-300" /> Name shine</p>
                        <p className="mt-0.5 text-xs text-[--muted]">
                            A light that sweeps across your name{hasGradient ? "." : ". Shows on gradient colours only."}
                        </p>
                    </div>
                    <ToggleSwitch checked={shineEnabled} onChange={setShineEnabled} label="Name shine" />
                </div>

                <div
                    className={cn("rounded-xl bg-black/30 px-3 py-3 text-center text-2xl font-bold ring-1 ring-white/[0.05]", shineEnabled && "sea-name-shine")}
                    style={{ backgroundImage: sampleGradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
                >
                    {activeNameColor?.name ?? "Preview"}
                </div>

                <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", !shineEnabled && "pointer-events-none opacity-40")}>
                    <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wider text-[--muted]">Direction</p>
                        <Segmented
                            items={[{ id: "left", label: "← Left" }, { id: "right", label: "Right →" }]}
                            value={shineDirection}
                            onChange={setShineDirection}
                            className="[&>button]:flex-1 [&>button]:justify-center"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wider text-[--muted]">
                            Duration <span className="ml-1 tabular-nums text-white/90">{shineDuration.toFixed(1)}s</span>
                        </p>
                        <input
                            type="range" min={0.5} max={10} step={0.1} value={shineDuration}
                            onChange={e => setShineDuration(Number(e.target.value))}
                            className="mt-2 w-full accent-[rgb(var(--color-brand-400))]"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wider text-[--muted]">Easing</p>
                        <select
                            value={shineEasing}
                            onChange={e => setShineEasing(e.target.value)}
                            className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-2.5 py-1.5 text-xs"
                        >
                            <option value="linear">Linear</option>
                            <option value="ease">Ease</option>
                            <option value="ease-in">Ease in</option>
                            <option value="ease-out">Ease out</option>
                            <option value="ease-in-out">Ease in-out</option>
                            <option value="cubic-bezier(0.37, 0, 0.63, 1)">Smooth</option>
                            <option value="cubic-bezier(0.68, -0.55, 0.27, 1.55)">Back</option>
                            <option value="steps(20, end)">Stepped</option>
                        </select>
                    </div>
                </div>
            </Panel>

            <div className={grid.compact}>
                {allRewards.map((reward: NameColorReward) => (
                    <ShopCard
                        key={reward.id}
                        isActive={activeNameColor?.id === reward.id}
                        locked={lockFor(reward, currentLevel, isEggUnlocked)}
                        egg={reward.requiredLevel >= EGG_LEVEL}
                        onClick={() => setActiveNameColor(reward.id)}
                    >
                        <div className="h-8 w-full rounded-lg ring-1 ring-white/10" style={{ background: reward.gradientCss ?? reward.color }} />
                        <p className="text-xs font-semibold leading-tight">{reward.name}</p>
                        <p className="text-[11px] text-[--muted] leading-snug line-clamp-2">{reward.description}</p>
                    </ShopCard>
                ))}
            </div>
        </div>
    )
}

// ─── Avatar borders ───────────────────────────────────────────────────────────

function BordersTab({ currentLevel }: { currentLevel: number }) {
    const { activeBorder, setActiveBorder, isEggUnlocked } = useRewards()
    const allRewards = [...BORDER_REWARDS, ...EGG_BORDER_REWARDS]
    const unlocked = allRewards.filter(r => !lockFor(r, currentLevel, isEggUnlocked)).length
    useShopStat(`${unlocked} of ${allRewards.length} unlocked`)

    return (
        <div className={grid.compact}>
            {allRewards.map((reward: BorderReward) => (
                <ShopCard
                    key={reward.id}
                    isActive={activeBorder?.id === reward.id}
                    locked={lockFor(reward, currentLevel, isEggUnlocked)}
                    egg={reward.requiredLevel >= EGG_LEVEL}
                    onClick={() => setActiveBorder(reward.id)}
                >
                    <div className="flex h-16 w-full items-center justify-center rounded-xl bg-black/25">
                        <div className="size-11 rounded-full bg-gradient-to-br from-gray-600 to-gray-800" style={{ border: reward.borderCss, boxShadow: reward.glowCss }} />
                    </div>
                    <p className="text-xs font-semibold leading-tight">{reward.icon && <span className="mr-1">{reward.icon}</span>}{reward.name}</p>
                    <p className="text-[11px] text-[--muted] leading-snug line-clamp-2">{reward.description}</p>
                </ShopCard>
            ))}
        </div>
    )
}

// ─── Header backgrounds ───────────────────────────────────────────────────────

function BackgroundsTab({ currentLevel }: { currentLevel: number }) {
    const { activeBackground, setActiveBackground } = useRewards()
    const unlocked = BACKGROUND_REWARDS.filter(r => r.requiredLevel <= currentLevel).length
    useShopStat(`${unlocked} of ${BACKGROUND_REWARDS.length} unlocked`)

    return (
        <div className={grid.medium}>
            {BACKGROUND_REWARDS.map((reward: BackgroundReward) => (
                <ShopCard
                    key={reward.id}
                    isActive={activeBackground?.id === reward.id}
                    locked={lockFor(reward, currentLevel)}
                    onClick={() => setActiveBackground(reward.id)}
                >
                    <div
                        className="h-20 w-full rounded-xl ring-1 ring-white/10"
                        style={{ background: reward.backgroundCss === "transparent" ? "#1e293b" : reward.backgroundCss }}
                    />
                    <p className="text-xs font-semibold leading-tight">{reward.icon && <span className="mr-1">{reward.icon}</span>}{reward.name}</p>
                    <p className="text-[11px] text-[--muted] leading-snug line-clamp-2">{reward.description}</p>
                </ShopCard>
            ))}
        </div>
    )
}

// ─── XP bars ──────────────────────────────────────────────────────────────────

type XPBarCategory = "colors" | "gradients" | "moving" | "effects"

const XP_BAR_CATEGORIES: (SegmentItem<XPBarCategory> & { description: string })[] = [
    { id: "colors", label: "Colors", icon: <LuPalette className="size-3" />, description: "Solid single-colour fills." },
    { id: "gradients", label: "Gradients", icon: <LuImage className="size-3" />, description: "Static multi-colour gradient fills." },
    { id: "moving", label: "Moving", icon: <LuSparkles className="size-3" />, description: "Animated, shimmering fills." },
    { id: "effects", label: "Effects", icon: <LuZap className="size-3" />, description: "Fills that bleed into the surrounding UI." },
]

/**
 * The colour a skin is drawn in on its card.
 *
 * Every skin is named for what it looks like (Crimson, Ocean, Sakura, Copper), and the card shows it
 * in that colour rather than the accent, so the shelf reads as different things instead of one bar
 * repeated. Skins defined as a flat colour get a gradient in their own hue.
 */
function skinCardFill(reward: XPBarSkinReward): string {
    const fill = reward.fillCss
    if (!fill) return "rgba(255,255,255,0.25)"
    if (fill.includes("gradient")) return fill

    const color = colord(fill)
    if (!color.isValid()) return fill

    const dark = color.darken(0.22).toHex()
    const light = color.lighten(0.18).toHex()
    return `linear-gradient(90deg, ${dark}, ${fill}, ${light})`
}

function XPBarSkinCard({ reward, currentLevel }: { reward: XPBarSkinReward; currentLevel: number }) {
    const { activeXPBarSkin, setActiveXPBarSkin } = useRewards()
    const shown: XPBarSkinReward = React.useMemo(() => ({ ...reward, fillCss: skinCardFill(reward) }), [reward])

    return (
        <ShopCard
            isActive={activeXPBarSkin?.id === reward.id}
            locked={lockFor(reward, currentLevel)}
            onClick={() => setActiveXPBarSkin(reward.id)}
        >
            <div className="flex items-center gap-3 rounded-xl bg-black/25 p-2.5">
                <LevelRingAvatar profile={{ currentLevel, name: "?" }} size={40} xpBarFillOverride={shown.fillCss} />
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: shown.trackCss ?? "rgba(255,255,255,0.1)" }}>
                    <div
                        className={cn("h-full rounded-full", shown.animClass)}
                        style={{
                            width: "65%",
                            background: shown.fillCss,
                            // Gradient animation classes need room to scroll, as on the real bar.
                            backgroundSize: shown.animClass ? "300% 100%" : undefined,
                        }}
                    />
                    <XPBarFxOverlay skin={shown} fillCss={shown.fillCss} />
                </div>
            </div>
            <p className="text-xs font-semibold leading-tight">{reward.icon && <span className="mr-1">{reward.icon}</span>}{reward.name}</p>
            <p className="text-[11px] text-[--muted] leading-snug line-clamp-2">{shown.description}</p>
        </ShopCard>
    )
}

function XPBarsTab({ currentLevel }: { currentLevel: number }) {
    const [category, setCategory] = React.useState<XPBarCategory>("colors")
    const unlocked = XP_BAR_SKIN_REWARDS.filter(r => r.requiredLevel <= currentLevel).length
    useShopStat(`${unlocked} of ${XP_BAR_SKIN_REWARDS.length} unlocked`)
    const visible = XP_BAR_SKIN_REWARDS.filter(r => r.category === category)

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Segmented items={XP_BAR_CATEGORIES} value={category} onChange={setCategory} />
                <p className="text-xs text-[--muted]">{XP_BAR_CATEGORIES.find(c => c.id === category)?.description}</p>
            </div>
            <div className={grid.wide}>
                {visible.map((reward: XPBarSkinReward) => (
                    <XPBarSkinCard key={reward.id} reward={reward} currentLevel={currentLevel} />
                ))}
            </div>
        </div>
    )
}

// ─── Themes ───────────────────────────────────────────────────────────────────

type ThemeEntry = {
    id: string
    title: string
    author: string
    backgroundImageUrl: string
    previewColors: { bg: string; primary: string; secondary: string; accent: string }
}

function ThemesTab() {
    // Equipping goes through the real theme system (the one the Theme Manager drives), so the whole
    // app changes theme.
    const { themeId, setThemeId } = useAnimeTheme()
    const { setActiveTheme } = useRewards()
    const [shared, setShared] = React.useState<SharedThemeInfo[]>([])
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        let cancelled = false
        fetchSharedThemesList()
            .then(list => { if (!cancelled) setShared(list) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [])

    const themes: ThemeEntry[] = React.useMemo(() => {
        const bundled: ThemeEntry[] = ANIME_THEME_LIST.map(t => ({
            id: t.id,
            title: t.displayName,
            author: "Seanime",
            backgroundImageUrl: t.backgroundImageUrl || t.bannerImageUrl || "",
            previewColors: t.previewColors,
        }))
        const seen = new Set(bundled.map(t => t.id))
        const downloaded: ThemeEntry[] = shared.filter(t => !seen.has(t.id)).map(t => ({
            id: t.id,
            title: t.displayName,
            author: t.author ?? "Marketplace",
            backgroundImageUrl: t.backgroundImageUrl ?? "",
            previewColors: t.previewColors ?? { bg: "#000", primary: "#fff", secondary: "#999", accent: "#f00" },
        }))
        return [...bundled, ...downloaded]
    }, [shared])
    useShopStat(loading ? "Loading downloaded themes…" : `${themes.length} themes`)

    const equip = (id: string) => {
        setThemeId(id as AnimeThemeId)
        setActiveTheme(id)
    }

    return (
        <div className="space-y-4">
            <p className="text-xs text-[--muted]">Applies to the whole app. Get more from the Theme Manager.</p>
            <div className={grid.medium}>
                {themes.map(theme => (
                    <ShopCard key={theme.id} isActive={themeId === theme.id} onClick={() => equip(theme.id)} className="overflow-hidden p-2">
                        <div className="relative h-28 w-full overflow-hidden rounded-xl ring-1 ring-white/10">
                            {theme.backgroundImageUrl ? (
                                <div
                                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                                    style={{ backgroundImage: `url('${theme.backgroundImageUrl}')` }}
                                />
                            ) : (
                                <div
                                    className="absolute inset-0"
                                    style={{ background: `linear-gradient(135deg, ${theme.previewColors.primary}88 0%, ${theme.previewColors.secondary}88 100%)` }}
                                />
                            )}
                            <div className="absolute inset-x-0 bottom-0 flex gap-1 p-2">
                                {[theme.previewColors.primary, theme.previewColors.secondary, theme.previewColors.accent].map((c, i) => (
                                    <span key={i} className="size-3 rounded-full ring-1 ring-black/40" style={{ background: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="px-1 pb-0.5">
                            <p className="truncate text-xs font-semibold leading-tight">{theme.title}</p>
                            <p className="mt-0.5 truncate text-[11px] text-[--muted]">{theme.author}</p>
                        </div>
                    </ShopCard>
                ))}
            </div>
        </div>
    )
}

// ─── Particles (free; easter-egg sets still need their egg) ───────────────────

function ParticlesTab() {
    const { activeParticleSets, toggleParticleSet, isParticleSetActive, isEggUnlocked } = useRewards()
    const allParticles = [...PARTICLE_SET_REWARDS.filter(r => r.id !== "particles-none"), ...EGG_PARTICLE_REWARDS]
    useShopStat(`${activeParticleSets.length} of 3 active`)

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[--muted]">Pick up to three. Click again to turn one off.</p>
                {activeParticleSets.length > 0 && (
                    <button
                        type="button"
                        onClick={() => toggleParticleSet("particles-none")}
                        className="rounded-full px-3 py-1 text-xs font-medium text-red-300 ring-1 ring-red-400/30 transition-colors hover:bg-red-500/10"
                    >
                        Clear all
                    </button>
                )}
            </div>
            <div className={grid.compact}>
                {allParticles.map((reward: ParticleSetReward) => {
                    const isEgg = reward.requiredLevel >= EGG_LEVEL
                    const locked = isEgg && !isEggUnlocked(reward.id) ? "Easter egg" : false
                    const isActive = isParticleSetActive(reward.id)
                    const full = activeParticleSets.length >= 3 && !isActive
                    return (
                        <ShopCard
                            key={reward.id}
                            isActive={isActive}
                            locked={locked}
                            disabled={full}
                            egg={isEgg}
                            onClick={() => toggleParticleSet(reward.id)}
                            className="items-center text-center"
                        >
                            <div className="py-1 text-3xl">{reward.previewEmoji}</div>
                            <p className="text-xs font-semibold leading-tight">{reward.name}</p>
                            <p className="text-[11px] text-[--muted] leading-snug line-clamp-2">{reward.description}</p>
                        </ShopCard>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Cursors (free) ───────────────────────────────────────────────────────────

// Cursors are grouped by the collection they belong to; the ranges are where each sits in the set.
const CURSOR_COLLECTIONS: { id: string, label: string, min: number, max: number }[] = [
    { id: "basic", label: "Basic", min: 1, max: 30 },
    { id: "frost", label: "Frost", min: 31, max: 130 },
    { id: "ember", label: "Ember", min: 131, max: 260 },
    { id: "retro", label: "Retro", min: 261, max: 430 },
    { id: "aurora", label: "Aurora", min: 431, max: 620 },
    { id: "inferno", label: "Inferno", min: 621, max: 850 },
    { id: "mythic", label: "Mythic", min: 851, max: 980 },
    { id: "prismatic", label: "Prismatic", min: 981, max: 1000 },
]

function CursorTab() {
    const { activeCursorId, setActiveCursorId } = useCursor()
    const [collection, setCollection] = React.useState("basic")
    useShopStat(`${ALL_CURSOR_DEFINITIONS.length} cursors`)

    const range = CURSOR_COLLECTIONS.find(c => c.id === collection) ?? CURSOR_COLLECTIONS[0]
    const visible = ALL_CURSOR_DEFINITIONS.filter(c => c.requiredLevel >= range.min && c.requiredLevel <= range.max)

    return (
        <div className="space-y-4">
            <Segmented items={CURSOR_COLLECTIONS} value={collection} onChange={setCollection} />
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-3">
                {visible.map(cursor => (
                    <ShopCard
                        key={cursor.id}
                        isActive={activeCursorId === cursor.id}
                        onClick={() => setActiveCursorId(cursor.id)}
                        className="items-center text-center"
                    >
                        <div className="flex h-14 w-full items-center justify-center rounded-xl bg-black/25">
                            {cursor.icon ? (
                                <img
                                    src={cursor.icon}
                                    alt={cursor.name}
                                    className="size-9 object-contain"
                                    draggable={false}
                                    style={cursor.pack ? { filter: packFilter(cursor.pack) } : undefined}
                                />
                            ) : (
                                <LuMousePointer2 className="text-2xl text-[--muted]" />
                            )}
                        </div>
                        <p className="w-full truncate text-[11px] font-medium leading-tight">{cursor.name}</p>
                    </ShopCard>
                ))}
            </div>
        </div>
    )
}

// ─── Sounds (free) ────────────────────────────────────────────────────────────

function SoundPackTab() {
    const {
        activeSoundPackId, setActiveSoundPackId, soundVolume, setSoundVolume, soundPacks, playSound,
        mutedSoundEvents, setSoundEventMuted,
    } = useSound()
    useShopStat(`${soundPacks.length} sound packs`)

    return (
        <div className="space-y-6">
            <Panel className="flex items-center gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                    <LuVolume2 className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium">Volume</span>
                        <span className="tabular-nums text-[--muted]">{Math.round(soundVolume * 100)}%</span>
                    </div>
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-brand-400" style={{ width: `${soundVolume * 100}%` }} />
                        <input
                            type="range" min={0} max={1} step={0.01} value={soundVolume}
                            aria-label="Sound volume"
                            onChange={e => { setSoundVolume(Number(e.target.value)); playSound("buttonClick") }}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                    </div>
                </div>
            </Panel>

            <div className="space-y-3">
                <GroupLabel>Sound pack</GroupLabel>
                <div className={grid.compact}>
                    {soundPacks.map(pack => {
                        const isActive = activeSoundPackId === pack.id
                        return (
                            <ShopCard
                                key={pack.id}
                                isActive={isActive}
                                onClick={() => { setActiveSoundPackId(pack.id); playSound("itemUnlock") }}
                                className="items-center text-center"
                            >
                                <div className="py-1 text-3xl">{pack.emoji}</div>
                                <p className="text-xs font-semibold leading-tight">{pack.name}</p>
                                <p className="text-[11px] text-[--muted] leading-snug line-clamp-2">{pack.description}</p>
                                {isActive && (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={e => { e.stopPropagation(); playSound("notification") }}
                                        onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); playSound("notification") } }}
                                        className="mx-auto mt-0.5 flex items-center gap-1 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-medium text-brand-200 hover:bg-brand-500/25"
                                    >
                                        <LuPlay className="size-2.5" /> Preview
                                    </span>
                                )}
                            </ShopCard>
                        )
                    })}
                </div>
            </div>

            <div className="space-y-3">
                <GroupLabel hint="Played by your sound pack, on top of clicks and alerts">Sound events</GroupLabel>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {EXTENDED_SOUND_NAMES.map(name => {
                        const on = !mutedSoundEvents.includes(name)
                        return (
                            <div
                                key={name}
                                className={cn(
                                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                                    on ? "border-white/[0.08] bg-white/[0.03]" : "border-white/[0.05] bg-transparent",
                                )}
                            >
                                <span className={cn("text-xs font-medium", !on && "text-[--muted]")}>{EXTENDED_SOUND_LABELS[name]}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        title="Play"
                                        aria-label={`Play ${EXTENDED_SOUND_LABELS[name]}`}
                                        disabled={!on}
                                        onClick={() => playSound(name)}
                                        className="flex size-6 items-center justify-center rounded-full text-[--muted] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                                    >
                                        <LuPlay className="size-3" />
                                    </button>
                                    <ToggleSwitch checked={on} onChange={v => setSoundEventMuted(name, !v)} label={EXTENDED_SOUND_LABELS[name]} />
                                </div>
                            </div>
                        )
                    })}
                </div>
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

// ─── UI Enhancements (free) ───────────────────────────────────────────────────

const UI_TAB_ICONS: Record<string, React.ReactNode> = {
    animations: <LuWand className="size-3" />,
    cards: <LuCreditCard className="size-3" />,
    radius: <LuCircleDot className="size-3" />,
    typography: <LuType className="size-3" />,
    accent: <LuDroplets className="size-3" />,
    effects: <LuSparkles className="size-3" />,
    layout: <LuLayoutDashboard className="size-3" />,
    sidebar: <LuPanelLeft className="size-3" />,
    transitions: <LuChevronsUpDown className="size-3" />,
    scrollbar: <LuSlidersHorizontal className="size-3" />,
    hover: <LuPointer className="size-3" />,
    trail: <LuMousePointer2 className="size-3" />,
    navbar: <LuPanelTop className="size-3" />,
    slider: <LuGauge className="size-3" />,
    toast: <LuBell className="size-3" />,
    selection: <LuHighlighter className="size-3" />,
    badge: <LuTag className="size-3" />,
    idle: <LuMoon className="size-3" />,
}

function UIPresetsGrid({ category }: { category: typeof UI_CUSTOMIZE_CATEGORIES[number] }) {
    const { state, setPreset } = useUICustomize()
    const activeId = state[category.id as UICustomizeCategoryId]

    const renderSwatch = (preset: UIPreset) => {
        switch (category.id) {
            case "animations": return <AnimationPreviewSwatch preset={preset} />
            case "hover": return <HoverPreviewSwatch preset={preset} />
            case "transitions": return <TransitionPreviewSwatch preset={preset} />
            case "effects": return <EffectsPreviewSwatch preset={preset} />
            default: return <UIPreviewSwatch previewCss={preset.previewCss} />
        }
    }

    return (
        <div className={grid.compact}>
            {(category.presets as readonly UIPreset[]).map(preset => (
                <ShopCard
                    key={preset.id}
                    isActive={activeId === preset.id}
                    onClick={() => setPreset(category.id as UICustomizeCategoryId, preset.id)}
                    className="p-2.5"
                >
                    {renderSwatch(preset)}
                    <div className="px-0.5">
                        <p className="pr-6 text-xs font-semibold leading-tight">{preset.name}</p>
                        {preset.description && (
                            <p className="mt-0.5 text-[11px] text-[--muted] leading-snug line-clamp-2">{preset.description}</p>
                        )}
                    </div>
                </ShopCard>
            ))}
        </div>
    )
}

function UIEnhancementsSection() {
    const [activeInner, setActiveInner] = React.useState<string>("animations")
    const activeCategory = UI_CUSTOMIZE_CATEGORIES.find(c => c.id === activeInner) ?? UI_CUSTOMIZE_CATEGORIES[0]
    useShopStat(`${UI_CUSTOMIZE_CATEGORIES.length} categories`)

    return (
        <div className="space-y-4">
            <Segmented
                items={UI_CUSTOMIZE_CATEGORIES.map(c => ({ id: c.id as string, label: c.label, icon: UI_TAB_ICONS[c.id] }))}
                value={activeCategory.id}
                onChange={setActiveInner}
            />
            {activeCategory.id === "transitions"
                ? <PageTransitionControls />
                : <UIPresetsGrid category={activeCategory} />}
        </div>
    )
}

// ─── Shop ─────────────────────────────────────────────────────────────────────

type SectionId =
    | "titles" | "themes" | "xpbars" | "namecolors" | "borders" | "backgrounds" | "profilestyle"
    | "enhancements" | "particles" | "cursors" | "sounds" | "ost"

type SectionDef = {
    id: SectionId
    group: "profile" | "interface"
    label: string
    description: string
    icon: React.ElementType
    render: (currentLevel: number) => React.ReactNode
}

const SECTIONS: SectionDef[] = [
    { id: "titles", group: "profile", label: "Titles", icon: LuTag, description: "A line under your name.", render: l => <TitlesTab currentLevel={l} /> },
    { id: "themes", group: "profile", label: "Themes", icon: LuPalette, description: "Restyle the whole app.", render: () => <ThemesTab /> },
    { id: "xpbars", group: "profile", label: "XP Bars", icon: LuZap, description: "How your level bar fills.", render: l => <XPBarsTab currentLevel={l} /> },
    { id: "namecolors", group: "profile", label: "Name Colors", icon: LuType, description: "The colour of your name, and its shine.", render: l => <NameColorsTab currentLevel={l} /> },
    { id: "borders", group: "profile", label: "Avatar Borders", icon: LuFrame, description: "A frame around your avatar.", render: l => <BordersTab currentLevel={l} /> },
    { id: "backgrounds", group: "profile", label: "Header Backgrounds", icon: LuImage, description: "Behind your profile header.", render: l => <BackgroundsTab currentLevel={l} /> },
    { id: "profilestyle", group: "profile", label: "Profile Style", icon: LuLayoutDashboard, description: "Frames, overlays and layout for your profile.", render: l => <ProfileStyleTab currentLevel={l} /> },
    { id: "enhancements", group: "interface", label: "Enhancements", icon: LuWand, description: "Motion, shape, colour and feel of the interface.", render: () => <UIEnhancementsSection /> },
    { id: "particles", group: "interface", label: "Particles", icon: LuSparkles, description: "Ambient particles drifting over the app.", render: () => <ParticlesTab /> },
    { id: "cursors", group: "interface", label: "Cursors", icon: LuMousePointer2, description: "Your mouse pointer.", render: () => <CursorTab /> },
    { id: "sounds", group: "interface", label: "Sounds", icon: LuVolume2, description: "Interface sounds, and which events play them.", render: () => <SoundPackTab /> },
    { id: "ost", group: "interface", label: "Theme OST", icon: LuMusic, description: "Music from your theme.", render: () => <ThemeOstMiniPlayer /> },
]

const GROUPS: { id: SectionDef["group"], label: string, note?: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "interface", label: "Interface", note: "Free" },
]

function NavButton({ section, active, onSelect }: { section: SectionDef, active: boolean, onSelect: () => void }) {
    const Icon = section.icon
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-current={active ? "page" : undefined}
            className={cn(
                "group relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-left text-sm transition-all duration-150",
                active
                    ? "bg-white/[0.07] text-white ring-1 ring-white/[0.08]"
                    : "text-[--muted] hover:bg-white/[0.04] hover:text-white",
            )}
        >
            {active && <span className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand-400 md:block" />}
            <span
                className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                    active ? "bg-brand-500/20 text-brand-200" : "bg-white/[0.04] text-[--muted] group-hover:text-white",
                )}
            >
                <Icon className="size-3.5" />
            </span>
            <span className="font-medium">{section.label}</span>
        </button>
    )
}

/**
 * The Reward Shop. `variant="modal"` fills its container and scrolls the content pane on its own
 * (the floating shop button's sheet); `inline` sits in a page and grows with its content.
 */
export function RewardShop({ currentLevel, variant = "inline" }: { currentLevel: number, variant?: "modal" | "inline" }) {
    const [activeId, setActiveId] = React.useState<SectionId>("titles")
    const [stat, setStat] = React.useState<string | null>(null)
    const contentRef = React.useRef<HTMLDivElement>(null)
    const active = SECTIONS.find(s => s.id === activeId) ?? SECTIONS[0]
    const ActiveIcon = active.icon
    const isModal = variant === "modal"

    const select = (id: SectionId) => {
        if (id === activeId) return
        setStat(null)
        setActiveId(id)
        contentRef.current?.scrollTo({ top: 0 })
    }

    return (
        <ShopStatContext.Provider value={setStat}>
            <div
                className={cn(
                    "flex flex-col md:flex-row",
                    isModal
                        ? "h-full min-h-0"
                        : "min-h-[560px] overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015]",
                )}
            >
                {/* Navigation: a side list on desktop, a scrolling row on phones */}
                <nav
                    aria-label="Reward shop sections"
                    className={cn(
                        "flex shrink-0 gap-1 overflow-x-auto border-b border-white/[0.06] p-2 hide-scrollbar",
                        "md:w-60 md:flex-col md:gap-0.5 md:overflow-x-visible md:overflow-y-auto md:border-b-0 md:border-r md:p-3",
                    )}
                >
                    {GROUPS.map((group, gi) => (
                        <React.Fragment key={group.id}>
                            <div className={cn("hidden items-center justify-between px-2.5 pb-1.5 md:flex", gi > 0 ? "pt-5" : "pt-1")}>
                                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[--muted]">{group.label}</span>
                                {group.note && (
                                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/25">
                                        {group.note}
                                    </span>
                                )}
                            </div>
                            {gi > 0 && <span className="mx-1 w-px shrink-0 self-stretch bg-white/[0.08] md:hidden" />}
                            {SECTIONS.filter(s => s.group === group.id).map(section => (
                                <NavButton key={section.id} section={section} active={section.id === activeId} onSelect={() => select(section.id)} />
                            ))}
                        </React.Fragment>
                    ))}
                </nav>

                {/* Content */}
                <div ref={contentRef} className={cn("relative min-w-0 flex-1", isModal && "min-h-0 overflow-y-auto")}>
                    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.06] bg-[--background]/80 px-4 py-3.5 backdrop-blur-xl sm:px-6">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400/25 to-brand-600/10 text-brand-200 ring-1 ring-brand-400/20">
                            <ActiveIcon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-semibold leading-tight">{active.label}</h3>
                            <p className="truncate text-xs text-[--muted]">{active.description}</p>
                        </div>
                        {stat && (
                            <span className="hidden shrink-0 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium tabular-nums text-white/75 ring-1 ring-white/[0.08] sm:inline">
                                {stat}
                            </span>
                        )}
                    </div>
                    <div key={active.id} className="animate-in fade-in-0 slide-in-from-bottom-1 p-4 duration-200 sm:p-6">
                        {active.render(currentLevel)}
                    </div>
                </div>
            </div>
        </ShopStatContext.Provider>
    )
}
