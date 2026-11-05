import { beforeEach, describe, expect, it } from "vitest"

// Minimal storage for the node test environment.
function memoryStorage(): Storage {
    let data: Record<string, string> = {}
    return {
        get length() { return Object.keys(data).length },
        clear: () => { data = {} },
        getItem: (k: string) => (k in data ? data[k] : null),
        key: (i: number) => Object.keys(data)[i] ?? null,
        removeItem: (k: string) => { delete data[k] },
        setItem: (k: string, v: string) => { data[k] = String(v) },
    }
}

Object.assign(globalThis, { localStorage: memoryStorage(), sessionStorage: memoryStorage() })

const { bridgePlayedProgress, markEpisodePlayed, wasEpisodePlayed } = await import("./progress-queue")

describe("bridgePlayedProgress", () => {
    beforeEach(() => localStorage.clear())

    it("counts a played episode whose update was lost, so the next one is a normal +1", () => {
        // AniList at 4, episode 5 was played but never counted, now finishing 6.
        markEpisodePlayed(1, 5)
        expect(bridgePlayedProgress(1, 4, 6)).toBe(5)
    })

    it("leaves a real skip alone", () => {
        // Jumped from 4 to 8 without playing 5–7.
        expect(bridgePlayedProgress(1, 4, 8)).toBe(4)
    })

    it("bridges only up to the first episode that was not played", () => {
        markEpisodePlayed(1, 5)
        markEpisodePlayed(1, 7)
        expect(bridgePlayedProgress(1, 4, 8)).toBe(5)
    })

    it("never counts the episode being finished itself", () => {
        markEpisodePlayed(1, 5)
        expect(bridgePlayedProgress(1, 4, 5)).toBe(4)
    })

    it("keeps media apart", () => {
        markEpisodePlayed(2, 5)
        expect(wasEpisodePlayed(1, 5)).toBe(false)
        expect(bridgePlayedProgress(1, 4, 6)).toBe(4)
    })
})
