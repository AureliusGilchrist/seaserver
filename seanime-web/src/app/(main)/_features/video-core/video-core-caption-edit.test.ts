import { describe, expect, it } from "vitest"
import { captionPlainText, captionRawText, parseCaptionCues, parseEditableTrack } from "./_lib/caption-cues"

describe("quick edit captions", () => {
    it("reads ASS cues with commas in the text", () => {
        const ass = [
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
            "Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\an8}Hello, there\\Nfriend",
        ].join("\r\n")
        const [cue] = parseCaptionCues(ass, "ass")
        expect(cue).toEqual({ start: 1, end: 3.5, raw: "{\\an8}Hello, there\\Nfriend" })
        expect(captionPlainText(cue.raw, "ass")).toBe("Hello, there\nfriend")
        expect(captionRawText(cue.raw, "Hi\nyou", "ass")).toBe("{\\an8}Hi\\Nyou")
    })

    it("reads SRT cues", () => {
        const srt = "1\n00:00:01,000 --> 00:00:02,500\nA\nB\n\n2\n00:01:00,000 --> 00:01:01,000\nC\n"
        expect(parseCaptionCues(srt, "srt")).toEqual([
            { start: 1, end: 2.5, raw: "A\nB" },
            { start: 60, end: 61, raw: "C" },
        ])
    })

    it("only offers local-player tracks", () => {
        expect(parseEditableTrack("http://h:43211/api/v1/mediastream/subs/abc-1/2.ass")).toEqual({ clientId: "abc-1", trackIndex: 2, ext: "ass" })
        expect(parseEditableTrack("https://cdn.example/sub.vtt")).toBeNull()
    })
})
