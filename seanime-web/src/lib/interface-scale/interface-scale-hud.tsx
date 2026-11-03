"use client"
import { INTERFACE_SCALE_MAX, INTERFACE_SCALE_MIN, onInterfaceScaleShortcut } from "@/lib/interface-scale/interface-scale"
import React from "react"
import { createPortal } from "react-dom"

/**
 * The little pill that says the new size after a Ctrl +/−/0, so the shortcut never feels like an
 * accident.
 */
export function InterfaceScaleHud() {
    const [state, setState] = React.useState<{ scale: number, key: number } | null>(null)
    const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)

    React.useEffect(() => onInterfaceScaleShortcut(scale => {
        clearTimeout(timer.current)
        setState(prev => ({ scale, key: (prev?.key ?? 0) + 1 }))
        timer.current = setTimeout(() => setState(null), 1400)
    }), [])
    React.useEffect(() => () => clearTimeout(timer.current), [])

    if (!state) return null
    const pct = ((state.scale - INTERFACE_SCALE_MIN) / (INTERFACE_SCALE_MAX - INTERFACE_SCALE_MIN)) * 100

    return createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[9999] flex justify-center" role="status" aria-live="polite">
            <div
                key={state.key}
                className="flex items-center gap-3 rounded-full border border-white/10 bg-black/75 py-2 pl-4 pr-5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
            >
                <span className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white/60">Interface size</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                    <span
                        className="block h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-300 transition-[width] duration-200"
                        style={{ width: `${pct}%` }}
                    />
                </span>
                <span className="min-w-[3ch] text-sm font-semibold tabular-nums text-white">{state.scale}%</span>
            </div>
        </div>,
        document.body,
    )
}
