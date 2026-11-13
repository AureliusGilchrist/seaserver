"use client"
import {
    clampGlassBlur,
    clampGlassPercent,
    GLASS_BLUR_DEFAULT,
    GLASS_BLUR_MAX,
    GLASS_OPACITY_DEFAULT,
    GLASS_TINT_DEFAULT,
} from "@/app/(main)/_features/glass/glass-variables"
import { cn } from "@/components/ui/core/styling"
import { type ClientSettings, setClientSettings, useClientSettings } from "@/lib/client-settings"
import React from "react"
import { LuDroplet, LuEye, LuPalette, LuRotateCcw } from "react-icons/lu"

type GlassKey = "glassTint" | "glassOpacity" | "glassBlur"

/**
 * Personal -> Display -> Glass. Tint, opacity and blur for every translucent surface in the app.
 * Each slider starts on "Theme default" and only takes over once moved; its reset hands that one
 * property back to the theme. The preview follows the slider live; the app follows a moment after
 * it stops (one save, not one per step).
 */
export function GlassSettings() {
    const settings = useClientSettings()

    const [draft, setDraft] = React.useState<Partial<Record<GlassKey, number>>>({})
    // Settings changed elsewhere (another device, the row's reset) win over the local draft.
    React.useEffect(() => setDraft({}), [settings.glassTint, settings.glassOpacity, settings.glassBlur])

    const commitTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
    React.useEffect(() => () => clearTimeout(commitTimer.current), [])

    const value = (key: GlassKey): number | undefined => draft[key] ?? settings[key]

    const change = (key: GlassKey, v: number) => {
        setDraft(prev => ({ ...prev, [key]: v }))
        clearTimeout(commitTimer.current)
        commitTimer.current = setTimeout(() => setClientSettings(prev => ({ ...prev, [key]: v })), 250)
    }

    const reset = (keys: GlassKey[]) => {
        clearTimeout(commitTimer.current)
        setDraft({})
        setClientSettings(prev => {
            const next: ClientSettings = { ...prev }
            keys.forEach(k => delete next[k])
            return next
        })
    }

    const tint = value("glassTint")
    const opacity = value("glassOpacity")
    const blur = value("glassBlur")
    const anySet = tint !== undefined || opacity !== undefined || blur !== undefined

    const t = (tint ?? GLASS_TINT_DEFAULT) / 100
    const o = (opacity ?? GLASS_OPACITY_DEFAULT) / 100
    const b = blur ?? GLASS_BLUR_DEFAULT

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-medium">Glass</p>
                    <p className="text-xs text-[--muted]">
                        Tint, opacity and blur for every translucent surface: cards, panels, menus, popups, the sidebar and the top bar.
                        Over a wallpaper the tint is drawn from its colours, otherwise from the theme's.
                    </p>
                </div>
                {anySet && (
                    <button
                        type="button"
                        onClick={() => reset(["glassTint", "glassOpacity", "glassBlur"])}
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

                {/* Preview: a glass pane over a busy backdrop, drawn with the slider values. */}
                <div className="relative min-h-[11rem] overflow-hidden rounded-2xl border border-white/[0.06]">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: "radial-gradient(circle at 20% 25%, #f59e0b 0 18%, transparent 19%), radial-gradient(circle at 75% 70%, #ec4899 0 22%, transparent 23%), radial-gradient(circle at 70% 20%, #22d3ee 0 12%, transparent 13%), linear-gradient(135deg, #1e293b, #f8fafc 120%)",
                        }}
                    />
                    <span className="absolute left-3 top-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/80 mix-blend-difference">Preview</span>
                    <div
                        className="absolute inset-x-5 bottom-5 top-9 rounded-xl border border-white/15 p-3"
                        style={{
                            backgroundColor: `rgb(12 12 17 / ${o * (1 - t)})`,
                            backgroundImage: `linear-gradient(150deg, rgb(var(--color-brand-400) / ${o * t * 0.8}), rgb(var(--color-brand-800) / ${o * t}))`,
                            backdropFilter: `blur(${b}px) saturate(1.5)`,
                            WebkitBackdropFilter: `blur(${b}px) saturate(1.5)`,
                        }}
                    >
                        <p className="text-sm font-semibold text-white">Glass panel</p>
                        <p className="mt-1 text-xs text-white/70">Text on top of the glass.</p>
                    </div>
                </div>
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
