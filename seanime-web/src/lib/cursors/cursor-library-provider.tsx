"use client"
// CursorLibraryProvider — applies the user's per-slot cursor selections from
// the cursor-library system (separate from the Bibata CursorProvider).
// Injects a single <style id="seanime-cursor-library-overrides"> tag with
// CSS rules built from the selected slots + manifest.

import { useAtomValue } from "jotai"
import { useEffect, useMemo } from "react"
import { selectedSlotsAtom } from "./cursor-atoms"
import type { CursorEntry, CursorSlot } from "./types"
import { useCursorManifest } from "./use-cursor-manifest"

const SLOT_SELECTORS: Record<CursorSlot, string> = {
    default: "html, body",
    pointer: `a, button, [role="button"], .cursor-pointer, [data-cursor="pointer"]`,
    text: `input, textarea, [contenteditable="true"], [data-cursor="text"]`,
    waiting: `[aria-busy="true"], .cursor-wait, [data-cursor="waiting"]`,
    precision: `[data-cursor="precision"]`,
    grab: `[draggable="true"], .cursor-grab, [data-cursor="grab"]`,
    disabled: `[aria-disabled="true"], [disabled], .cursor-not-allowed, [data-cursor="disabled"]`,
}

const SLOT_FALLBACK: Record<CursorSlot, string> = {
    default: "auto",
    pointer: "pointer",
    text: "text",
    waiting: "wait",
    precision: "crosshair",
    grab: "grab",
    disabled: "not-allowed",
}

const STYLE_ID = "seanime-cursor-library-overrides"

export function CursorLibraryProvider() {
    const selected = useAtomValue(selectedSlotsAtom)
    const { data } = useCursorManifest()

    const byId = useMemo(() => {
        const m = new Map<string, CursorEntry>()
        data?.entries.forEach(e => m.set(e.id, e))
        return m
    }, [data])

    useEffect(() => {
        if (typeof document === "undefined") return
        let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
        if (!style) {
            style = document.createElement("style")
            style.id = STYLE_ID
            document.head.appendChild(style)
        }
        const rules: string[] = []
        ;(Object.keys(SLOT_SELECTORS) as CursorSlot[]).forEach(slot => {
            const id = selected[slot]
            if (!id) return
            const entry = byId.get(id)
            if (!entry) return
            const hx = entry.hotspotX || 0
            const hy = entry.hotspotY || 0
            rules.push(
                `${SLOT_SELECTORS[slot]} { cursor: url("${entry.url}") ${hx} ${hy}, ${SLOT_FALLBACK[slot]} !important; }`,
            )
        })
        // Always-on override so video player auto-hide (`.cursor-none` / `[data-cursor="hidden"]`)
        // wins over per-slot cursor URLs and any descendant interactive rules.
        rules.push(
            `.cursor-none, .cursor-none *, [data-cursor="hidden"], [data-cursor="hidden"] * { cursor: none !important; }`,
        )
        style.textContent = rules.join("\n")
    }, [selected, byId])

    return null
}
