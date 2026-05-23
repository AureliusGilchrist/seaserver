export type CursorSlot = "default" | "pointer" | "text" | "waiting" | "precision" | "grab" | "disabled"

export const CURSOR_SLOTS: CursorSlot[] = ["default", "pointer", "text", "waiting", "precision", "grab", "disabled"]

export const CURSOR_SLOT_LABELS: Record<CursorSlot, string> = {
    default: "Default",
    pointer: "Pointer",
    text: "Text",
    waiting: "Waiting",
    precision: "Precision",
    grab: "Grab",
    disabled: "Disabled",
}

export type CursorTab = "static" | "regular" | "games" | "animated" | "anime"

export const CURSOR_TABS: CursorTab[] = ["static", "regular", "games", "animated", "anime"]

export const CURSOR_TAB_LABELS: Record<CursorTab, string> = {
    static: "Static Images",
    regular: "Regular Cursors",
    games: "Games",
    animated: "Animated Cursors",
    anime: "Anime Cursors",
}

export interface CursorEntry {
    id: string
    tab: CursorTab
    file: string
    url: string
    slug: string
    name: string
    level: number
    isFinal: boolean
    isAnimated: boolean
    states: string[]
    hotspotX: number
    hotspotY: number
    mimeType: string
    seriesSlug?: string
    lore?: string
}

export interface CursorLibraryManifest {
    entries: CursorEntry[]
    slots: CursorSlot[]
}

export type SelectedSlots = Partial<Record<CursorSlot, string>>
