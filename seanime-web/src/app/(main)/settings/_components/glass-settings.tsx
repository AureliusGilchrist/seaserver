"use client"
import {
    clampGlassBlur,
    clampGlassPercent,
    GLASS_BLUR_DEFAULT,
    GLASS_BLUR_MAX,
    GLASS_OPACITY_DEFAULT,
    GLASS_TINT_DEFAULT,
    GLASS_TINT_PRESETS,
    type GlassGradient,
    type GlassPoint,
    gradientGeometry,
    RECOMMENDED_TINT_END,
    RECOMMENDED_TINT_START,
    useRecommendedTint,
} from "@/app/(main)/_features/glass/glass-variables"
import { cn } from "@/components/ui/core/styling"
import { type ClientSettings, setClientSettings, useClientSettings } from "@/lib/client-settings"
import React from "react"
import { LuArrowLeftRight, LuCheck, LuDroplet, LuEye, LuPalette, LuRotateCcw, LuSparkles, LuWandSparkles } from "react-icons/lu"

type GlassKey = "glassTint" | "glassOpacity" | "glassBlur"
type TintMode = "recommended" | "custom"

function cssGradient(g: GlassGradient, alpha = 1) {
    const { angle, fromPos, toPos } = gradientGeometry(g.start, g.end)
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0")
    return `linear-gradient(${angle}deg, ${g.from}${a} ${fromPos}%, ${g.to}${a} ${toPos}%)`
}

/**
 * Personal -> Display -> Glass. Tint, opacity and blur for every translucent surface in the app,
 * and the one tint gradient they all carry. Each slider starts on "Theme default" and only takes
 * over once moved; the tint colours start on Recommended (the wallpaper's or the theme's colours).
 * The preview follows every change live; the app follows a moment after it stops (one save).
 */
