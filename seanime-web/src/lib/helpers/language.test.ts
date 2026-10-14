import { describe, expect, it } from "vitest"
import { trackMatchesLanguage } from "./language"

describe("trackMatchesLanguage", () => {
    it("matches English names and ISO aliases", () => {
        expect(trackMatchesLanguage({ language: "English" }, "en")).toBe(true)
        expect(trackMatchesLanguage({ language: "en-US" }, "english")).toBe(true)
        expect(trackMatchesLanguage({ label: "English (Signs & Songs)" }, "eng")).toBe(true)
    })

    it("does not match a different track language", () => {
        expect(trackMatchesLanguage({ language: "Japanese", label: "Japanese" }, "en")).toBe(false)
    })
})
