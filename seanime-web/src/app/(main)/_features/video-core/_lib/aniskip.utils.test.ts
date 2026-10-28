import { describe, expect, it } from "vitest"
import { mergeSkipData } from "./aniskip.utils"

const aniSkip = (startTime: number, endTime: number, skipType: "op" | "ed") => ({
    interval: { startTime, endTime },
    skipType,
    skipId: `aniskip-${skipType}`,
    episodeLength: 1420,
})

describe("mergeSkipData", () => {
    it("uses AniSkip's OP and the provider's ED when AniSkip has no ED", () => {
        const merged = mergeSkipData(
            { op: aniSkip(60, 150, "op"), ed: null },
            { intro: { start: 62, end: 152 }, outro: { start: 1300, end: 1390 } },
        )
        expect(merged.op?.skipId).toBe("aniskip-op")
        expect(merged.ed?.skipId).toBe("provider-outro")
        expect(merged.ed?.interval).toEqual({ startTime: 1300, endTime: 1390 })
    })

    it("uses the provider's OP and AniSkip's ED when AniSkip has no OP", () => {
        const merged = mergeSkipData(
            { op: null, ed: aniSkip(1290, 1380, "ed") },
            { intro: { start: 0, end: 90 }, outro: { start: 1300, end: 1390 } },
        )
        expect(merged.op?.skipId).toBe("provider-intro")
        expect(merged.op?.interval).toEqual({ startTime: 0, endTime: 90 })
        expect(merged.ed?.skipId).toBe("aniskip-ed")
    })

    it("prefers AniSkip for both when it has both", () => {
        const merged = mergeSkipData(
            { op: aniSkip(60, 150, "op"), ed: aniSkip(1290, 1380, "ed") },
            { intro: { start: 0, end: 90 }, outro: { start: 1300, end: 1390 } },
        )
        expect(merged.op?.skipId).toBe("aniskip-op")
        expect(merged.ed?.skipId).toBe("aniskip-ed")
    })

    it("falls back to the provider entirely without AniSkip data", () => {
        const merged = mergeSkipData(undefined, { intro: { start: 0, end: 90 } })
        expect(merged.op?.skipId).toBe("provider-intro")
        expect(merged.ed).toBeNull()
    })

    it("returns nothing when neither source has data", () => {
        expect(mergeSkipData({ op: null, ed: null }, undefined)).toEqual({ op: null, ed: null })
    })

    it("ignores invalid provider intervals", () => {
        const merged = mergeSkipData(null, { intro: { start: 100, end: 50 }, outro: { start: 0, end: 0 } })
        expect(merged).toEqual({ op: null, ed: null })
    })

    it("drops a provider ED that overlaps AniSkip's OP", () => {
        const merged = mergeSkipData(
            { op: aniSkip(60, 150, "op"), ed: null },
            { outro: { start: 100, end: 200 } },
        )
        expect(merged.op?.skipId).toBe("aniskip-op")
        expect(merged.ed).toBeNull()
    })
})
