import { cn } from "@/components/ui/core/styling"
import { formatHour, normalizeHalfHour } from "@/app/(main)/_features/video-core/_lib/still-watching-timing"
import React from "react"
import { LuMoon, LuSun } from "react-icons/lu"

/**
 * The "when should the player ask?" control.
 *
 * A row of preset chips — Night, All day, Custom — over a 24-hour strip that draws the answer:
 * the hours the check applies in are lit, the rest of the day is dim, a marker sits on the
 * current hour. Presets set the strip; the strip sets nothing until Custom is chosen, at which
 * point its two ends become draggable handles. One picture instead of two number fields, so
 * "7 pm to 10 am, wrapping past midnight" is something you can see.
 */

export type StillWatchingTimingMode = "night" | "always" | "custom"

/** The preset night window: 7 pm to 10 am — long evening sessions, quiet mornings. */
export const NIGHT_START_HOUR = 19
export const NIGHT_END_HOUR = 10

type StillWatchingTimingProps = {
    mode: StillWatchingTimingMode
    startHour: number
    endHour: number
    onModeChange: (mode: StillWatchingTimingMode) => void
    onStartHourChange: (hour: number) => void
    onEndHourChange: (hour: number) => void
}

const MODES: { id: StillWatchingTimingMode, label: string, icon: React.ElementType, blurb: string }[] = [
    { id: "night", label: "Night", icon: LuMoon, blurb: "Evenings through mornings — 7 pm to 10 am." },
    { id: "always", label: "All day", icon: LuSun, blurb: "Ask whatever the hour." },
    { id: "custom", label: "Custom", icon: LuMoon, blurb: "Pick the hours below." },
]

export function StillWatchingTiming(props: StillWatchingTimingProps) {
    const { mode, startHour, endHour, onModeChange, onStartHourChange, onEndHourChange } = props
    const selected = MODES.find(m => m.id === mode) ?? MODES[0]

    return (
        <div className="space-y-3">
            <div
                role="radiogroup"
                aria-label="When the player asks if you're still watching"
                className="flex flex-wrap gap-1.5 rounded-full border border-[--border] bg-[--paper]/60 p-1 w-fit"
            >
                {MODES.map(m => {
                    const Icon = m.icon
                    const active = m.id === mode
                    return (
                        <button
                            key={m.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => {
                                onModeChange(m.id)
                                if (m.id === "night") {
                                    onStartHourChange(NIGHT_START_HOUR)
                                    onEndHourChange(NIGHT_END_HOUR)
                                }
                            }}
                            className={cn(
                                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
                                // White on the theme's brand colour went blank when the brand is
                                // light, so the chosen chip is a fixed light pill with dark text.
                                active
                                    ? "bg-white text-gray-950 shadow-md shadow-black/30"
                                    : "text-[--muted] hover:bg-[--subtle] hover:text-[--foreground]",
                            )}
                        >
                            <Icon className="size-3.5" />
                            {m.label}
                        </button>
                    )
                })}
            </div>

            <p className="text-xs text-[--muted]">
                {mode === "custom"
                    ? <span>The player asks between <strong className="text-[--foreground]">{formatHour(startHour)}</strong> and <strong className="text-[--foreground]">{formatHour(endHour)}</strong>{startHour > endHour ? " (wraps past midnight)" : startHour === endHour ? " (all day)" : ""}.</span>
                    : selected.blurb}
            </p>

            <TimingStrip
                mode={mode}
                startHour={startHour}
                endHour={endHour}
                onStartHourChange={onStartHourChange}
                onEndHourChange={onEndHourChange}
            />
        </div>
    )
}

/**
 * The 24-hour strip. Always drawn — it is the picture of the setting even when a preset owns
 * it — but only interactive in Custom mode, where dragging either end reshapes the window.
 */
