import { describe, expect, it } from "vitest"
import { formatHour, isInCheckWindow, normalizeHalfHour } from "./still-watching-timing"

describe("still-watching timing", () => {
    it("snaps and wraps half-hour positions", () => {
        expect(normalizeHalfHour(9.24)).toBe(9)
        expect(normalizeHalfHour(9.25)).toBe(9.5)
        expect(normalizeHalfHour(24)).toBe(0)
        expect(normalizeHalfHour(-0.5)).toBe(23.5)
    })

    it("formats half-hour times around midnight and noon", () => {
        expect(formatHour(0)).toBe("12 am")
        expect(formatHour(0.5)).toBe("12:30 am")
        expect(formatHour(12)).toBe("noon")
        expect(formatHour(12.5)).toBe("12:30 pm")
        expect(formatHour(23.5)).toBe("11:30 pm")
    })

    it("honors half-hour boundaries for daytime and overnight windows", () => {
        expect(isInCheckWindow(9 + 29 / 60, 9.5, 17.5)).toBe(false)
        expect(isInCheckWindow(9.5, 9.5, 17.5)).toBe(true)
        expect(isInCheckWindow(17.5, 9.5, 17.5)).toBe(false)
        expect(isInCheckWindow(20.5, 20.5, 9.5)).toBe(true)
        expect(isInCheckWindow(9 + 29 / 60, 20.5, 9.5)).toBe(true)
        expect(isInCheckWindow(9.5, 20.5, 9.5)).toBe(false)
        expect(isInCheckWindow(14, 9.5, 9.5)).toBe(true)
    })
})
