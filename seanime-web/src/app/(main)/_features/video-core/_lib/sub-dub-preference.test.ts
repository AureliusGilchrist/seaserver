import { describe, expect, it } from "vitest"
import { vc_initialSettings } from "../video-core.atoms"
import { applySubDubPreference, isSignsTrack } from "./sub-dub-preference"

describe("sub or dub", () => {
    it("leaves the player's preferences alone for sub", () => {
        expect(applySubDubPreference(vc_initialSettings, "sub", "signs")).toBe(vc_initialSettings)
    })

    it("puts English audio first for dub, keeping the rest", () => {
        const s = applySubDubPreference(vc_initialSettings, "dub", "full")
        expect(s.preferredAudioLanguage.startsWith("eng,en,english")).toBe(true)
        expect(s.preferredAudioLanguage).toContain("jpn")
        expect(s.preferredSubtitleLanguage).toBe(vc_initialSettings.preferredSubtitleLanguage)
    })

    it("turns subtitles off for dub + off", () => {
        expect(applySubDubPreference(vc_initialSettings, "dub", "off").preferredSubtitleLanguage).toBe("none")
    })

    it("recognises signs & songs tracks", () => {
        expect(isSignsTrack({ label: "Signs & Songs" })).toBe(true)
        expect(isSignsTrack({ label: "English [Forced]" })).toBe(true)
        expect(isSignsTrack({ label: "Full Subtitles", forced: true })).toBe(true)
        expect(isSignsTrack({ label: "English" })).toBe(false)
    })

    it("marks the settings for signs-only with dub + signs", () => {
        expect(applySubDubPreference(vc_initialSettings, "dub", "signs").subtitleSignsOnly).toBe(true)
    })
})