function TimingStrip({ mode, startHour, endHour, onStartHourChange, onEndHourChange }: {
    mode: StillWatchingTimingMode
    startHour: number
    endHour: number
    onStartHourChange: (hour: number) => void
    onEndHourChange: (hour: number) => void
}) {
    const trackRef = React.useRef<HTMLDivElement>(null)
    const currentHour = () => {
        const now = new Date()
        return now.getHours() + now.getMinutes() / 60
    }
    const [nowHour, setNowHour] = React.useState(currentHour)
    const [dragging, setDragging] = React.useState<"start" | "end" | null>(null)

    React.useEffect(() => {
        const t = window.setInterval(() => setNowHour(currentHour()), 60_000)
        return () => window.clearInterval(t)
    }, [])

    const interactive = mode === "custom"
    const clampedStart = normalizeHalfHour(startHour)
    const clampedEnd = normalizeHalfHour(endHour)

    // A window whose ends meet is the whole day; the lit span then covers the strip.
    const wholeDay = clampedStart === clampedEnd
    // Percent positions. A midnight-crossing window (19 → 10) is drawn as two lit spans, one
    // on each side of the strip, because that is what the day looks like: the evening hours at
    // the right edge, the morning hours at the left edge, and the gap between them is midday.
    const spans = React.useMemo((): { left: number, width: number }[] => {
        if (wholeDay) return [{ left: 0, width: 100 }]
        const s = (clampedStart / 24) * 100
        const e = (clampedEnd / 24) * 100
        if (clampedStart < clampedEnd) return [{ left: s, width: e - s }]
        return [
            { left: s, width: 100 - s },
            { left: 0, width: e },
        ]
    }, [clampedStart, clampedEnd, wholeDay])

    const hourFromPointer = React.useCallback((clientX: number) => {
        const track = trackRef.current
        if (!track) return 0
        const rect = track.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
        return normalizeHalfHour(ratio * 24)
    }, [])

    const dragRef = React.useRef<"start" | "end" | null>(null)

    const onPointerDown = (which: "start" | "end") => (e: React.PointerEvent) => {
        if (!interactive) return
        e.preventDefault()
        dragRef.current = which
        setDragging(which)
        e.currentTarget.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: React.PointerEvent) => {
        if (!interactive || !dragRef.current) return
        const hour = hourFromPointer(e.clientX)
        if (dragRef.current === "start") onStartHourChange(hour)
        else onEndHourChange(hour)
    }

    const endPointerDrag = () => {
        dragRef.current = null
        setDragging(null)
    }

    const onHandleKeyDown = (which: "start" | "end") => (e: React.KeyboardEvent) => {
        let hour = which === "start" ? clampedStart : clampedEnd
        if (e.key === "ArrowRight" || e.key === "ArrowUp") hour += 0.5
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") hour -= 0.5
        else if (e.key === "Home") hour = 0
        else if (e.key === "End") hour = 23.5
        else return
        e.preventDefault()
        e.stopPropagation()
        if (which === "start") onStartHourChange(normalizeHalfHour(hour))
        else onEndHourChange(normalizeHalfHour(hour))
    }

    return (
        <div className={cn("select-none", !interactive && "opacity-90")}>
            <div
                ref={trackRef}
                className={cn(
                    "relative h-9 w-full overflow-hidden rounded-xl border border-[--border] bg-[--paper]/80",
                    interactive && "cursor-ew-resize touch-none",
                )}
                onPointerMove={onPointerMove}
                onPointerUp={endPointerDrag}
                onPointerCancel={endPointerDrag}
                onLostPointerCapture={endPointerDrag}
            >
                {/* The lit window(s), under the notches so the notches read across them. Palette
                    shades rather than the --brand variable: an opacity on the variable came out
                    fully transparent, which left the chosen hours undrawn. */}
                {spans.map((span, i) => (
                    <div
                        key={i}
                        className="absolute top-0 h-full border-x border-brand-300/70 bg-gradient-to-b from-brand-400/45 to-brand-500/25"
                        style={{ left: `${span.left}%`, width: `${span.width}%` }}
                    />
                ))}

                {/* Hour ticks, half-hour notches, and the four quarter-day lines strongest. */}
                {Array.from({ length: 48 }).map((_, tick) => (
                    tick === 0 ? null : <div
                        key={tick}
                        className={cn(
                            "pointer-events-none absolute z-[1] w-px",
                            tick % 12 === 0 ? "top-0 h-full bg-white/45"
                                : tick % 2 === 0 ? "bottom-0 h-1/2 bg-white/35"
                                    : "bottom-0 h-1/4 bg-white/25",
                        )}
                        style={{ left: `${(tick / 48) * 100}%` }}
                    />
                ))}

                {/* Current hour marker. */}
                <div
                    className="absolute top-0 h-full w-0.5 bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                    style={{ left: `calc(${(nowHour / 24) * 100}% - 1px)` }}
                >
                    <div className="absolute -top-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-white" />
                </div>

                {/* Custom-mode handles. */}
                {interactive && (
                    <>
                        <Handle left={clampedStart} name="Start time" dragging={dragging === "start"} overlapping={wholeDay ? "start" : undefined} onPointerDown={onPointerDown("start")} onKeyDown={onHandleKeyDown("start")} />
                        <Handle left={clampedEnd} name="End time" dragging={dragging === "end"} overlapping={wholeDay ? "end" : undefined} onPointerDown={onPointerDown("end")} onKeyDown={onHandleKeyDown("end")} />
                    </>
                )}
            </div>

            {/* A time under every hour notch, in a dim grey so it reads as a scale rather than as
                content; midnight, 6, noon and 6 sit a little brighter. Every third hour only on
                narrow screens, where 25 labels would run together. */}
            <div className="relative mt-1.5 h-5 w-full font-semibold tabular-nums" aria-hidden>
                {Array.from({ length: 25 }).map((_, hour) => {
                    const major = hour % 6 === 0
                    return (
                        <span
                            key={hour}
                            className={cn(
                                "absolute top-0 whitespace-nowrap",
                                hour === 0 ? "translate-x-0" : hour === 24 ? "-translate-x-full" : "-translate-x-1/2",
                                major ? "text-[13px] text-white/85" : "pt-px text-[11px] text-white/60",
                                hour % 3 !== 0 && "hidden lg:block",
                            )}
                            style={{ left: `${(hour / 24) * 100}%` }}
                        >
                            {hourLabel(hour)}
                        </span>
                    )
                })}
            </div>
        </div>
    )
}