export function GlassSettings() {
    const settings = useClientSettings()
    const recommended = useRecommendedTint()

    const [draft, setDraft] = React.useState<Partial<Record<GlassKey, number>>>({})
    const [tintDraft, setTintDraft] = React.useState<{ mode: TintMode, gradient: GlassGradient | null } | null>(null)
    // Settings changed elsewhere (another device, the row's reset) win over the local draft.
    React.useEffect(() => setDraft({}), [settings.glassTint, settings.glassOpacity, settings.glassBlur])
    const savedGradientKey = JSON.stringify(settings.glassGradient ?? null)
    React.useEffect(() => setTintDraft(null), [settings.glassTintMode, savedGradientKey])

    const commitTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
    const tintTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
    React.useEffect(() => () => {
        clearTimeout(commitTimer.current)
        clearTimeout(tintTimer.current)
    }, [])

    const value = (key: GlassKey): number | undefined => draft[key] ?? settings[key]

    const change = (key: GlassKey, v: number) => {
        setDraft(prev => ({ ...prev, [key]: v }))
        clearTimeout(commitTimer.current)
        commitTimer.current = setTimeout(() => setClientSettings(prev => ({ ...prev, [key]: v })), 250)
    }

    const reset = (keys: (keyof ClientSettings)[]) => {
        clearTimeout(commitTimer.current)
        clearTimeout(tintTimer.current)
        setDraft({})
        setTintDraft(null)
        setClientSettings(prev => {
            const next: ClientSettings = { ...prev }
            keys.forEach(k => delete next[k])
            return next
        })
    }

    // ── Tint colours ──
    const mode: TintMode = tintDraft?.mode ?? settings.glassTintMode ?? "recommended"
    const savedCustom = (tintDraft?.gradient ?? settings.glassGradient) as GlassGradient | undefined
    const recommendedGradient: GlassGradient = { ...recommended, start: RECOMMENDED_TINT_START, end: RECOMMENDED_TINT_END }
    const customGradient: GlassGradient = savedCustom ?? recommendedGradient
    const gradient = mode === "custom" ? customGradient : recommendedGradient

    const commitTint = (nextMode: TintMode, nextGradient: GlassGradient | null, immediate = false) => {
        setTintDraft({ mode: nextMode, gradient: nextGradient })
        clearTimeout(tintTimer.current)
        const write = () => setClientSettings(prev => ({
            ...prev,
            glassTintMode: nextMode,
            ...(nextGradient ? { glassGradient: nextGradient } : {}),
        }))
        if (immediate) write()
        else tintTimer.current = setTimeout(write, 250)
    }
    // Any edit while on Recommended starts a custom gradient from what Recommended shows now.
    const editGradient = (patch: Partial<GlassGradient>) => commitTint("custom", { ...gradient, ...patch })

    const tint = value("glassTint")
    const opacity = value("glassOpacity")
    const blur = value("glassBlur")
    const anySet = tint !== undefined || opacity !== undefined || blur !== undefined || mode === "custom"

    const t = (tint ?? GLASS_TINT_DEFAULT) / 100
    const o = (opacity ?? GLASS_OPACITY_DEFAULT) / 100
    const b = blur ?? GLASS_BLUR_DEFAULT

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-medium">Glass</p>
                    <p className="text-xs text-[--muted]">
                        Tint, opacity and blur for every translucent surface: cards, panels, menus, popups, the sidebar and the top bar.
                        Every one of them carries the same tint colours.
                    </p>
                </div>
                {anySet && (
                    <button
                        type="button"
                        onClick={() => reset(["glassTint", "glassOpacity", "glassBlur", "glassTintMode", "glassGradient"])}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-[--muted] transition-colors hover:text-white"
                    >
                        <LuRotateCcw className="size-3.5" /> Reset all
                    </button>
                )}
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_16rem]">
                <div className="space-y-5">
                    <GlassSlider
                        icon={LuPalette}
                        label="Tint strength"
                        value={tint}
                        fallback={GLASS_TINT_DEFAULT}
                        max={100}
                        format={v => `${v}%`}
                        lowLabel="Neutral"
                        highLabel="Full colour"
                        onChange={v => change("glassTint", clampGlassPercent(v))}
                        onReset={() => reset(["glassTint"])}
                    />
                    <GlassSlider
                        icon={LuDroplet}
                        label="Opacity"
                        value={opacity}
                        fallback={GLASS_OPACITY_DEFAULT}
                        max={100}
                        format={v => `${v}%`}
                        lowLabel="Clear"
                        highLabel="Solid"
                        onChange={v => change("glassOpacity", clampGlassPercent(v))}
                        onReset={() => reset(["glassOpacity"])}
                    />
                    <GlassSlider
                        icon={LuEye}
                        label="Blur strength"
                        value={blur}
                        fallback={GLASS_BLUR_DEFAULT}
                        max={GLASS_BLUR_MAX}
                        format={v => `${v}px`}
                        lowLabel="Sharp"
                        highLabel="Frosted"
                        onChange={v => change("glassBlur", clampGlassBlur(v))}
                        onReset={() => reset(["glassBlur"])}
                    />
                </div>

                {/* Preview: glass panes over a busy backdrop, drawn with the values above. */}
                <div className="relative min-h-[12rem] overflow-hidden rounded-2xl border border-white/[0.06]">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: "radial-gradient(circle at 20% 25%, #f59e0b 0 18%, transparent 19%), radial-gradient(circle at 75% 70%, #ec4899 0 22%, transparent 23%), radial-gradient(circle at 70% 20%, #22d3ee 0 12%, transparent 13%), linear-gradient(135deg, #1e293b, #f8fafc 120%)",
                        }}
                    />
                    <span className="absolute left-3 top-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/80 mix-blend-difference">Preview</span>
                    {[
                        "absolute left-5 right-10 top-9 bottom-14 rounded-xl border border-white/15 p-3",
                        "absolute left-12 right-5 bottom-4 h-12 rounded-xl border border-white/15 px-3 py-2",
                    ].map((cls, i) => (
                        <div
                            key={i}
                            className={cls}
                            style={{
                                backgroundColor: `rgb(12 12 17 / ${o * (1 - t * 0.55)})`,
                                backgroundImage: cssGradient(gradient, Math.min(1, t * 0.4 + o * t * 0.5)),
                                backdropFilter: `blur(${b}px) saturate(1.5)`,
                                WebkitBackdropFilter: `blur(${b}px) saturate(1.5)`,
                            }}
                        >
                            <p className="text-sm font-semibold text-white">{i === 0 ? "Glass panel" : "Menu"}</p>
                            {i === 0 && <p className="mt-1 text-xs text-white/70">Every window gets this same tint.</p>}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Tint colours ── */}
            <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="inline-flex items-center gap-2 text-sm font-medium"><LuSparkles className="size-4 text-[--muted]" /> Tint colours</p>
                        <p className="text-xs text-[--muted]">The colours of the glass, and where its gradient starts and ends. Drag the two points on the canvas.</p>
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <ModeTile
                        active={mode === "recommended"}
                        onClick={() => commitTint("recommended", null, true)}
                        icon={LuWandSparkles}
                        title="Recommended"
                        badge="Auto"
                        description="Follows your wallpaper's colours, or the theme's when there is none."
                        swatch={cssGradient(recommendedGradient)}
                    />
                    <ModeTile
                        active={mode === "custom"}
                        onClick={() => commitTint("custom", customGradient, true)}
                        icon={LuPalette}
                        title="Custom"
                        description="Your own start and end colours and direction."
                        swatch={cssGradient(customGradient)}
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    {GLASS_TINT_PRESETS.map(p => {
                        const active = mode === "custom" && customGradient.from.toLowerCase() === p.from && customGradient.to.toLowerCase() === p.to
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => commitTint("custom", { ...customGradient, from: p.from, to: p.to }, true)}
                                className={cn(
                                    "group inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition-all",
                                    active ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-[--muted] hover:border-white/25 hover:text-white",
                                )}
                            >
                                <span
                                    className="size-5 rounded-full shadow-inner ring-1 ring-white/20 transition-transform group-hover:scale-110"
                                    style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                                />
                                {p.label}
                            </button>
                        )
                    })}
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
                    <GradientPad
                        gradient={gradient}
                        dimmed={mode === "recommended"}
                        onMove={(which, p) => editGradient(which === "start" ? { start: p } : { end: p })}
                    />
                    <div className="space-y-3">
                        <ColorField
                            label="Start colour"
                            point={gradient.start}
                            value={gradient.from}
                            onChange={from => editGradient({ from })}
                        />
                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={() => editGradient({ from: gradient.to, to: gradient.from })}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[0.7rem] text-[--muted] transition-colors hover:border-white/25 hover:text-white"
                            >
                                <LuArrowLeftRight className="size-3.5 rotate-90" /> Swap colours
                            </button>
                        </div>
                        <ColorField
                            label="End colour"
                            point={gradient.end}
                            value={gradient.to}
                            onChange={to => editGradient({ to })}
                        />
                        {mode === "custom" && (
                            <button
                                type="button"
                                onClick={() => editGradient({ start: RECOMMENDED_TINT_START, end: RECOMMENDED_TINT_END })}
                                className="w-full rounded-lg px-3 py-1.5 text-[0.7rem] text-[--muted] transition-colors hover:bg-white/5 hover:text-white"
                            >
                                Reset direction
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function ModeTile({ active, onClick, icon: Icon, title, badge, description, swatch }: {
    active: boolean
    onClick: () => void
    icon: React.ElementType
    title: string
    badge?: string
    description: string
    swatch: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition-all",
                active
                    ? "border-brand-300/50 bg-brand-500/10 shadow-[0_0_0_3px_rgb(var(--color-brand-500)/0.15)]"
                    : "border-white/10 hover:border-white/25 hover:bg-white/[0.03]",
            )}
        >
            <span className="relative size-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/15" style={{ background: swatch }}>
                <Icon className="absolute inset-0 m-auto size-5 text-white drop-shadow" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                    {title}
                    {badge && <span className="rounded-full bg-brand-500/25 px-1.5 py-px text-[0.6rem] font-semibold uppercase tracking-wider text-brand-200">{badge}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-[--muted]">{description}</span>
            </span>
            <span
                className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition-all",
                    active ? "border-transparent bg-brand-500 text-white" : "border-white/20",
                )}
            >
                {active && <LuCheck className="size-3" />}
            </span>
        </button>
    )
}

