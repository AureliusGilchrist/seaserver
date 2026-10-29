import { describe, expect, it } from "vitest"
import {
    DOZE_MIN_PLAYED_MS,
    finishEntry,
    looksDozed,
    noteInput,
    pushHistory,
    recapOrder,
    shortDescription,
    splitShowMore,
    startEntry,
} from "./still-watching-history"

const ep = (n: number) => ({ progressNumber: n, episodeNumber: n })

describe("still-watching history", () => {
    it("flags an episode with no input as dozed, but not a short one", () => {
        const e = startEntry(1, ep(1), 0)
        expect(looksDozed(finishEntry(e, DOZE_MIN_PLAYED_MS + 1))).toBe(true)
        expect(looksDozed(finishEntry(startEntry(1, ep(2), 0), 60_000))).toBe(false)
    })

    it("does not flag an episode with input spread through it", () => {
        const e = startEntry(1, ep(1), 0)
        for (let t = 60_000; t <= 20 * 60_000; t += 60_000) noteInput(e, t)
        expect(looksDozed(finishEntry(e, 21 * 60_000))).toBe(false)
    })

    it("flags input only at the very start", () => {
        const e = startEntry(1, ep(1), 0)
        noteInput(e, 5_000)
        expect(looksDozed(finishEntry(e, 24 * 60_000))).toBe(true)
    })

    it("replaces a replayed episode instead of counting it twice", () => {
        let h = pushHistory([], finishEntry(startEntry(1, ep(1), 0), 10))
        h = pushHistory(h, finishEntry(startEntry(1, ep(2), 20), 30))
        h = pushHistory(h, finishEntry(startEntry(1, ep(1), 40), 50))
        expect(h.map(e => e.episode.progressNumber)).toEqual([2, 1])
    })

    it("orders newest first, dozed ones ahead when asked", () => {
        const awake = (n: number, t: number) => {
            const e = startEntry(1, ep(n), t)
            for (let s = t + 60_000; s < t + 20 * 60_000; s += 60_000) noteInput(e, s)
            return finishEntry(e, t + 20 * 60_000)
        }
        const dozed = finishEntry(startEntry(1, ep(2), 30 * 60_000), 54 * 60_000)
        const h = [awake(1, 0), dozed, awake(3, 60 * 60_000)]
        expect(recapOrder(h, false).map(e => e.episode.progressNumber)).toEqual([3, 2, 1])
        expect(recapOrder(h, true).map(e => e.episode.progressNumber)).toEqual([2, 3, 1])
    })

    it("splits for Show more", () => {
        expect(splitShowMore([1, 2, 3, 4], 2)).toEqual({ shown: [1, 2], hidden: [3, 4] })
        expect(splitShowMore([1], 2)).toEqual({ shown: [1], hidden: [] })
    })

    it("shortens descriptions at a sentence when it can", () => {
        const long = "Ichigo meets Rukia. " + "A very long sentence that keeps going ".repeat(10)
        expect(shortDescription(long, 30)).toBe("Ichigo meets Rukia.")
        expect(shortDescription(long, 60).endsWith("…")).toBe(true)
        expect(shortDescription("<i>Short</i> one.")).toBe("Short one.")
    })
})
