"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import {
    UI_CUSTOMIZE_CATEGORIES,
    UI_CUSTOMIZE_DEFAULTS,
    type UICustomizeState,
    type UICustomizeCategoryId,
} from "./ui-customize-definitions"
import { applyRootCssVars } from "@/lib/helpers/css"

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
            const raw = localStorage.getItem(storageKey)
            if (!raw) return UI_CUSTOMIZE_DEFAULTS
            return { ...UI_CUSTOMIZE_DEFAULTS, ...(JSON.parse(raw) as Partial<UICustomizeState>) }
        } catch {
            return UI_CUSTOMIZE_DEFAULTS
        }
    })

    // Reload on profile switch
    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey)
            setState(raw ? { ...UI_CUSTOMIZE_DEFAULTS, ...(JSON.parse(raw) as Partial<UICustomizeState>) } : UI_CUSTOMIZE_DEFAULTS)
        } catch {}
    }, [storageKey])

    // Apply all active CSS vars whenever state changes
    React.useEffect(() => {
        for (const category of UI_CUSTOMIZE_CATEGORIES) {
            const activeId = state[category.id as UICustomizeCategoryId]
            const preset = (category.presets as readonly any[]).find(p => p.id === activeId)
            if (preset?.cssVars) {
                applyRootCssVars(preset.cssVars as Record<string, string>)
            }
            // Apply body class if any
            if (preset?.bodyClass) {
                document.body.classList.add(preset.bodyClass)
            }
        }

        // Apply scrollbar via CSS
        applyScrollbarStyle(state.scrollbar)
    }, [state])

    const setPreset = React.useCallback((category: UICustomizeCategoryId, presetId: string) => {
        setState(prev => {
            const next = { ...prev, [category]: presetId }
            try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
            return next
        })
    }, [storageKey])

    const setAllState = React.useCallback((next: Partial<UICustomizeState>) => {
        setState(prev => {
            const merged = { ...prev, ...next }
            try { localStorage.setItem(storageKey, JSON.stringify(merged)) } catch {}
            return merged
        })
    }, [storageKey])

    const getActivePreset = React.useCallback((category: UICustomizeCategoryId) => {
        return state[category]
    }, [state])

    return (
        <UICustomizeContext.Provider value={{ state, setPreset, setAllState, getActivePreset }}>
            {children}
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