/** The gradient canvas: two handles, Start and End, dragged to where each colour should sit. */
function GradientPad({ gradient, dimmed, onMove }: {
    gradient: GlassGradient
    dimmed: boolean
    onMove: (which: "start" | "end", p: GlassPoint) => void
}) {
    const ref = React.useRef<HTMLDivElement>(null)
    const dragging = React.useRef<"start" | "end" | null>(null)

    const pointAt = (e: React.PointerEvent): GlassPoint | null => {
        const r = ref.current?.getBoundingClientRect()
        if (!r) return null
        const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)))
        return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) }
    }

    const onPointerDown = (e: React.PointerEvent) => {
        const p = pointAt(e)
        if (!p) return
        const target = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]")?.dataset.handle as "start" | "end" | undefined
        const dist = (q: GlassPoint) => Math.hypot(q.x - p.x, q.y - p.y)
        dragging.current = target ?? (dist(gradient.start) <= dist(gradient.end) ? "start" : "end")
        ref.current?.setPointerCapture(e.pointerId)
        if (!target) onMove(dragging.current, p)
        e.preventDefault()
    }
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragging.current) return
        const p = pointAt(e)
        if (p) onMove(dragging.current, p)
    }
    const onPointerUp = () => {
        dragging.current = null
    }

    const onKey = (which: "start" | "end") => (e: React.KeyboardEvent) => {
        const step = e.shiftKey ? 10 : 2
        const p = which === "start" ? gradient.start : gradient.end
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
        if (!d) return
        e.preventDefault()
        onMove(which, { x: Math.min(100, Math.max(0, p.x + d[0])), y: Math.min(100, Math.max(0, p.y + d[1])) })
    }

    return (
        <div className="space-y-2">
            <div
                ref={ref}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="relative aspect-[16/10] w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl ring-1 ring-white/10"
                style={{
                    backgroundColor: "#0c0c11",
                    backgroundImage: "radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px)",
                    backgroundSize: "14px 14px",
                }}
            >
                <div className={cn("absolute inset-0 transition-opacity", dimmed && "opacity-90")} style={{ background: cssGradient(gradient) }} />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.07] to-transparent" />
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <line
                        x1={gradient.start.x}
                        y1={gradient.start.y}
                        x2={gradient.end.x}
                        y2={gradient.end.y}
                        stroke="#fff"
                        strokeOpacity={0.75}
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>
                <Handle which="start" point={gradient.start} color={gradient.from} onKeyDown={onKey("start")} />
                <Handle which="end" point={gradient.end} color={gradient.to} onKeyDown={onKey("end")} />
            </div>
            <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-[--muted]">
                <span>Drag the points · arrow keys nudge</span>
                <span className="tabular-nums">{Math.round(gradientGeometry(gradient.start, gradient.end).angle)}°</span>
            </div>
        </div>
    )
}

