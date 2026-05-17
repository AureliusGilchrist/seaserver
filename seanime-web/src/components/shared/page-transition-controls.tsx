"use client"
import { getLayerVariants } from "@/components/shared/page-transition"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/components/ui/core/styling"
import type {
    PageTransitionEasing,
    PageTransitionVariant,
} from "@/lib/ui-customize/ui-customize-definitions"
import { useUICustomize } from "@/lib/ui-customize/ui-customize-provider"
import { motion } from "motion/react"
import React from "react"

// ─── Option lists ───────────────────────────────────────────────────────────

const VARIANT_OPTIONS: { value: PageTransitionVariant; label: string; icon: string; desc: string }[] = [
    { value: "fade",       label: "Fade",         icon: "🌅", desc: "Layers fade in and out." },
    { value: "scaleUp",    label: "Scale Up",     icon: "🔍", desc: "Grow into view, blow out on exit." },
    { value: "scaleDown",  label: "Scale Down",   icon: "🔎", desc: "Shrink into view, collapse on exit." },
    { value: "swipeLeft",  label: "Swipe Left",   icon: "⬅️", desc: "Slide off to the left." },
    { value: "swipeRight", label: "Swipe Right",  icon: "➡️", desc: "Slide off to the right." },
    { value: "swipeUp",    label: "Swipe Up",     icon: "⬆️", desc: "Slide off upwards." },
    { value: "blur",       label: "Blur Out",     icon: "🌫️", desc: "Blur and fade." },
    { value: "rotate",     label: "Rotate Out",   icon: "🌀", desc: "Tilt and fade away." },
    { value: "none",       label: "None",         icon: "⚡", desc: "Instant page change." },
]

const EASING_OPTIONS: { value: PageTransitionEasing; label: string }[] = [
    { value: "linear",     label: "Linear" },
    { value: "easeIn",     label: "Ease In" },
    { value: "easeOut",    label: "Ease Out" },
    { value: "easeInOut",  label: "Ease In-Out" },
    { value: "circIn",     label: "Circular In" },
    { value: "circOut",    label: "Circular Out" },
    { value: "anticipate", label: "Anticipate" },
]

// ─── Slider primitive (range input styled) ─────────────────────────────────

function RangeSlider({
    label, value, min, max, step, suffix, onChange,
}: {
    label: string
    value: number
    min: number
    max: number
    step: number
    suffix: string
    onChange: (v: number) => void
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[--foreground]">{label}</span>
                <span className="text-[11px] text-[--muted] tabular-nums">{value}{suffix}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="w-full h-2 bg-[--background] rounded-lg appearance-none cursor-pointer accent-[--color-brand-500]"
            />
        </div>
    )
}

// ─── Preview tile ──────────────────────────────────────────────────────────

function TransitionPreview() {
    const { state } = useUICustomize()
    const [tick, setTick] = React.useState(0)

    const variants = React.useMemo(
        () => getLayerVariants(state.transitionVariant, state.transitionScaleAmount, state.transitionSwipeDistance),
        [state.transitionVariant, state.transitionScaleAmount, state.transitionSwipeDistance],
    )

    const dur = state.transitionMaxDurationMs / 1000
    const maxDelay = state.transitionMaxDelayMs / 1000
    const easing = state.transitionEasing

    // The preview shows 4 stacked bars staggering in then out, looping.
    const layerCount = 4

    return (
        <div className="rounded-lg border border-[--border] bg-[--background] p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[--muted]">Preview</span>
                <button
                    onClick={() => setTick(t => t + 1)}
                    className="text-[11px] px-2 py-0.5 rounded border border-[--border] hover:bg-white/5 text-[--muted]"
                >
                    Replay
                </button>
            </div>
            <div className="relative w-full h-32 rounded-md bg-[#0e0e17] overflow-hidden flex flex-col items-stretch justify-center gap-2 p-3">
                {Array.from({ length: layerCount }).map((_, i) => {
                    const t = i / Math.max(layerCount - 1, 1)
                    const delay = t * maxDelay
                    return (
                        <motion.div
                            key={`${tick}-${i}`}
                            initial={variants.initial}
                            animate={variants.animate}
                            transition={{ duration: dur, delay, ease: easing }}
                            className="h-4 rounded-md bg-[--color-brand-500]/40 border border-[--color-brand-400]/40"
                            style={{ width: `${60 + i * 10}%` }}
                        />
                    )
                })}
            </div>
        </div>
    )
}

