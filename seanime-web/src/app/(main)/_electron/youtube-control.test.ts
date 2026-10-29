import { describe, expect, it } from "vitest"
import { controlYoutubeFrame, youtubeControlScript } from "./youtube-control"

describe("youtube control", () => {
    it("is self-contained, so Denshi can run it inside the trailer page", () => {
        const fn = new Function(`return (${controlYoutubeFrame.toString()})`)()
        expect(typeof fn).toBe("function")
        expect(youtubeControlScript({ sound: true, volume: 40, fadeMs: 2500 })).toContain("\"fadeMs\":2500")
    })

    it("does nothing without a frame", () => {
        expect(typeof controlYoutubeFrame(null, { sound: true, volume: 40, fadeMs: 2500 })).toBe("function")
    })
})
