import { describe, expect, it } from "vitest"
import { dedupeSidebarIcons, SIDEBAR_FALLBACK_ICONS } from "./sidebar-overrides"

const A = () => null
const B = () => null

describe("dedupeSidebarIcons", () => {
    it("keeps the first use and gives later repeats distinct fallbacks", () => {
        const used = new Set<unknown>()
        const out = dedupeSidebarIcons([{ id: "x", iconType: A }, { id: "y", iconType: A }, { id: "z", iconType: A }, { id: "w", iconType: B }], used)
        expect(out[0].iconType).toBe(A)
        expect(out[1].iconType).toBe(SIDEBAR_FALLBACK_ICONS[0])
        expect(out[2].iconType).toBe(SIDEBAR_FALLBACK_ICONS[1])
        expect(out[3].iconType).toBe(B)
        expect(new Set(out.map(i => i.iconType)).size).toBe(4)
    })

    it("carries claims across lists and skips fallbacks already on the sidebar", () => {
        const used = new Set<unknown>()
        dedupeSidebarIcons([{ iconType: A }, { iconType: SIDEBAR_FALLBACK_ICONS[0] }], used)
        const [out] = dedupeSidebarIcons([{ iconType: A }], used)
        expect(out.iconType).toBe(SIDEBAR_FALLBACK_ICONS[1])
    })

    it("never swaps a locked entry's icon", () => {
        const used = new Set<unknown>([A])
        const [out] = dedupeSidebarIcons([{ id: "sync", iconType: A }], used)
        expect(out.iconType).toBe(A)
    })
})
