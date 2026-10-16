import { describe, expect, it } from "vitest"
import { vc_initialSettings } from "./video-core.atoms"
import { getDefaultSubtitleTrackNumber, resolveOverrideTrackNumber } from "./video-core-subtitles"

describe("subtitle track selection", () => {
    it("prefers full English subtitles over forced-only English tracks", () => {
        expect(getDefaultSubtitleTrackNumber(vc_initialSettings, [
            { number: 0, label: "English Forced", language: "en", forced: true },
            { number: 1, label: "English", language: "en", default: true },
            { number: 2, label: "Japanese", language: "ja", default: true },
        ])).toBe(1)
    })

    it("does not let a reused generic label override the saved language", () => {
        expect(resolveOverrideTrackNumber(
            { subtitleLabel: "Default", subtitleLanguage: "en" },
            [
                { number: 0, label: "Default", language: "ja" },
                { number: 1, label: "Default", language: "en" },
            ],
        )).toBe(1)
    })

    it("preserves an explicit per-series language choice", () => {
        expect(resolveOverrideTrackNumber(
            { subtitleLanguage: "ja", subtitleLabel: "Japanese" },
            [
                { number: 0, label: "English", language: "en" },
                { number: 1, label: "Japanese", language: "ja" },
            ],
        )).toBe(1)
    })
})
