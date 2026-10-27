"use client"

import { cn } from "@/components/ui/core/styling"
import { EASTER_EGG_DEFINITIONS } from "@/lib/easter-eggs/easter-egg-definitions"
import { useEasterEggs } from "@/lib/easter-eggs/easter-egg-engine"
import { formatNumber } from "@/lib/helpers/number"
import React from "react"
import { LuEgg, LuLightbulb, LuLock, LuPartyPopper, LuSparkles } from "react-icons/lu"

// Profile → Secrets: the easter eggs found so far and hints for the rest, on dark glass.

type Filter = "all" | "found" | "hidden"

export function EasterEggSecrets() {
    const { discovered } = useEasterEggs()
    const [filter, setFilter] = React.useState<Filter>("all")

    const total = EASTER_EGG_DEFINITIONS.length
    const found = EASTER_EGG_DEFINITIONS.filter(e => discovered.has(e.id))
    const hidden = EASTER_EGG_DEFINITIONS.filter(e => !discovered.has(e.id))
    const xp = found.reduce((n, e) => n + e.xp, 0)
    const totalXp = EASTER_EGG_DEFINITIONS.reduce((n, e) => n + e.xp, 0)
    const pct = total > 0 ? (found.length / total) * 100 : 0
    const complete = total > 0 && found.length === total

    const shownFound = filter === "hidden" ? [] : found
    const shownHidden = filter === "found" ? [] : hidden

    return (
        <div className="space-y-6">
            {/* Hero */}
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">
                <div className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-amber-400/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-28 right-0 size-80 rounded-full bg-fuchsia-500/10 blur-3xl" />
                {!complete && (
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.05)_50%,transparent_70%)] bg-[length:250%_100%] animate-[sea-secrets-shimmer_6s_linear_infinite]" />
                )}
                <style>{`@keyframes sea-secrets-shimmer{from{background-position:150% 0}to{background-position:-100% 0}}`}</style>

                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
                    <EggRing value={pct} complete={complete} />
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                            <LuSparkles className="size-3.5" /> Secret discoveries
                        </p>
                        <h3 className="mt-1 text-3xl font-bold tracking-tight">
                            {formatNumber(found.length)}<span className="text-white/35"> / {formatNumber(total)}</span>
                        </h3>
                        <p className="mt-1 text-sm text-white/60">
                            {complete
                                ? "Every secret in the app is yours."
                                : `${formatNumber(hidden.length)} still hiding somewhere in the app. Each one has a hint below.`}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:w-64">
                        <GlassStat label="XP from secrets" value={`${formatNumber(xp)}`} sub={`of ${formatNumber(totalXp)}`} />
                        <GlassStat label="Still hidden" value={formatNumber(hidden.length)} sub={hidden.length === 1 ? "secret" : "secrets"} />
                    </div>
                </div>

                {complete && (
                    <div className="relative mt-6 flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3 backdrop-blur-md">
                        <LuPartyPopper className="size-5 text-amber-300" />
                        <p className="text-sm font-medium text-amber-100">All secrets found. Nothing left to discover — for now.</p>
                    </div>
                )}
            </section>

            {/* Filters */}
            <div className="flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-black/25 p-1 backdrop-blur-md sm:inline-flex">
                {([
                    ["all", "All", total],
                    ["found", "Found", found.length],
                    ["hidden", "Hidden", hidden.length],
                ] as [Filter, string, number][]).map(([id, label, n]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setFilter(id)}
                        className={cn(
                            "flex items-center gap-2 rounded-xl px-4 py-1.5 text-sm font-medium transition-all",
                            filter === id ? "bg-white/[0.12] text-white shadow-sm ring-1 ring-white/10" : "text-white/55 hover:text-white",
                        )}
                    >
                        {label}
                        <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", filter === id ? "bg-amber-300/20 text-amber-200" : "bg-white/[0.06] text-white/50")}>{n}</span>
                    </button>
                ))}
            </div>

            {/* Found */}
            {shownFound.length > 0 && (
                <section className="space-y-3">
                    <SectionLabel>Found</SectionLabel>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {shownFound.map(egg => (
                            <div
                                key={egg.id}
                                className="group relative flex items-start gap-4 overflow-hidden rounded-2xl border border-amber-300/20 bg-white/[0.04] p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-300/40 hover:shadow-[0_12px_40px_-16px_rgba(251,191,36,0.55)]"
                            >
                                <div className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-amber-300/10 opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                                <span className="relative shrink-0 rounded-2xl bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 p-[1.5px] shadow-[0_6px_20px_-8px_rgba(251,191,36,0.7)]">
                                    <span className="flex size-12 items-center justify-center rounded-[14px] bg-zinc-950/90 text-2xl">{egg.icon}</span>
                                </span>
                                <div className="relative min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-semibold leading-tight text-white">{egg.name}</p>
                                        <span className="shrink-0 rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-300/25">+{formatNumber(egg.xp)} XP</span>
                                    </div>
                                    <p className="mt-1 text-xs leading-relaxed text-white/60">{egg.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Hidden */}
            {shownHidden.length > 0 && (
                <section className="space-y-3">
                    <SectionLabel>Still hidden</SectionLabel>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {shownHidden.map(egg => (
                            <div
                                key={egg.id}
                                className="group relative flex items-start gap-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 p-4 backdrop-blur-md transition-colors duration-300 hover:border-white/15"
                            >
                                <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
                                    <LuEgg className="size-6 text-white/25" />
                                    <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-white/10">
                                        <LuLock className="size-2.5 text-white/50" />
                                    </span>
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="select-none text-sm font-semibold leading-tight text-white/70 blur-[3px]" aria-label="Unknown secret">?????????</p>
                                        <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] font-semibold text-white/45 ring-1 ring-white/10">+{formatNumber(egg.xp)} XP</span>
                                    </div>
                                    <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-white/55">
                                        <LuLightbulb className="mt-0.5 size-3 shrink-0 text-amber-300/70" />
                                        <span><span className="font-semibold text-amber-200/70">Hint </span>{egg.hint}</span>
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

function EggRing({ value, complete }: { value: number, complete: boolean }) {
    const size = 112
    const stroke = 8
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const id = React.useId().replace(/:/g, "")
    return (
        <div className="relative mx-auto shrink-0 sm:mx-0" style={{ width: size, height: size }}>
            <div className="absolute inset-3 rounded-full bg-amber-400/20 blur-xl" />
            <svg width={size} height={size} className="relative -rotate-90">
                <defs>
                    <linearGradient id={`egg-${id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#fef3c7" />
                        <stop offset="50%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                </defs>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#egg-${id})`} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c - (Math.min(100, value) / 100) * c}
                    className="transition-[stroke-dashoffset] duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn("text-4xl drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]", !complete && "animate-[sea-egg-bob_3s_ease-in-out_infinite]")}>🥚</span>
                <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-amber-100/80">{Math.round(value)}%</span>
            </div>
            <style>{`@keyframes sea-egg-bob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-3px) rotate(4deg)}}`}</style>
        </div>
    )
}

function GlassStat({ label, value, sub }: { label: string, value: string, sub?: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 backdrop-blur-md">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{label}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
            {sub && <p className="text-[11px] text-white/40">{sub}</p>}
        </div>
    )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{children}</p>
}
