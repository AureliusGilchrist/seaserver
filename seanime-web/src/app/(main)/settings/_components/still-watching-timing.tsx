import { cn } from "@/components/ui/core/styling"
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

export function formatHour(hour: number): string {
    const h = ((Math.round(hour) % 24) + 24) % 24
    if (h === 0) return "12 am"
    if (h === 12) return "noon"
    return h < 12 ? `${h} am` : `${h - 12} pm`
}

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
                                active
                                    ? "bg-[--brand] text-white shadow-md shadow-[--brand]/30"
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
                    ? <span>The player asks between <strong className="text-[--foreground]">{formatHour(startHour)}</strong> and <strong className="text-[--foreground]">{formatHour(endHour)}</strong>{startHour !== endHour ? " (wraps past midnight)" : ""}.</span>
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
    const [nowHour, setNowHour] = React.useState(() => new Date().getHours())

    React.useEffect(() => {
        const t = window.setInterval(() => setNowHour(new Date().getHours()), 60_000)
        return () => window.clearInterval(t)
    }, [])

    const interactive = mode === "custom"
    const clampedStart = ((Math.round(startHour) % 24) + 24) % 24
    const clampedEnd = ((Math.round(endHour) % 24) + 24) % 24

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
        return Math.round(ratio * 24) % 24
    }, [])

    const dragRef = React.useRef<"start" | "end" | null>(null)

    const onPointerDown = (which: "start" | "end") => (e: React.PointerEvent) => {
        if (!interactive) return
        e.preventDefault()
        dragRef.current = which
        e.currentTarget.setPointerCapture(e.pointerId)
        const hour = hourFromPointer(e.clientX)
        if (which === "start") onStartHourChange(hour)
        else onEndHourChange(hour)
    }

    const onPointerMove = (e: React.PointerEvent) => {
        if (!interactive || !dragRef.current) return
        const hour = hourFromPointer(e.clientX)
        if (dragRef.current === "start") onStartHourChange(hour)
        else onEndHourChange(hour)
    }

    const endPointerDrag = () => {
        dragRef.current = null
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
            >
                {/* Hour ticks: midnight slightly stronger, the rest faint. */}
                {Array.from({ length: 24 }).map((_, hour) => (
                    <div
                        key={hour}
                        className={cn(
                            "absolute top-0 h-full w-px",
                            hour % 6 === 0 ? "bg-[--border]" : "bg-[--border]/40",
                        )}
                        style={{ left: `${(hour / 24) * 100}%` }}
                    />
                ))}

                {/* The lit window(s). */}
                {spans.map((span, i) => (
                    <div
                        key={i}
                        className="absolute top-0 h-full bg-gradient-to-b from-[--brand]/40 to-[--brand]/25 border-x border-[--brand]/50"
                        style={{ left: `${span.left}%`, width: `${span.width}%` }}
                    >
                        <div className="absolute inset-0 bg-[--brand]/10" />
                    </div>
                ))}

                {/* Current hour marker. */}
                <div
                    className="absolute top-0 h-full w-0.5 bg-white/80 shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                    style={{ left: `calc(${(nowHour / 24) * 100}% - 1px)` }}
                >
                    <div className="absolute -top-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-white" />
                </div>

                {/* Custom-mode handles. */}
                {interactive && !wholeDay && (
                    <>
                        <Handle left={clampedStart} label={formatHour(clampedStart)} onPointerDown={onPointerDown("start")} />
                        <Handle left={clampedEnd} label={formatHour(clampedEnd)} onPointerDown={onPointerDown("end")} />
                    </>
                )}
            </div>

            <div className="mt-1 flex w-full justify-between text-[10px] font-medium uppercase tracking-wider text-[--muted]">
                <span>Midnight</span>
                <span>6 am</span>
                <span>Noon</span>
                <span>6 pm</span>
                <span>Midnight</span>
            </div>
        </div>
    )
}

function Handle({ left, label, onPointerDown }: { left: number, label: string, onPointerDown: (e: React.PointerEvent) => void }) {
    return (
        <div
            role="slider"
            aria-label={label}
            aria-valuenow={left}
            aria-valuemin={0}
            aria-valuemax={23}
            tabIndex={0}
            onPointerDown={onPointerDown}
            className="absolute top-0 z-10 flex h-full cursor-ew-resize touch-none items-center"
            style={{ left: `${(left / 24) * 100}%`, transform: "translateX(-50%)" }}
        >
            <div className="size-4 rounded-full border-2 border-white bg-[--brand] shadow-lg shadow-black/40 transition-transform hover:scale-110" />
        </div>
    )
}
