"use client"
// Bibata cursor pack provider — applies real PNG cursors with hue-rotation.

import React from "react"
import { useAtomValue } from "jotai"
import { currentProfileAtom } from "@/app/(main)/_atoms/server-status.atoms"
import {
    CURSOR_ENTRIES,
    CURSOR_PACK_MAP,
    CURSOR_STATE_SELECTORS,
    CursorEntry,
    CursorPack,
    DEFAULT_PACK,
    packFilter,
    pngUrl,
} from "@/lib/cursors/cursor-packs"
import { seaStorage } from "@/lib/sea-storage/sea-storage"

// ─── Types ─────────────────────────────────────────────────────────────────

type CursorContextValue = {
    activeCursorId: string
    setActiveCursorId: (id: string) => void
    isApplying: boolean
}

const CursorContext = React.createContext<CursorContextValue>({
    activeCursorId: "default",
    setActiveCursorId: () => {},
    isApplying: false,
})

export function useCursor() {
    return React.useContext(CursorContext)
}

// ─── Blob URL cache ────────────────────────────────────────────────────────
//
// Generating 29 canvas-recoloured PNG blob URLs every time a pack is applied
// would be wasteful. Keep a module-level cache keyed by the filter signature
// so re-applying the same pack (or another pack with identical filter) is
// free.

const filterCache = new Map<string, Map<string, string>>()
//  filter signature -> ( source PNG URL -> blob: URL )

async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load ${src}`))
        img.src = src
    })
}

async function recolorPng(src: string, filter: string): Promise<string> {
    // Fast-path: no filter
    if (filter === "none" || filter === "") {
        return src
    }

    let bucket = filterCache.get(filter)
    if (!bucket) {
        bucket = new Map()
        filterCache.set(filter, bucket)
    }
    const cached = bucket.get(src)
    if (cached) return cached

    const img = await loadImage(src)
    const w = img.naturalWidth || 32
    const h = img.naturalHeight || 32
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return src
    ;(ctx as any).filter = filter
    ctx.drawImage(img, 0, 0, w, h)
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res as any, "image/png"))
    if (!blob) return src
    const url = URL.createObjectURL(blob)
    bucket.set(src, url)
    return url
}

// ─── CSS emission ──────────────────────────────────────────────────────────

function buildCursorCss(urls: Record<string, string>): string {
    const rules: string[] = []
    for (const entry of CURSOR_ENTRIES) {
        const url = urls[entry.state]
        if (!url) continue
        const selector = CURSOR_STATE_SELECTORS[entry.state]
        rules.push(
            `${selector} { cursor: url("${url}") ${entry.hotX} ${entry.hotY}, ${entry.fallback} !important; }`,
        )
    }
    // Glassmorphism perk preserved from the legacy provider.
    rules.push(
        `[class*="bg-"][class*="/"]:not(.UI-AppSidebar__sidebar):not(.UI-AppSidebar__sidebar *) { backdrop-filter: blur(8px) !important; }`,
    )
    return rules.join("\n")
}

async function applyPack(pack: CursorPack, styleEl: HTMLStyleElement): Promise<void> {
    const filter = packFilter(pack)
    const urls: Record<string, string> = {}

    await Promise.all(
        CURSOR_ENTRIES.map(async (entry: CursorEntry) => {
            const src = pngUrl(pack.baseTheme, entry.file)
            try {
                urls[entry.state] = await recolorPng(src, filter)
            } catch {
                // skip on error; fallback CSS keyword will take over
            }
        }),
    )

    styleEl.textContent = buildCursorCss(urls)
}

function clearStyle(styleEl: HTMLStyleElement | null): void {
    if (styleEl) styleEl.textContent = ""
}

// ─── Provider ──────────────────────────────────────────────────────────────

const STYLE_ID = "sea-custom-cursor-style"

export function CursorProvider({ children }: { children: React.ReactNode }) {
    const currentProfile = useAtomValue(currentProfileAtom)
    const profileKey = currentProfile?.id ? String(currentProfile.id) : "default"
    const storageKey = `sea-cursor-${profileKey}`

    const [activeCursorId, setActiveCursorIdRaw] = React.useState<string>(() => {
        if (typeof window === "undefined") return "default"
        try {
            return seaStorage.getItem(storageKey) ?? "default"
        } catch {
            return "default"
        }
    })
    const [isApplying, setIsApplying] = React.useState(false)

    // Reload from storage when profile changes
    React.useEffect(() => {
        try {
            const stored = seaStorage.getItem(storageKey)
            setActiveCursorIdRaw(stored ?? "default")
        } catch { /* noop */ }
    }, [storageKey])

    const setActiveCursorId = React.useCallback((id: string) => {
        setActiveCursorIdRaw(id)
        try {
            seaStorage.setItem(storageKey, id)
        } catch { /* noop */ }
    }, [storageKey])

    // Apply pack CSS to root
    React.useEffect(() => {
        if (typeof document === "undefined") return

        let cancelled = false
        const pack = CURSOR_PACK_MAP[activeCursorId] ?? DEFAULT_PACK

        let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null

        if (pack.id === "default") {
            document.documentElement.style.removeProperty("--sea-cursor")
            styleEl?.remove()
            return
        }

        // Prevent theme-cursor styles from overriding the user-chosen pack.
        const themeCursorStyle = document.getElementById("anime-theme-cursors")
        if (themeCursorStyle) themeCursorStyle.remove()

        if (!styleEl) {
            styleEl = document.createElement("style")
            styleEl.id = STYLE_ID
            document.head.appendChild(styleEl)
        }

        document.documentElement.style.setProperty(
            "--sea-cursor",
            `url("${pngUrl(pack.baseTheme, "arrow")}") 7 2, default`,
        )

        setIsApplying(true)
        applyPack(pack, styleEl).finally(() => {
            if (!cancelled) setIsApplying(false)
        })

        return () => {
            cancelled = true
        }
    }, [activeCursorId])

    return (
        <CursorContext.Provider value={{ activeCursorId, setActiveCursorId, isApplying }}>
            {children}
        </CursorContext.Provider>
    )
}
