"use client"

import React from "react"
import { useAtomValue } from "jotai"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import { CURSOR_MAP } from "@/lib/cursors/cursor-definitions"

type CursorContextValue = {
    activeCursorId: string
    setActiveCursorId: (id: string) => void
}

const CursorContext = React.createContext<CursorContextValue>({
    activeCursorId: "default",
    setActiveCursorId: () => {},
})

export function useCursor() {
    return React.useContext(CursorContext)
}

export function CursorProvider({ children }: { children: React.ReactNode }) {
    const currentProfile = useAtomValue(currentProfileAtom)
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"
    const storageKey = `sea-cursor-${profileKey}`

    const [activeCursorId, setActiveCursorIdRaw] = React.useState<string>(() => {
        if (typeof window === "undefined") return "default"
        try {
            return localStorage.getItem(storageKey) ?? "default"
        } catch {
            return "default"
        }
    })

    // Reload from storage when profile changes
    React.useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey)
            setActiveCursorIdRaw(stored ?? "default")
        } catch { /* noop */ }
    }, [storageKey])

    const setActiveCursorId = React.useCallback((id: string) => {
        setActiveCursorIdRaw(id)
        try {
            localStorage.setItem(storageKey, id)
        } catch { /* noop */ }
    }, [storageKey])

    // Apply cursor CSS to root
    React.useEffect(() => {
        const def = CURSOR_MAP[activeCursorId]
        const cursorCss = def?.cursorCss ?? "auto"

        if (cursorCss === "auto" || cursorCss === "default") {
            document.documentElement.style.removeProperty("cursor")
            // Also clear on all interactive elements
            document.documentElement.style.setProperty("--sea-cursor", "auto")
        } else {
            document.documentElement.style.setProperty("cursor", cursorCss)
            document.documentElement.style.setProperty("--sea-cursor", cursorCss)
        }

        return () => {
            document.documentElement.style.removeProperty("cursor")
            document.documentElement.style.removeProperty("--sea-cursor")
        }
    }, [activeCursorId])

    return (
        <CursorContext.Provider value={{ activeCursorId, setActiveCursorId }}>
            {children}
        </CursorContext.Provider>
    )
}
