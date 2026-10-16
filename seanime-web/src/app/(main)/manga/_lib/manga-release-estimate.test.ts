import { describe, expect, it } from "vitest"
import type { HibikeManga_ChapterDetails } from "@/api/generated/types"
import { getMangaReleaseEstimate } from "./manga-release-estimate"

function chapter(number: string, updatedAt: string): HibikeManga_ChapterDetails {
    return {
        provider: "test",
        id: `chapter-${number}`,
        url: "",
        title: `Chapter ${number}`,
        chapter: number,
        index: Number.parseFloat(number),
        updatedAt,
    }
}

describe("getMangaReleaseEstimate", () => {
    it("uses the median of the five most recent release gaps", () => {
        const chapters = [
            chapter("1", "2024-01-01"),
            chapter("2", "2024-01-08"),
            chapter("3", "2024-01-15"),
            chapter("4", "2024-01-22"),
            chapter("5", "2024-02-02"),
            chapter("6", "2024-02-09"),
            chapter("7", "2024-02-16"),
        ]

        const estimate = getMangaReleaseEstimate(chapters, Date.UTC(2024, 1, 16))
        expect(estimate?.intervalDays).toBe(7)
        expect(estimate?.latestChapter).toBe("7")
        expect(estimate?.daysUntilNext).toBe(7)
    })

    it("does not estimate with fewer than three dated intervals", () => {
        expect(getMangaReleaseEstimate([
            chapter("1", "2024-01-01"),
            chapter("2", "2024-01-08"),
            chapter("3", "2024-01-15"),
        ])).toBeNull()
    })

    it("ignores duplicate and invalid release dates", () => {
        const estimate = getMangaReleaseEstimate([
            chapter("1", "2024-01-01"),
            chapter("2", "2024-01-01"),
            chapter("3", "not-a-date"),
            chapter("4", "2024-01-08"),
            chapter("5", "2024-01-15"),
            chapter("6", "2024-01-22"),
        ])
        expect(estimate?.intervalDays).toBe(7)
    })
})
