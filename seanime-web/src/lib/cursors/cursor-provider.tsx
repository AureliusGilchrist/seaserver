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

        const styleId = "sea-custom-cursor-style"
        let styleEl = document.getElementById(styleId) as HTMLStyleElement | null

        if (cursorCss === "auto" || cursorCss === "default") {
            document.documentElement.style.removeProperty("--sea-cursor")
            styleEl?.remove()
        } else {
            // Remove any theme cursor style so the reward-shop cursor wins
            const themeCursorStyle = document.getElementById("anime-theme-cursors")
            if (themeCursorStyle) themeCursorStyle.remove()
            document.documentElement.style.setProperty("--sea-cursor", cursorCss)
            if (!styleEl) {
                styleEl = document.createElement("style")
                styleEl.id = styleId
                document.head.appendChild(styleEl)
            }
            styleEl.textContent = [
                `*, *:hover, *:active, *:focus { cursor: ${cursorCss} !important; }`,
                // Glassmorphism: apply backdrop-blur to elements with semi-transparent Tailwind backgrounds
                // Exclude the sidebar and all its descendants
                `[class*="bg-"][class*="/"]:not(.UI-AppSidebar__sidebar):not(.UI-AppSidebar__sidebar *) { backdrop-filter: blur(8px) !important; }`,
            ].join("\n")
        }

        return () => {
            document.documentElement.style.removeProperty("--sea-cursor")
            document.getElementById(styleId)?.remove()
        }
    }, [activeCursorId])

    return (
        <CursorContext.Provider value={{ activeCursorId, setActiveCursorId }}>
            {children}
        </CursorContext.Provider>
    )
}
