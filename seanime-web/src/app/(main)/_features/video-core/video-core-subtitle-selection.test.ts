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

    it("does not fall back to a signs/songs track when the saved label was renamed between episodes", () => {
        // Real case (Komi-san, season 1): the user picked the dialogue track on one episode;
        // the next batch renamed it ("Dialogue@EMBER+NekoYu" → "Dialogue@NekoYu+EMBER") and the
        // signs/songs track is listed first. The old fallback took the first English track.
        expect(resolveOverrideTrackNumber(
            { subtitleLanguage: "en", subtitleLabel: "Dialogue@EMBER+NekoYu" },
            [
                { number: 0, label: "Signs & Songs@EMBER", language: "en" },
                { number: 1, label: "Dialogue@NekoYu+EMBER", language: "en" },
                { number: 2, label: "NF", language: "en" },
            ],
        )).toBe(1)
    })

    it("prefers a similarly-named full track over a signs/songs track", () => {
        expect(resolveOverrideTrackNumber(
            { subtitleLanguage: "en", subtitleLabel: "English [Full] (FFF/DDY modified)" },
            [
                { number: 0, label: "Signs & Songs", language: "en" },
                { number: 1, label: "English - Full", language: "en" },
            ],
        )).toBe(1)
    })

    it("still honors a saved signs/songs track", () => {
        expect(resolveOverrideTrackNumber(
            { subtitleLanguage: "en", subtitleLabel: "Signs & Songs@EMBER" },
            [
                { number: 0, label: "Signs & Songs@EMBER", language: "en" },
                { number: 1, label: "Dialogue@EMBER", language: "en" },
            ],
        )).toBe(0)
    })

    it("falls back to the first same-language track when no label resembles the saved one", () => {
        expect(resolveOverrideTrackNumber(
            { subtitleLanguage: "en", subtitleLabel: "Something completely different" },
            [
                { number: 0, label: "English", language: "en" },
                { number: 1, label: "Other", language: "en" },
            ],
        )).toBe(0)
    })
})
