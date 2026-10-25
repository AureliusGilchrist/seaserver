"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { MouseTrail } from "./mouse-trail"
import {
    IDLE_PRESETS,
    MOUSE_TRAIL_PRESETS,
    UI_CUSTOMIZE_CATEGORIES,
    UI_CUSTOMIZE_DEFAULTS,
    type UICustomizeState,
    type UICustomizeCategoryId,
} from "./ui-customize-definitions"
import { applyRootCssVars } from "@/lib/helpers/css"
import { seaStorage } from "@/lib/sea-storage/sea-storage"

interface UICustomizeContextValue {
    state: UICustomizeState
    setPreset: (category: UICustomizeCategoryId, presetId: string) => void
    setAllState: (next: Partial<UICustomizeState>) => void
    getActivePreset: (category: UICustomizeCategoryId) => string
}

const UICustomizeContext = React.createContext<UICustomizeContextValue>({
    state: UI_CUSTOMIZE_DEFAULTS,
    setPreset: () => {},
    setAllState: () => {},
    getActivePreset: () => "",
})

export function useUICustomize() {
    return React.useContext(UICustomizeContext)
}

export function UICustomizeProvider({ children }: { children: React.ReactNode }) {
    const currentProfile = useAtomValue(currentProfileAtom)
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"
    const storageKey = `sea-ui-customize-${profileKey}`

    const [state, setState] = React.useState<UICustomizeState>(() => {
        if (typeof window === "undefined") return UI_CUSTOMIZE_DEFAULTS
        try {
            const raw = seaStorage.getItem(storageKey)
            if (!raw) return UI_CUSTOMIZE_DEFAULTS
            return { ...UI_CUSTOMIZE_DEFAULTS, ...(JSON.parse(raw) as Partial<UICustomizeState>) }
        } catch {
            return UI_CUSTOMIZE_DEFAULTS
        }
    })

    // Reload on profile switch
    React.useEffect(() => {
        try {
            const raw = seaStorage.getItem(storageKey)
            setState(raw ? { ...UI_CUSTOMIZE_DEFAULTS, ...(JSON.parse(raw) as Partial<UICustomizeState>) } : UI_CUSTOMIZE_DEFAULTS)
        } catch {}
    }, [storageKey])

    // Variables and body classes the previous presets set, so switching presets clears what the old
    // one set instead of leaving it behind (e.g. "Elevated" left its card shadow on "Glass").
    const appliedVarsRef = React.useRef<Set<string>>(new Set())
    const appliedClassesRef = React.useRef<Set<string>>(new Set())

    // Apply all active CSS vars whenever state changes
    React.useEffect(() => {
        const root = document.documentElement
        const nextVars: Record<string, string> = {}
        const nextClasses = new Set<string>()
        for (const category of UI_CUSTOMIZE_CATEGORIES) {
            const activeId = state[category.id as UICustomizeCategoryId]
            const preset = (category.presets as readonly any[]).find(p => p.id === activeId)
            if (preset?.cssVars) Object.assign(nextVars, preset.cssVars as Record<string, string>)
            if (preset?.bodyClass) nextClasses.add(preset.bodyClass)
            // Every category is also exposed as data-sea-<category>="<preset id>", which is what the
            // CSS for presets that are more than a variable (layouts, top bar, toasts, …) keys on.
            if (activeId) root.setAttribute(`data-sea-${category.id}`, String(activeId))
            else root.removeAttribute(`data-sea-${category.id}`)
        }

        for (const key of appliedVarsRef.current) {
            if (!(key in nextVars)) root.style.removeProperty(key)
        }
        applyRootCssVars(nextVars)
        appliedVarsRef.current = new Set(Object.keys(nextVars))

        for (const cls of appliedClassesRef.current) {
            if (!nextClasses.has(cls)) document.body.classList.remove(cls)
        }
        nextClasses.forEach(cls => document.body.classList.add(cls))
        appliedClassesRef.current = nextClasses

        // Apply scrollbar via CSS
        applyScrollbarStyle(state.scrollbar)

        // Lets CSS apply the card preset only when a non-default style is chosen
        document.documentElement.dataset.seaCardStyle = state.cards === "card-default" ? "" : state.cards
    }, [state])

    useIdleDim(state.idle)

    const setPreset = React.useCallback((category: UICustomizeCategoryId, presetId: string) => {
        setState(prev => {
            const next = { ...prev, [category]: presetId }
            try { seaStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
            return next
        })
    }, [storageKey])

    const setAllState = React.useCallback((next: Partial<UICustomizeState>) => {
        setState(prev => {
            const merged = { ...prev, ...next }
            try { seaStorage.setItem(storageKey, JSON.stringify(merged)) } catch {}
            return merged
        })
    }, [storageKey])

    const getActivePreset = React.useCallback((category: UICustomizeCategoryId) => {
        return state[category]
    }, [state])

    return (
        <UICustomizeContext.Provider value={{ state, setPreset, setAllState, getActivePreset }}>
            {children}
            <MouseTrail kind={(MOUSE_TRAIL_PRESETS.find(p => p.id === state.trail)?.cssVars?.["--sea-trail"]) ?? "none"} />
        </UICustomizeContext.Provider>
    )
}

function applyScrollbarStyle(presetId: string) {
    const styleId = "sea-scrollbar-style"
    let el = document.getElementById(styleId) as HTMLStyleElement | null
    if (!el) {
        el = document.createElement("style")
        el.id = styleId
        document.head.appendChild(el)
    }

    const width = getComputedStyle(document.documentElement).getPropertyValue("--sea-scrollbar-width").trim() || "auto"
    const color = getComputedStyle(document.documentElement).getPropertyValue("--sea-scrollbar-color").trim() || "auto"

    if (width === "auto" || width === "") {
        el.textContent = ""
        return
    }

    el.textContent = `
        * { scrollbar-width: thin; scrollbar-color: ${color}; }
        *::-webkit-scrollbar { width: ${width}; height: ${width}; }
        *::-webkit-scrollbar-track { background: transparent; }
        *::-webkit-scrollbar-thumb { background-color: ${color.split(" ")[0]}; border-radius: 9999px; }
    `
}

/**
 * Idle Dim: after the chosen minutes without mouse, keyboard or touch input, sets
 * html[data-sea-idle-active] (globals.css draws the dimming layer). Any input lifts it. Never dims
 * while a video is playing.
 */
function useIdleDim(presetId: string) {
    React.useEffect(() => {
        const preset = IDLE_PRESETS.find(p => p.id === presetId)
        const minutes = Number(preset?.cssVars?.["--sea-idle-minutes"] ?? 0)
        const root = document.documentElement
        root.removeAttribute("data-sea-idle-active")
        if (!minutes) return

        let timer: ReturnType<typeof setTimeout> | null = null
        const isPlaying = () => Array.from(document.querySelectorAll("video")).some(v => !v.paused && !v.ended)
        const arm = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(function check() {
                if (isPlaying()) {
                    timer = setTimeout(check, 30_000)
                    return
                }
                root.setAttribute("data-sea-idle-active", "")
            }, minutes * 60_000)
        }
        const wake = () => {
            root.removeAttribute("data-sea-idle-active")
            arm()
        }
        const events = ["mousemove", "mousedown", "keydown", "wheel", "touchstart"] as const
        events.forEach(e => window.addEventListener(e, wake, { passive: true }))
        arm()
        return () => {
            if (timer) clearTimeout(timer)
            events.forEach(e => window.removeEventListener(e, wake))
            root.removeAttribute("data-sea-idle-active")
        }
    }, [presetId])
}
