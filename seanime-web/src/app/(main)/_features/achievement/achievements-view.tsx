"use client"

import {
    Achievement_CategoryInfo,
    Achievement_Definition,
    Achievement_Difficulty,
    Achievement_Entry,
    Achievement_ListResponse,
} from "@/api/generated/types"
import { AchievementShowcase } from "@/app/(main)/_features/achievement/achievement-showcase"
import { cn } from "@/components/ui/core/styling"
import { formatNumber } from "@/lib/helpers/number"
import { useAnimeTheme } from "@/lib/theme/anime-themes/anime-theme-provider"
import React from "react"
import { LuCheck, LuClock, LuCrown, LuFlame, LuLock, LuRotateCcw, LuSearch, LuSparkles, LuTrophy, LuX } from "react-icons/lu"

// One achievements view for the dedicated page, your profile and other people's profiles.

// ─── Model ───────────────────────────────────────────────────────────────────────────────────

type Medium = "anime" | "manga" | "meta"

type AchievementState = {
    def: Achievement_Definition
    name: string
    medium: Medium
    oneTime: boolean
    maxTier: number
    /** Highest unlocked tier (one-time: 1 when unlocked). */
    tier: number
    unlocked: boolean
    maxed: boolean
    /** The tier being worked towards (tiered only). */
    nextTier: number
    progress: number
    target: number
    /** 0–1 towards the next tier (or 1 when maxed / unlocked). */
    fraction: number
    lastUnlockedAt: Date | null
    xpEarned: number
    xpNext: number
}

const DIFFICULTY_MULT: Record<Achievement_Difficulty, number> = { easy: 1, medium: 1.5, hard: 2.5, extreme: 5 }
const TIER_XP = [0, 50, 100, 200, 400, 800, 1200, 1800, 2500, 3500, 5000]
const NO_XP = new Set(["a_ptw_hoarder", "m_ptr_hoarder", "a_from_ptw", "m_from_ptr"])

/** XP for one unlock, as the server computes it (achievement.RecalculateXP). */
function xpFor(def: Achievement_Definition, tier: number): number {
    if (NO_XP.has(def.Key)) return 0
    const base = def.XPReward > 0 ? def.XPReward : tier === 0 ? 150 : (TIER_XP[tier] ?? 0)
    return Math.round(base * (DIFFICULTY_MULT[def.Difficulty] ?? 1))
}

function mediumOf(category: string): Medium {
    if (category.endsWith("_meta")) return "meta"
    return category.startsWith("manga") ? "manga" : "anime"
}

function buildStates(data: Achievement_ListResponse, names: Record<string, string>): AchievementState[] {
    const entries = new Map<string, Achievement_Entry>()
    for (const a of data.achievements ?? []) entries.set(`${a.key}:${a.tier}`, a)

    return (data.definitions ?? []).map(def => {
        const maxTier = def.MaxTier || 0
        const oneTime = maxTier === 0
        const name = names[def.Key] ?? def.Name
        if (oneTime) {
            const e = entries.get(`${def.Key}:0`)
            const unlocked = !!e?.isUnlocked
            return {
                def, name, medium: mediumOf(def.Category), oneTime, maxTier: 1, tier: unlocked ? 1 : 0, unlocked, maxed: unlocked,
                nextTier: 1, progress: unlocked ? 1 : 0, target: 1, fraction: unlocked ? 1 : 0,
                lastUnlockedAt: unlocked && e?.unlockedAt ? new Date(e.unlockedAt) : null,
                xpEarned: unlocked ? xpFor(def, 0) : 0, xpNext: unlocked ? 0 : xpFor(def, 0),
            }
        }
        let tier = 0
        let last: Date | null = null
        let xpEarned = 0
        for (let t = 1; t <= maxTier; t++) {
            const e = entries.get(`${def.Key}:${t}`)
            if (e?.isUnlocked) {
                tier = t
                xpEarned += xpFor(def, t)
                if (e.unlockedAt) {
                    const d = new Date(e.unlockedAt)
                    if (!last || d > last) last = d
                }
            }
        }
        const maxed = tier >= maxTier
        const nextTier = Math.min(tier + 1, maxTier)
        const target = def.TierThresholds?.[nextTier - 1] ?? 0
        const progress = Math.max(0, entries.get(`${def.Key}:${nextTier}`)?.progress ?? 0)
        const fraction = maxed ? 1 : target > 0 ? Math.min(1, progress / target) : 0
        return {
            def, name, medium: mediumOf(def.Category), oneTime, maxTier, tier, unlocked: tier > 0, maxed,
            nextTier, progress, target, fraction, lastUnlockedAt: last,
            xpEarned, xpNext: maxed ? 0 : xpFor(def, nextTier),
        }
    })
}