/** Labels for the scale: "12 am", "3 am" … "12 pm" … "9 pm", "12 am". */
function hourLabel(hour: number) {
    const h = hour % 12 === 0 ? 12 : hour % 12
    return `${h} ${hour % 24 < 12 ? "am" : "pm"}`
}

function Handle({ left, name, dragging, overlapping, onPointerDown, onKeyDown }: {
    left: number
    name: string
    dragging: boolean
    overlapping?: "start" | "end"
    onPointerDown: (e: React.PointerEvent) => void
    onKeyDown: (e: React.KeyboardEvent) => void
}) {
    return (
        <div
            role="slider"
            aria-label={name}
            aria-valuenow={left}
            aria-valuetext={formatHour(left)}
            aria-valuemin={0}
            aria-valuemax={23.5}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
            className={cn("absolute top-0 z-10 flex h-full cursor-ew-resize touch-none items-center focus-visible:z-20 focus-visible:outline-none [&:focus-visible>div]:ring-2 [&:focus-visible>div]:ring-white", dragging && "z-20 transition-[left] duration-75 ease-out motion-reduce:transition-none")}
            style={{ left: `clamp(8px, ${(left / 24) * 100}%, calc(100% - 8px))`, transform: `translate(-50%, ${overlapping === "start" ? "-8px" : overlapping === "end" ? "8px" : "0"})` }}
        >
            <div className={cn(
                "size-4 rounded-full border-2 border-white bg-[--brand] shadow-lg shadow-black/40 transition-[transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                dragging ? "scale-125 shadow-[0_0_0_5px_rgba(255,255,255,0.15),0_4px_12px_rgba(0,0,0,0.5)]" : "hover:scale-110",
            )} />
        </div>
    )
}
