"use client"
import { useGetAnimeCollection } from "@/api/hooks/anilist.hooks"
import { usePersonalSettings } from "@/app/(main)/_hooks/use-personal-settings"
import { cn } from "@/components/ui/core/styling"
import {
    getCssZoom,
    INTERFACE_SCALE_DEFAULT,
    INTERFACE_SCALE_MAX,
    INTERFACE_SCALE_MIN,
    INTERFACE_SCALE_STOPS,
    setInterfaceScale,
    stepInterfaceScale,
    useInterfaceScale,
} from "@/lib/interface-scale/interface-scale"
import React from "react"
import { LuMinus, LuPlus, LuRotateCcw, LuScaling } from "react-icons/lu"

/** How close (in %) the slider has to come to a snap point to land on it. */
const SNAP_DISTANCE = 3
/** Snap points that get a label on narrow screens; the rest are ticks only. */
const NARROW_LABELS = new Set([50, 100, 150, 200])

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? "⌘" : "Ctrl"

/**
 * Personal -> Display -> Interface size. One scale for the whole UI on this device, 50%–200%.
 *
 * The preview follows the slider while it moves; the app itself changes when the slider is let go
 * (resizing the page under a dragged thumb would pull it away from the pointer). The keyboard,
 * the − / + buttons and the snap labels apply at once.
 */
export function InterfaceSizeSettings() {
    const applied = useInterfaceScale()
    const [draft, setDraft] = React.useState(applied)
    const [dragging, setDragging] = React.useState(false)

    // Changes from elsewhere (shortcuts, another tab) win over an idle draft.
    React.useEffect(() => {
        if (!dragging) setDraft(applied)
    }, [applied, dragging])

    const apply = React.useCallback((v: number) => {
        setDraft(v)
        setInterfaceScale(v)
    }, [])

    const pending = draft !== applied

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/30 to-brand-700/10 text-brand-200 ring-1 ring-brand-400/20">
                        <LuScaling className="size-[1.1rem]" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-medium">Interface size</p>
                        <p className="text-xs text-[--muted]">
                            Everything bigger or smaller together: text, icons, cards, menus and the player. Saved on this device only.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <StepButton label="Smaller" disabled={applied <= INTERFACE_SCALE_MIN} onClick={() => apply(stepInterfaceScale(applied, -1))}>
                        <LuMinus className="size-3.5" />
                    </StepButton>
                    <div
                        className={cn(
                            "min-w-[4.75rem] rounded-lg border px-2.5 py-1 text-center text-sm font-semibold tabular-nums transition-colors",
                            pending ? "border-brand-400/60 bg-brand-500/20 text-white" : "border-white/10 bg-white/[0.04] text-white",
                        )}
                        aria-live="polite"
                    >
                        {draft}%
                    </div>
                    <StepButton label="Larger" disabled={applied >= INTERFACE_SCALE_MAX} onClick={() => apply(stepInterfaceScale(applied, 1))}>
                        <LuPlus className="size-3.5" />
                    </StepButton>
                    <button
                        type="button"
                        onClick={() => apply(INTERFACE_SCALE_DEFAULT)}
                        disabled={applied === INTERFACE_SCALE_DEFAULT && draft === INTERFACE_SCALE_DEFAULT}
                        className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-[--muted] transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-40"
                    >
                        <LuRotateCcw className="size-3.5" /> 100%
                    </button>
                </div>
            </div>

            <ScaleSlider
                value={draft}
                onDraft={setDraft}
                onCommit={apply}
                onDragChange={setDragging}
            />

            <ScalePreview scale={draft} applied={applied} pending={pending} />

            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-[--muted]">
                <span>Shortcuts anywhere:</span>
                <Kbd>{MOD}</Kbd><Kbd>+</Kbd><span>larger</span>
                <span className="text-white/20">·</span>
                <Kbd>{MOD}</Kbd><Kbd>−</Kbd><span>smaller</span>
                <span className="text-white/20">·</span>
                <Kbd>{MOD}</Kbd><Kbd>0</Kbd><span>back to 100%</span>
            </p>
        </div>
    )
}

function StepButton({ label, disabled, onClick, children }: { label: string, disabled?: boolean, onClick: () => void, children: React.ReactNode }) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="flex size-8 items-center justify-center rounded-lg border border-white/10 text-[--muted] transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-30"
        >
            {children}
        </button>
    )
}

function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-px font-sans text-[0.65rem] font-medium text-white/80 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]">
            {children}
        </kbd>
    )
}

const toPct = (v: number) => ((v - INTERFACE_SCALE_MIN) / (INTERFACE_SCALE_MAX - INTERFACE_SCALE_MIN)) * 100

function snap(v: number) {
    for (const s of INTERFACE_SCALE_STOPS) if (Math.abs(v - s) <= SNAP_DISTANCE) return s
    return v
}