// ─── Main control panel ────────────────────────────────────────────────────

export function PageTransitionControls() {
    const { state, setAllState } = useUICustomize()

    const isScale = state.transitionVariant === "scaleUp" || state.transitionVariant === "scaleDown"
    const isSwipe = state.transitionVariant === "swipeLeft" || state.transitionVariant === "swipeRight" || state.transitionVariant === "swipeUp"

    return (
        <div className="space-y-4">
            <div className="text-xs text-[--muted]">
                Layered page transitions cascade through each section of the page. The maximum duration is how long any single layer takes; the maximum delay is how much time can elapse between the first and last layer. Easing-driven mode uses the easing curve to distribute layer delays non-linearly.
            </div>

            {/* Variants */}
            <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-[--muted] mb-2">Variant</div>
                <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 gap-2">
                    {VARIANT_OPTIONS.map(opt => {
                        const active = state.transitionVariant === opt.value
                        return (
                            <button
                                key={opt.value}
                                onClick={() => setAllState({ transitionVariant: opt.value })}
                                className={cn(
                                    "flex flex-col items-start gap-0.5 p-2 rounded-lg border text-left transition-all",
                                    active
                                        ? "bg-[--color-brand-800]/40 border-[--color-brand-500]/60 text-[--color-brand-100]"
                                        : "bg-[--background] border-[--border] hover:border-[--color-brand-700]/40 text-[--foreground]",
                                )}
                            >
                                <span className="text-sm font-semibold">
                                    <span className="mr-1">{opt.icon}</span>{opt.label}
                                </span>
                                <span className="text-[10px] text-[--muted] leading-tight">{opt.desc}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <RangeSlider
                    label="Max duration per layer"
                    value={state.transitionMaxDurationMs}
                    min={100}
                    max={2000}
                    step={50}
                    suffix="ms"
                    onChange={v => setAllState({ transitionMaxDurationMs: v })}
                />
                <RangeSlider
                    label="Max delay between layers"
                    value={state.transitionMaxDelayMs}
                    min={0}
                    max={1500}
                    step={25}
                    suffix="ms"
                    onChange={v => setAllState({ transitionMaxDelayMs: v })}
                />
                {isScale && (
                    <RangeSlider
                        label="Scale amount"
                        value={Math.round(state.transitionScaleAmount * 100)}
                        min={20}
                        max={100}
                        step={5}
                        suffix="%"
                        onChange={v => setAllState({ transitionScaleAmount: v / 100 })}
                    />
                )}
                {isSwipe && (
                    <RangeSlider
                        label="Swipe distance"
                        value={state.transitionSwipeDistance}
                        min={50}
                        max={800}
                        step={10}
                        suffix="px"
                        onChange={v => setAllState({ transitionSwipeDistance: v })}
                    />
                )}
            </div>

            {/* Easing */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <div className="text-xs font-medium text-[--foreground] mb-1">Easing curve</div>
                    <Select
                        value={state.transitionEasing}
                        onValueChange={v => setAllState({ transitionEasing: v as PageTransitionEasing })}
                        options={EASING_OPTIONS}
                    />
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[--border] bg-[--background]">
                    <div className="flex flex-col">
                        <span className="text-xs font-medium text-[--foreground]">Easing-driven delays</span>
                        <span className="text-[10px] text-[--muted]">Distribute layer delays along the easing curve instead of linearly.</span>
                    </div>
                    <Switch
                        value={state.transitionEasingDriven}
                        onValueChange={v => setAllState({ transitionEasingDriven: v })}
                    />
                </div>
            </div>

            {/* Preview */}
            <TransitionPreview />
        </div>
    )
}