function Handle({ which, point, color, onKeyDown }: { which: "start" | "end", point: GlassPoint, color: string, onKeyDown: (e: React.KeyboardEvent) => void }) {
    const label = which === "start" ? "Start" : "End"
    const below = point.y < 18
    return (
        <button
            type="button"
            data-handle={which}
            aria-label={`${label} point, ${point.x}% across, ${point.y}% down`}
            onKeyDown={onKeyDown}
            className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-grab outline-none active:cursor-grabbing"
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
        >
            <span
                className="block size-6 rounded-full border-[3px] border-[#fff] shadow-[0_2px_10px_rgba(0,0,0,0.45)] transition-transform group-hover:scale-110 group-focus-visible:ring-4 group-focus-visible:ring-white/40 group-active:scale-125"
                style={{ backgroundColor: color }}
            />
            <span
                className={cn(
                    "pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[rgba(0,0,0,0.72)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-[#fff]",
                    below ? "top-full mt-1.5" : "bottom-full mb-1.5",
                )}
                data-tint-handle-label
            >
                {label}
            </span>
        </button>
    )
}

function ColorField({ label, point, value, onChange }: { label: string, point: GlassPoint, value: string, onChange: (hex: string) => void }) {
    const [text, setText] = React.useState(value)
    React.useEffect(() => setText(value), [value])
    const commit = () => {
        const v = text.trim().startsWith("#") ? text.trim() : `#${text.trim()}`
        if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v.toLowerCase())
        else setText(value)
    }
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-[--muted]">{point.x}% · {point.y}%</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[rgba(0,0,0,0.18)] p-1.5 pr-2 focus-within:border-white/25">
                <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/20" style={{ backgroundColor: value }}>
                    <input
                        type="color"
                        aria-label={label}
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                </label>
                <input
                    type="text"
                    value={text}
                    spellCheck={false}
                    maxLength={7}
                    onChange={e => setText(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => e.key === "Enter" && commit()}
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase tracking-wide outline-none"
                />
            </div>
        </div>
    )
}

function GlassSlider({ icon: Icon, label, value, fallback, max, format, lowLabel, highLabel, onChange, onReset }: {
    icon: React.ElementType
    label: string
    value: number | undefined
    fallback: number
    max: number
    format: (v: number) => string
    lowLabel: string
    highLabel: string
    onChange: (v: number) => void
    onReset: () => void
}) {
    const isSet = value !== undefined
    const shown = value ?? fallback
    const pct = (shown / max) * 100
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.05] text-[--muted]"><Icon className="size-4" /></span>
                    {label}
                </span>
                <span className="inline-flex items-center gap-2 text-xs tabular-nums text-[--muted]">
                    {isSet ? <span className="font-semibold text-white">{format(shown)}</span> : <span>Theme default</span>}
                    {isSet && (
                        <button
                            type="button"
                            onClick={onReset}
                            title="Back to the theme default"
                            aria-label={`Reset ${label}`}
                            className="rounded-full p-1 hover:bg-white/10 hover:text-white"
                        >
                            <LuRotateCcw className="size-3" />
                        </button>
                    )}
                </span>
            </div>
            <div className="group relative h-6">
                <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
                    <div
                        className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r", isSet ? "from-brand-600 to-brand-400" : "from-white/20 to-white/30")}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div
                    className={cn(
                        "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 rounded-full shadow-[0_0_0_4px_rgb(var(--color-brand-500)/0.25)] transition-transform group-hover:scale-110 group-active:scale-125",
                        isSet ? "bg-white" : "bg-white/60",
                    )}
                    style={{ left: `calc(${pct}% - 8px)` }}
                />
                <input
                    type="range"
                    aria-label={label}
                    min={0}
                    max={max}
                    step={1}
                    value={shown}
                    onChange={e => onChange(Number(e.target.value))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </div>
            <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-[--muted]">
                <span>{lowLabel}</span>
                <span>{highLabel}</span>
            </div>
        </div>
    )
}