function describe(def: Achievement_Definition, tier: number): React.ReactNode {
    const desc = def.Description
    if (!desc.includes("{threshold}") || !def.TierThresholds?.length) return desc
    const value = def.TierThresholds[Math.min(Math.max(tier, 1), def.TierThresholds.length) - 1]
    const [before, after] = desc.split("{threshold}")
    return <>{before}<span className="font-semibold text-white/90">{formatNumber(value)}</span>{after}</>
}

function timeAgo(d: Date): string {
    const mins = Math.floor((Date.now() - d.getTime()) / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(months / 12)}y ago`
}

// ─── Look ────────────────────────────────────────────────────────────────────────────────────

const DIFFICULTY_STYLE: Record<Achievement_Difficulty, { label: string, chip: string, bar: string }> = {
    easy: { label: "Easy", chip: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/25", bar: "bg-emerald-400" },
    medium: { label: "Medium", chip: "text-sky-300 bg-sky-400/10 ring-sky-400/25", bar: "bg-sky-400" },
    hard: { label: "Hard", chip: "text-orange-300 bg-orange-400/10 ring-orange-400/25", bar: "bg-orange-400" },
    extreme: { label: "Extreme", chip: "text-fuchsia-300 bg-fuchsia-400/10 ring-fuchsia-400/30", bar: "bg-fuchsia-400" },
}
const DIFFICULTIES: Achievement_Difficulty[] = ["easy", "medium", "hard", "extreme"]

const GOLD = "bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600"
const PRISM = "bg-[conic-gradient(from_200deg,#f472b6,#fbbf24,#34d399,#60a5fa,#a78bfa,#f472b6)]"

function AchievementBadge({ s, size = "md" }: { s: AchievementState, size?: "sm" | "md" | "lg" }) {
    const dims = size === "lg" ? "size-14 rounded-2xl [&_svg]:size-7" : size === "sm" ? "size-9 rounded-xl [&_svg]:size-4" : "size-12 rounded-2xl [&_svg]:size-6"
    const prismatic = s.maxed && !s.oneTime
    return (
        <div className={cn("relative shrink-0 p-[1.5px]", dims.split(" ").filter(c => c.startsWith("rounded")).join(" "),
            prismatic ? PRISM : s.unlocked ? GOLD : s.fraction > 0 ? "bg-brand-400/40" : "bg-white/[0.08]",
            (s.unlocked || prismatic) && "shadow-[0_6px_22px_-8px_rgba(251,191,36,0.55)]",
        )}>
            <div
                className={cn(
                    "flex h-full w-full items-center justify-center",
                    dims,
                    s.unlocked ? "bg-gradient-to-br from-zinc-900 to-black text-amber-300" : "bg-zinc-950 text-white/30",
                    prismatic && "text-white",
                )}
                dangerouslySetInnerHTML={{ __html: s.def.IconSVG ?? "" }}
            />
            {!s.unlocked && s.fraction === 0 && (
                <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-white/10">
                    <LuLock className="size-2.5 text-white/50" />
                </span>
            )}
            {s.maxed && (
                <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-400 text-black ring-2 ring-zinc-950">
                    {prismatic ? <LuCrown className="size-2.5" /> : <LuCheck className="size-2.5" strokeWidth={3} />}
                </span>
            )}
        </div>
    )
}

function DifficultyChip({ d }: { d: Achievement_Difficulty }) {
    const st = DIFFICULTY_STYLE[d] ?? DIFFICULTY_STYLE.easy
    return <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1", st.chip)}>{st.label}</span>
}

function TierTrack({ s }: { s: AchievementState }) {
    return (
        <div className="flex gap-[3px]">
            {Array.from({ length: s.maxTier }, (_, i) => {
                const t = i + 1
                const fill = t <= s.tier ? 1 : t === s.nextTier ? s.fraction : 0
                return (
                    <div key={t} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]" title={s.def.TierNames?.[i] ?? `Tier ${t}`}>
                        <div
                            className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700", t <= s.tier ? (s.maxed ? PRISM : "bg-amber-400") : "bg-brand-400")}
                            style={{ width: `${fill * 100}%` }}
                        />
                    </div>
                )
            })}
        </div>
    )
}

function AchievementCard({ s }: { s: AchievementState }) {
    const tierName = (t: number) => s.def.TierNames?.[t - 1] ?? `Tier ${t}`
    return (
        <div
            className={cn(
                "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5",
                s.maxed && !s.oneTime
                    ? "border-amber-300/30 bg-gradient-to-br from-amber-300/[0.08] via-white/[0.02] to-fuchsia-400/[0.06] hover:border-amber-300/50"
                    : s.unlocked
                        ? "border-amber-300/20 bg-gradient-to-br from-amber-300/[0.06] to-white/[0.015] hover:border-amber-300/40"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.035]",
            )}
        >
            {s.unlocked && <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-amber-300/10 blur-2xl" />}
            <div className="relative flex items-start gap-3">
                <AchievementBadge s={s} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-sm font-semibold leading-tight", !s.unlocked && "text-white/75")}>{s.name}</p>
                        <DifficultyChip d={s.def.Difficulty} />
                    </div>
                    <p className="mt-1 text-xs leading-snug text-[--muted]">{describe(s.def, s.oneTime ? 1 : s.nextTier)}</p>
                </div>
            </div>

            {!s.oneTime && (
                <div className="relative space-y-1.5">
                    <TierTrack s={s} />
                    <div className="flex items-center justify-between text-[11px] text-[--muted]">
                        <span>
                            {s.maxed
                                ? <span className="font-medium text-amber-200">All {s.maxTier} tiers</span>
                                : s.tier > 0
                                    ? <><span className="font-medium text-amber-200">{tierName(s.tier)}</span> → {tierName(s.nextTier)}</>
                                    : <>Next: {tierName(s.nextTier)}</>}
                        </span>
                        {!s.maxed && s.target > 0 && (
                            <span className="tabular-nums">{formatNumber(Math.floor(s.progress))} / {formatNumber(s.target)}</span>
                        )}
                    </div>
                </div>
            )}

            <div className="relative mt-auto flex items-center justify-between text-[11px]">
                {s.lastUnlockedAt
                    ? <span className="flex items-center gap-1 text-amber-200/80"><LuCheck className="size-3" /> {s.lastUnlockedAt.toLocaleDateString()}</span>
                    : <span className="text-[--muted]">{s.oneTime ? "Locked" : s.fraction > 0 ? `${Math.floor(s.fraction * 100)}% to next tier` : "Not started"}</span>}
                <span className={cn("tabular-nums font-medium", s.unlocked ? "text-amber-200/90" : "text-[--muted]")}>
                    {s.maxed ? `${formatNumber(s.xpEarned)} XP` : `+${formatNumber(s.xpNext)} XP`}
                </span>
            </div>
        </div>
    )
}

function CompletionRing({ value, size = 112 }: { value: number, size?: number }) {
    const stroke = 9
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const id = React.useId().replace(/:/g, "")
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <defs>
                    <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#fde68a" />
                        <stop offset="55%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="rgb(var(--color-brand-400))" />
                    </linearGradient>
                </defs>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#ring-${id})`} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c - (Math.min(100, value) / 100) * c}
                    className="transition-[stroke-dashoffset] duration-1000 ease-out drop-shadow-[0_0_8px_rgba(251,191,36,0.45)]"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums leading-none">{value < 10 && value > 0 ? value.toFixed(1) : Math.floor(value)}%</span>
                <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[--muted]">complete</span>
            </div>
        </div>
    )
}