function ScaleSlider({ value, onDraft, onCommit, onDragChange }: {
    value: number
    onDraft: (v: number) => void
    onCommit: (v: number) => void
    onDragChange: (dragging: boolean) => void
}) {
    const pointerDown = React.useRef(false)
    const latest = React.useRef(value)
    latest.current = value
    const pct = toPct(value)

    const release = () => {
        if (!pointerDown.current) return
        pointerDown.current = false
        onDragChange(false)
        onCommit(latest.current)
    }

    // A pointer released outside the slider still ends the drag.
    React.useEffect(() => {
        window.addEventListener("pointerup", release)
        window.addEventListener("pointercancel", release)
        return () => {
            window.removeEventListener("pointerup", release)
            window.removeEventListener("pointercancel", release)
        }
    })

    return (
        <div className="select-none space-y-1.5 pt-1">
            <div className="group relative h-8">
                {/* Track */}
                <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
                    <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-700 via-brand-500 to-brand-300"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                {/* Snap ticks */}
                {INTERFACE_SCALE_STOPS.map(s => (
                    <span
                        key={s}
                        className={cn(
                            "pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
                            s === INTERFACE_SCALE_DEFAULT ? "h-4 bg-white/60" : s <= value ? "bg-white/45" : "bg-white/20",
                        )}
                        style={{ left: `${toPct(s)}%` }}
                    />
                ))}
                {/* Thumb */}
                <div
                    className="pointer-events-none absolute top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_0_0_5px_rgb(var(--color-brand-500)/0.28),0_4px_14px_rgba(0,0,0,0.5)] transition-transform group-hover:scale-110 group-active:scale-125"
                    style={{ left: `${pct}%` }}
                >
                    <span className="size-1.5 rounded-full bg-brand-500" />
                </div>
                <input
                    type="range"
                    aria-label="Interface size"
                    aria-valuetext={`${value}%`}
                    min={INTERFACE_SCALE_MIN}
                    max={INTERFACE_SCALE_MAX}
                    step={1}
                    value={value}
                    onPointerDown={() => {
                        pointerDown.current = true
                        onDragChange(true)
                    }}
                    onChange={e => {
                        const v = snap(Number(e.target.value))
                        if (pointerDown.current) onDraft(v)
                        // Keyboard: step between snap points and apply at once.
                        else onCommit(v)
                    }}
                    onKeyDown={e => {
                        const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0
                        if (!dir) return
                        e.preventDefault()
                        onCommit(stepInterfaceScale(value, dir as 1 | -1))
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </div>
            {/* Snap labels */}
            <div className="relative h-5">
                {INTERFACE_SCALE_STOPS.map(s => (
                    <button
                        key={s}
                        type="button"
                        tabIndex={-1}
                        onClick={() => onCommit(s)}
                        className={cn(
                            "absolute top-0 -translate-x-1/2 rounded px-1 text-[0.65rem] tabular-nums transition-colors hover:text-white",
                            s === value ? "font-semibold text-brand-200" : "text-[--muted]",
                            !NARROW_LABELS.has(s) && "hidden sm:block",
                            s === INTERFACE_SCALE_MIN && "translate-x-0",
                            s === INTERFACE_SCALE_MAX && "-translate-x-full",
                        )}
                        style={{ left: `${toPct(s)}%` }}
                    >
                        {s}%
                    </button>
                ))}
            </div>
        </div>
    )
}

/** The screen size in device-independent px, whatever zoom the page is under right now. */
function useScreenSize(applied: number) {
    const read = React.useCallback(() => {
        // Native zoom shrinks innerWidth by the applied factor; CSS zoom leaves it alone.
        const nativeFactor = getCssZoom() === 1 ? applied / 100 : 1
        return { width: Math.round(window.innerWidth * nativeFactor), height: Math.round(window.innerHeight * nativeFactor) }
    }, [applied])
    const [size, setSize] = React.useState(read)
    React.useEffect(() => {
        setSize(read())
        const on = () => setSize(read())
        window.addEventListener("resize", on)
        return () => window.removeEventListener("resize", on)
    }, [read])
    return size
}

/**
 * A miniature of this screen at the chosen size: the mock app is laid out at the viewport the app
 * would have at that size (screen ÷ scale) and shrunk to fit the frame, so it shows how much fits,
 * not just how big text gets.
 */
function ScalePreview({ scale, applied, pending }: { scale: number, applied: number, pending: boolean }) {
    const screen = useScreenSize(applied)
    const frameRef = React.useRef<HTMLDivElement>(null)
    const [frameWidth, setFrameWidth] = React.useState(0)

    React.useLayoutEffect(() => {
        const el = frameRef.current
        if (!el) return
        const ro = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width))
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const workspace = { width: Math.round(screen.width * 100 / scale), height: Math.round(screen.height * 100 / scale) }
    const aspect = screen.width / Math.max(1, screen.height)
    const fit = frameWidth ? frameWidth / workspace.width : 0

    return (
        <div className="space-y-2">
            <div
                ref={frameRef}
                className="relative w-full overflow-hidden rounded-xl bg-[#0a0a0c] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.95)] ring-1 ring-white/10"
                style={{ aspectRatio: `${Math.min(Math.max(aspect, 0.5), 2.4)}` }}
            >
                {fit > 0 && (
                    <div
                        className="absolute left-0 top-0 origin-top-left transition-transform duration-150 ease-out"
                        style={{ width: workspace.width, height: workspace.height, transform: `scale(${fit})` }}
                        aria-hidden
                    >
                        <MockApp narrow={workspace.width < 1024} />
                    </div>
                )}
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5" />
                <span className="pointer-events-none absolute left-3 top-2.5 rounded-md bg-black/65 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/80 backdrop-blur">
                    Preview · {scale}%
                </span>
                {pending && (
                    <span className="pointer-events-none absolute right-3 top-2.5 rounded-md bg-brand-500/80 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white shadow-lg animate-in fade-in">
                        Release to apply
                    </span>
                )}
            </div>
            <p className="text-[0.7rem] tabular-nums text-[--muted]">
                This screen: {screen.width} × {screen.height}
                <span className="mx-1.5 text-white/20">→</span>
                room for <span className="font-medium text-white/80">{workspace.width} × {workspace.height}</span> of interface
            </p>
        </div>
    )
}

/** A stand-in for the app at real (unscaled) px sizes. */
function MockApp({ narrow }: { narrow: boolean }) {
    const { animeCardWidth } = usePersonalSettings()
    const { data } = useGetAnimeCollection()
    const covers = React.useMemo(() => {
        const out: string[] = []
        for (const l of data?.MediaListCollection?.lists ?? []) for (const e of l?.entries ?? []) {
            const c = e?.media?.coverImage?.large
            if (c && !out.includes(c)) out.push(c)
            if (out.length >= 16) return out
        }
        return out
    }, [data])
    const banner = React.useMemo(() => {
        for (const l of data?.MediaListCollection?.lists ?? []) for (const e of l?.entries ?? []) {
            if (e?.media?.bannerImage) return e.media.bannerImage
        }
        return null
    }, [data])

    const cardW = animeCardWidth
    const cards = Array.from({ length: 16 }, (_, i) => covers.length ? covers[i % covers.length] : null)

    return (
        <div className="flex h-full w-full bg-[#0c0c0e] text-left" style={{ fontSize: 16 }}>
            {!narrow && (
                <div className="flex w-[64px] shrink-0 flex-col items-center gap-[18px] border-r border-white/5 bg-black/40 py-[18px]">
                    <div className="size-[32px] rounded-[10px] bg-gradient-to-br from-brand-400 to-brand-700" />
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className={cn("size-[22px] rounded-[6px]", i === 0 ? "bg-white/70" : "bg-white/15")} />
                    ))}
                </div>
            )}
            <div className="min-w-0 flex-1 overflow-hidden">
                <div className="relative h-[340px] overflow-hidden">
                    {banner ? (
                        <img src={banner} alt="" className="absolute inset-0 size-full object-cover opacity-70" draggable={false} />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-600/50 via-indigo-900/40 to-black" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0e] via-[#0c0c0e]/40 to-transparent" />
                    <div className="absolute left-[24px] right-[24px] top-[20px] flex items-center gap-[12px]">
                        <div className="h-[36px] w-[280px] max-w-[50%] rounded-full bg-white/10 ring-1 ring-white/10" />
                        <div className="ml-auto size-[36px] rounded-full bg-white/15" />
                    </div>
                    <div className="absolute bottom-[28px] left-[32px] right-[32px]">
                        <p className="text-[48px] font-extrabold leading-[1.05] tracking-tight text-white">Continue watching</p>
                        <p className="mt-[8px] text-[16px] text-white/60">Episode 7 · 18 min left</p>
                        <div className="mt-[16px] flex gap-[10px]">
                            <div className="h-[40px] w-[132px] rounded-[10px] bg-white" />
                            <div className="h-[40px] w-[112px] rounded-[10px] bg-white/15" />
                        </div>
                    </div>
                </div>
                <div className="px-[32px] pt-[20px]">
                    <p className="mb-[14px] text-[20px] font-semibold text-white">Currently watching</p>
                    <div className="flex gap-[16px]">
                        {cards.map((c, i) => (
                            <div key={i} className="shrink-0" style={{ width: cardW }}>
                                <div className="relative aspect-[6/8] overflow-hidden rounded-[10px] bg-gray-900 ring-1 ring-white/10">
                                    {c
                                        ? <img src={c} alt="" className="absolute inset-0 size-full object-cover" draggable={false} loading="lazy" />
                                        : <div className={cn("absolute inset-0 bg-gradient-to-br", i % 2 ? "from-fuchsia-600/40 to-slate-900" : "from-brand-500/40 to-slate-900")} />}
                                </div>
                                <div className="mt-[8px] h-[12px] w-[85%] rounded-full bg-white/25" />
                                <div className="mt-[6px] h-[10px] w-[50%] rounded-full bg-white/10" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
