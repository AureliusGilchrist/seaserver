"use client"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { useController } from "react-hook-form"
import { LuMinus, LuPlus, LuStar, LuX } from "react-icons/lu"

/**
 * The AniList entry editor's score: a big readout with − and + that move it by 0.5, ten stars that
 * take a half or a whole point (left or right half of a star), and arrow keys (±0.5, Shift ±1).
 * Bound to the form's "score" field, 0–10 (0 or empty = not rated).
 */

const STEP = 0.5

const WORDS: [number, string][] = [
    [10, "Masterpiece"],
    [9, "Amazing"],
    [8, "Great"],
    [7, "Good"],
    [6, "Fine"],
    [5, "Average"],
    [4, "Bad"],
    [3, "Very bad"],
    [2, "Awful"],
    [0.5, "Appalling"],
]

function scoreWord(v: number) {
    if (!v) return "Not rated"
    return WORDS.find(([min]) => v >= min)?.[1] ?? "Appalling"
}

/** A hue that walks red → amber → lime → emerald → the brand colour as the score rises. */
function scoreTone(v: number): { solid: string, soft: string, glow: string } {
    if (!v) return { solid: "rgb(255 255 255 / 0.35)", soft: "rgb(255 255 255 / 0.06)", glow: "transparent" }
    const stops: [number, [number, number, number]][] = [
        [0, [239, 68, 68]],
        [4, [245, 158, 11]],
        [6, [163, 230, 53]],
        [8, [52, 211, 153]],
        [10, [167, 139, 250]],
    ]
    let rgb = stops[stops.length - 1][1]
    for (let i = 1; i < stops.length; i++) {
        const [b, cb] = stops[i]
        const [a, ca] = stops[i - 1]
        if (v <= b) {
            const t = (v - a) / (b - a)
            rgb = ca.map((c, k) => Math.round(c + (cb[k] - c) * t)) as [number, number, number]
            break
        }
    }
    const [r, g, b] = rgb
    return { solid: `rgb(${r} ${g} ${b})`, soft: `rgb(${r} ${g} ${b} / 0.14)`, glow: `rgb(${r} ${g} ${b} / 0.45)` }
}

const clampScore = (v: number) => Math.min(10, Math.max(0, Math.round(v / STEP) * STEP))

export function AnilistScoreField({ name = "score" }: { name?: string }) {
    const { field } = useController({ name })
    const value = typeof field.value === "number" && !isNaN(field.value) ? field.value : 0
    const [hover, setHover] = React.useState<number | null>(null)
    const [bump, setBump] = React.useState<"up" | "down" | null>(null)

    const set = (v: number) => {
        const next = clampScore(v)
        if (next !== value) setBump(next > value ? "up" : "down")
        field.onChange(next === 0 ? 0 : next)
    }
    React.useEffect(() => {
        if (!bump) return
        const t = setTimeout(() => setBump(null), 260)
        return () => clearTimeout(t)
    }, [bump, value])

    const shown = hover ?? value
    const tone = scoreTone(shown)

    const onKeyDown = (e: React.KeyboardEvent) => {
        const step = e.shiftKey ? 1 : STEP
        if (e.key === "ArrowRight" || e.key === "ArrowUp") set(value + step)
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") set(value - step)
        else if (e.key === "Home" || e.key === "Delete" || e.key === "Backspace") set(0)
        else if (e.key === "End") set(10)
        else return
        e.preventDefault()
    }

    return (
        <div className="w-full space-y-1.5" data-anilist-score-field>
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Score</span>
                {value > 0 && (
                    <button
                        type="button"
                        onClick={() => set(0)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] text-[--muted] transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <LuX className="size-3" /> Clear
                    </button>
                )}
            </div>
            <div
                role="slider"
                tabIndex={0}
                aria-label="Score"
                aria-valuemin={0}
                aria-valuemax={10}
                aria-valuenow={value}
                aria-valuetext={value ? `${value} out of 10, ${scoreWord(value)}` : "Not rated"}
                onKeyDown={onKeyDown}
                className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-white/10 p-3 outline-none transition-[box-shadow,border-color] duration-300 focus-visible:border-white/30 sm:flex-row sm:items-center sm:gap-4"
                style={{
                    background: `radial-gradient(120% 140% at 0% 0%, ${tone.soft}, transparent 60%), rgb(0 0 0 / 0.25)`,
                    boxShadow: value ? `0 10px 30px -16px ${tone.glow}` : undefined,
                }}
            >
                {/* − readout + */}
                <div className="flex items-center justify-between gap-2 sm:justify-start">
                    <StepButton label="Lower score by 0.5" onClick={() => set(value - STEP)} disabled={value <= 0}>
                        <LuMinus className="size-4" />
                    </StepButton>
                    <div className="flex w-[5.5rem] flex-col items-center leading-none">
                        <span
                            className={cn(
                                "text-[2rem] font-black tabular-nums tracking-tight transition-[transform,color] duration-200",
                                bump === "up" && "-translate-y-0.5 scale-110",
                                bump === "down" && "translate-y-0.5 scale-95",
                            )}
                            style={{ color: tone.solid, textShadow: shown ? `0 0 18px ${tone.glow}` : undefined }}
                        >
                            {shown ? shown.toFixed(1).replace(/\.0$/, "") : "–"}
                            <span className="ml-0.5 text-xs font-semibold text-[--muted]">/10</span>
                        </span>
                        <span className="mt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em]" style={{ color: tone.solid }}>
                            {scoreWord(shown)}
                        </span>
                    </div>
                    <StepButton label="Raise score by 0.5" onClick={() => set(value + STEP)} disabled={value >= 10}>
                        <LuPlus className="size-4" />
                    </StepButton>
                </div>

                <div className="hidden h-12 w-px bg-white/10 sm:block" />

                {/* Ten stars, half a point each half. */}
                <div className="flex flex-1 items-center justify-between gap-0.5" onMouseLeave={() => setHover(null)}>
                    {Array.from({ length: 10 }, (_, i) => {
                        const fill = Math.min(1, Math.max(0, shown - i))
                        return (
                            <div key={i} className="relative size-6 shrink-0 sm:size-7">
                                <LuStar className="absolute inset-0 size-full text-white/15" strokeWidth={1.5} />
                                <div className="absolute inset-0 overflow-hidden transition-[width] duration-150" style={{ width: `${fill * 100}%` }}>
                                    <LuStar
                                        className="size-6 sm:size-7"
                                        strokeWidth={1.5}
                                        style={{ color: tone.solid, fill: tone.solid, filter: `drop-shadow(0 0 6px ${tone.glow})` }}
                                    />
                                </div>
                                {[0.5, 1].map(part => (
                                    <button
                                        key={part}
                                        type="button"
                                        tabIndex={-1}
                                        aria-label={`Score ${i + part}`}
                                        onMouseEnter={() => setHover(i + part)}
                                        onClick={() => set(value === i + part ? 0 : i + part)}
                                        className={cn("absolute inset-y-0 w-1/2 cursor-pointer", part === 0.5 ? "left-0" : "right-0")}
                                    />
                                ))}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function StepButton({ label, onClick, disabled, children }: { label: string, onClick: () => void, disabled?: boolean, children: React.ReactNode }) {
    return (
        <button
            type="button"
            tabIndex={-1}
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] transition-all hover:border-white/25 hover:bg-white/[0.12] hover:text-white active:scale-90 disabled:pointer-events-none disabled:opacity-30"
        >
            {children}
        </button>
    )
}