// ─── View ────────────────────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "unlocked" | "progress" | "locked"
type SortMode = "category" | "closest" | "recent" | "difficulty"

const STATUS: { id: StatusFilter, label: string }[] = [
    { id: "all", label: "All" },
    { id: "unlocked", label: "Unlocked" },
    { id: "progress", label: "In progress" },
    { id: "locked", label: "Locked" },
]
const SORTS: { id: SortMode, label: string }[] = [
    { id: "category", label: "By category" },
    { id: "closest", label: "Closest to unlocking" },
    { id: "recent", label: "Recently unlocked" },
    { id: "difficulty", label: "Hardest first" },
]
const MEDIA: { id: Medium | "all", label: string }[] = [
    { id: "all", label: "Everything" },
    { id: "anime", label: "Anime" },
    { id: "manga", label: "Manga" },
    { id: "meta", label: "Meta" },
]

export type AchievementsViewProps = {
    data: Achievement_ListResponse
    /** "page" is the dedicated page; "profile" sits inside a profile tab. */
    variant?: "page" | "profile"
    /** Whose achievements: shows the showcase editor and reset when they're yours. */
    own?: boolean
    ownerName?: string
    onReset?: () => void
    resetting?: boolean
}

export function AchievementsView({ data, variant = "page", own = false, ownerName, onReset, resetting }: AchievementsViewProps) {
    const { config } = useAnimeTheme()
    const states = React.useMemo(() => buildStates(data, config.achievementNames ?? {}), [data, config.achievementNames])
    const categories = data.categories ?? []
    const catInfo = React.useMemo(() => new Map(categories.map(c => [c.Key as string, c])), [categories])

    const [query, setQuery] = React.useState("")
    const [status, setStatus] = React.useState<StatusFilter>("all")
    const [medium, setMedium] = React.useState<Medium | "all">("all")
    const [category, setCategory] = React.useState<string>("all")
    const [difficulty, setDifficulty] = React.useState<Achievement_Difficulty | "all">("all")
    const [sort, setSort] = React.useState<SortMode>("category")

    // ── Summary
    const summary = React.useMemo(() => {
        const unlocked = states.filter(s => s.unlocked).length
        const maxed = states.filter(s => s.maxed && !s.oneTime).length
        const xp = states.reduce((t, s) => t + s.xpEarned, 0)
        const tierRows = states.reduce((t, s) => t + (s.oneTime ? (s.unlocked ? 1 : 0) : s.tier), 0)
        const tierTotal = states.reduce((t, s) => t + (s.oneTime ? 1 : s.maxTier), 0)
        const byDifficulty = DIFFICULTIES.map(d => {
            const all = states.filter(s => s.def.Difficulty === d)
            return { d, total: all.length, unlocked: all.filter(s => s.unlocked).length }
        })
        const recent = states.filter(s => s.lastUnlockedAt).sort((a, b) => b.lastUnlockedAt!.getTime() - a.lastUnlockedAt!.getTime()).slice(0, 8)
        const closest = states.filter(s => !s.maxed && s.fraction > 0 && s.fraction < 1).sort((a, b) => b.fraction - a.fraction).slice(0, 6)
        return { unlocked, maxed, xp, tierRows, tierTotal, byDifficulty, recent, closest }
    }, [states])
    const pct = summary.tierTotal > 0 ? (summary.tierRows / summary.tierTotal) * 100 : 0

    // ── Filtering
    const q = query.trim().toLowerCase()
    const visible = React.useMemo(() => {
        let list = states.filter(s => {
            if (medium !== "all" && s.medium !== medium) return false
            if (category !== "all" && s.def.Category !== category) return false
            if (difficulty !== "all" && s.def.Difficulty !== difficulty) return false
            if (status === "unlocked" && !s.unlocked) return false
            if (status === "locked" && (s.unlocked || s.fraction > 0)) return false
            if (status === "progress" && (s.maxed || (s.fraction === 0 && !s.unlocked) || (s.oneTime && s.unlocked))) return false
            if (q && !s.name.toLowerCase().includes(q) && !s.def.Description.toLowerCase().includes(q)) return false
            return true
        })
        if (sort === "closest") list = [...list].sort((a, b) => Number(a.maxed) - Number(b.maxed) || b.fraction - a.fraction)
        if (sort === "recent") list = [...list].sort((a, b) => (b.lastUnlockedAt?.getTime() ?? 0) - (a.lastUnlockedAt?.getTime() ?? 0))
        if (sort === "difficulty") list = [...list].sort((a, b) => DIFFICULTIES.indexOf(b.def.Difficulty) - DIFFICULTIES.indexOf(a.def.Difficulty))
        return list
    }, [states, medium, category, difficulty, status, q, sort])

    const groups = React.useMemo(() => {
        if (sort !== "category") return [{ key: "__flat", info: undefined as Achievement_CategoryInfo | undefined, items: visible }]
        const map = new Map<string, AchievementState[]>()
        for (const s of visible) {
            const list = map.get(s.def.Category) ?? []
            list.push(s)
            map.set(s.def.Category, list)
        }
        return Array.from(map.entries()).map(([key, items]) => ({ key, info: catInfo.get(key), items }))
    }, [visible, sort, catInfo])

    const categoryCounts = React.useMemo(() => {
        const out = new Map<string, { total: number, unlocked: number }>()
        for (const s of states) {
            const c = out.get(s.def.Category) ?? { total: 0, unlocked: 0 }
            c.total++
            if (s.unlocked) c.unlocked++
            out.set(s.def.Category, c)
        }
        return out
    }, [states])
    const categoriesShown = categories.filter(c => medium === "all" || mediumOf(c.Key) === medium)

    const filtersActive = q || status !== "all" || medium !== "all" || category !== "all" || difficulty !== "all"
    const clearFilters = () => {
        setQuery(""); setStatus("all"); setMedium("all"); setCategory("all"); setDifficulty("all")
    }

    const isPage = variant === "page"

    return (
        <div className="space-y-6">
            {/* ── Hero ───────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-black/30 to-black/50 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7">
                <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-amber-400/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-32 right-0 size-80 rounded-full bg-brand-500/15 blur-3xl" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-5">
                        <CompletionRing value={pct} size={isPage ? 124 : 104} />
                        <div className="min-w-0">
                            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
                                <LuTrophy className="size-3.5" /> {own ? "Your achievements" : ownerName ? `${ownerName}'s achievements` : "Achievements"}
                            </p>
                            <h2 className={cn("mt-1 font-bold tracking-tight", isPage ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl")}>
                                {formatNumber(summary.unlocked)}
                                <span className="text-white/35"> / {formatNumber(states.length)}</span>
                            </h2>
                            <p className="mt-0.5 text-sm text-[--muted]">achievements unlocked · {formatNumber(summary.tierRows)} of {formatNumber(summary.tierTotal)} tiers</p>
                        </div>
                    </div>

                    <div className="grid flex-1 grid-cols-3 gap-3 lg:ml-auto lg:max-w-md">
                        <HeroStat icon={<LuSparkles />} label="XP earned" value={formatNumber(summary.xp)} />
                        <HeroStat icon={<LuCrown />} label="Fully maxed" value={formatNumber(summary.maxed)} />
                        <HeroStat icon={<LuFlame />} label="Extreme" value={`${summary.byDifficulty[3].unlocked}/${summary.byDifficulty[3].total}`} />
                    </div>
                </div>

                {/* Difficulty breakdown */}
                <div className="relative mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                    {summary.byDifficulty.map(({ d, total, unlocked }) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDifficulty(difficulty === d ? "all" : d)}
                            className={cn("group text-left", difficulty !== "all" && difficulty !== d && "opacity-50")}
                        >
                            <div className="mb-1.5 flex items-baseline justify-between text-xs">
                                <span className="font-medium text-white/80 group-hover:text-white">{DIFFICULTY_STYLE[d].label}</span>
                                <span className="tabular-nums text-[--muted]">{unlocked}/{total}</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                                <div className={cn("h-full rounded-full transition-[width] duration-700", DIFFICULTY_STYLE[d].bar)} style={{ width: `${total ? (unlocked / total) * 100 : 0}%` }} />
                            </div>
                        </button>
                    ))}
                </div>

                {own && onReset && (
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={resetting}
                        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-white/40 ring-1 ring-white/10 transition-colors hover:bg-red-500/10 hover:text-red-300 hover:ring-red-400/30 disabled:opacity-40"
                    >
                        <LuRotateCcw className={cn("size-3", resetting && "animate-spin")} /> Reset
                    </button>
                )}
            </section>

            {own && <AchievementShowcase />}

            {/* ── Recent & almost there ─────────────────────────────────── */}
            {(summary.recent.length > 0 || summary.closest.length > 0) && (
                <div className="grid gap-4 xl:grid-cols-2">
                    {summary.recent.length > 0 && (
                        <Strip title="Recently unlocked" icon={<LuClock />}>
                            {summary.recent.map(s => (
                                <div key={s.def.Key} className="flex w-56 shrink-0 items-center gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-2.5">
                                    <AchievementBadge s={s} size="sm" />
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold">{s.name}</p>
                                        <p className="text-[11px] text-[--muted]">
                                            {!s.oneTime && <span className="text-amber-200/80">{s.def.TierNames?.[s.tier - 1] ?? `Tier ${s.tier}`} · </span>}
                                            {timeAgo(s.lastUnlockedAt!)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </Strip>
                    )}
                    {summary.closest.length > 0 && (
                        <Strip title="Almost there" icon={<LuFlame />}>
                            {summary.closest.map(s => (
                                <div key={s.def.Key} className="w-56 shrink-0 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-2.5 backdrop-blur-md">
                                    <div className="flex items-center gap-3">
                                        <AchievementBadge s={s} size="sm" />
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-semibold">{s.name}</p>
                                            <p className="text-[11px] tabular-nums text-[--muted]">{formatNumber(Math.floor(s.progress))} / {formatNumber(s.target)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300" style={{ width: `${s.fraction * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </Strip>
                    )}
                </div>
            )}

            {/* ── Filters ──────────────────────────────────────────────── */}
            <div className={cn(
                "z-20 space-y-3 rounded-2xl border border-white/[0.07] bg-[--background]/75 p-3 backdrop-blur-xl",
                isPage && "sticky top-2",
            )}>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] flex-1">
                        <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[--muted]" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search achievements…"
                            className="h-9 w-full rounded-xl border border-white/[0.08] bg-black/30 pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-[--muted] focus:border-brand-400/50"
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[--muted] hover:text-white" aria-label="Clear search">
                                <LuX className="size-3.5" />
                            </button>
                        )}
                    </div>
                    <Segmented items={STATUS} value={status} onChange={setStatus} />
                    <select
                        value={sort}
                        onChange={e => setSort(e.target.value as SortMode)}
                        className="h-9 rounded-xl border border-white/[0.08] bg-black/30 px-3 text-xs font-medium outline-none focus:border-brand-400/50"
                        aria-label="Sort"
                    >
                        {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented items={MEDIA} value={medium} onChange={v => { setMedium(v); setCategory("all") }} />
                    <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
                        <CategoryChip label="All categories" active={category === "all"} onClick={() => setCategory("all")} />
                        {categoriesShown.map(c => {
                            const n = categoryCounts.get(c.Key)
                            return (
                                <CategoryChip
                                    key={c.Key}
                                    label={c.Name}
                                    svg={c.IconSVG}
                                    count={n ? `${n.unlocked}/${n.total}` : undefined}
                                    done={!!n && n.unlocked === n.total}
                                    active={category === c.Key}
                                    onClick={() => setCategory(category === c.Key ? "all" : c.Key)}
                                />
                            )
                        })}
                    </div>
                </div>
                {filtersActive && (
                    <div className="flex items-center justify-between text-xs text-[--muted]">
                        <span>{formatNumber(visible.length)} shown</span>
                        <button type="button" onClick={clearFilters} className="font-medium text-brand-300 hover:text-brand-200">Clear filters</button>
                    </div>
                )}
            </div>

            {/* ── Grid ─────────────────────────────────────────────────── */}
            {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-white/10 py-16 text-center">
                    <LuSearch className="size-6 text-[--muted]" />
                    <p className="text-sm font-medium">Nothing matches</p>
                    <button type="button" onClick={clearFilters} className="text-xs text-brand-300 hover:text-brand-200">Clear filters</button>
                </div>
            ) : (
                <div className="space-y-8">
                    {groups.map(g => {
                        const n = categoryCounts.get(g.key)
                        return (
                            <section key={g.key} className="space-y-3 [content-visibility:auto] [contain-intrinsic-size:auto_900px]">
                                {g.info && (
                                    <div className="flex items-center gap-3">
                                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-white/70 ring-1 ring-white/[0.08] [&>svg]:size-4" dangerouslySetInnerHTML={{ __html: g.info.IconSVG }} />
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-base font-semibold leading-tight">{g.info.Name}</h3>
                                            <p className="truncate text-xs text-[--muted]">{g.info.Description}</p>
                                        </div>
                                        {n && (
                                            <div className="hidden w-40 shrink-0 sm:block">
                                                <div className="mb-1 text-right text-[11px] tabular-nums text-[--muted]">{n.unlocked} / {n.total}</div>
                                                <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500" style={{ width: `${(n.unlocked / n.total) * 100}%` }} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className={cn("grid gap-3", isPage ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
                                    {g.items.map(s => <AchievementCard key={s.def.Key} s={s} />)}
                                </div>
                            </section>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

function HeroStat({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
    return (
        <div className="rounded-2xl border border-white/[0.07] bg-black/25 px-3 py-2.5 backdrop-blur-md">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[--muted] [&>svg]:size-3">{icon}{label}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
        </div>
    )
}

function Strip({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
    return (
        <div className="min-w-0 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur-md">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[--muted] [&>svg]:size-3.5">{icon}{title}</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 hide-scrollbar">{children}</div>
        </div>
    )
}

function Segmented<T extends string>({ items, value, onChange }: { items: { id: T, label: string }[], value: T, onChange: (v: T) => void }) {
    return (
        <div className="flex gap-0.5 rounded-xl bg-black/30 p-0.5 ring-1 ring-white/[0.08]">
            {items.map(it => (
                <button
                    key={it.id}
                    type="button"
                    onClick={() => onChange(it.id)}
                    className={cn(
                        "whitespace-nowrap rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all",
                        value === it.id ? "bg-white/[0.1] text-white shadow-sm" : "text-[--muted] hover:text-white",
                    )}
                >
                    {it.label}
                </button>
            ))}
        </div>
    )
}

function CategoryChip({ label, svg, count, done, active, onClick }: {
    label: string
    svg?: string
    count?: string
    done?: boolean
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-all",
                active ? "bg-brand-500/20 text-white ring-brand-400/50" : "bg-white/[0.03] text-[--muted] ring-white/[0.07] hover:text-white hover:ring-white/15",
            )}
        >
            {svg && <span className="[&>svg]:size-3.5" dangerouslySetInnerHTML={{ __html: svg }} />}
            {label}
            {count && <span className={cn("tabular-nums", done ? "text-amber-300" : "text-white/40")}>{count}</span>}
        </button>
    )
}
