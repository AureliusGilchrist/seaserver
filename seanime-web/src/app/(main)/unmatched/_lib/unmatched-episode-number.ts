// Episode-number extraction from a release file name.
//
// This is the TypeScript twin of extractEpisodeNumber in internal/unmatched/repository.go. Both
// copies must agree — the Unmatched screen (server) and this match modal (client) each read the
// same file names — so both are pinned to the same behaviour by one shared fixture,
// internal/unmatched/testdata/episode_number_cases.json. When a pattern needs fixing, fix it in
// both files and add the shape that exposed the gap to the fixture. Run
// `npm run test` here (or `go test ./internal/unmatched/` on the Go side) to check.

// Channel layouts — "5.1", "2.0", "7.1.4" — numbers that are never episodes. Applied before dots
// become separators, while the pair is still recognisable, and anchored at the end so that a decimal
// like "2.15" is left alone.
const EP_AUDIO_CHANNELS = /[1257]\.1\.\d\b|(?:2\.[01]|5\.1|7\.1|1\.0)\b/g

// Everything stripped before any number is read. Each pattern is replaced with a space, so the
// remaining text keeps its word boundaries.
const EP_NAME_NOISE: RegExp[] = [
    /\b\d{3,4}\s*x\s*\d{3,4}\b/g,                                        // 1920x1080
    /\b\d{3,4}p\b/g,                                                     // 1080p, 720p
    /\b[48]k\b/g,                                                        // 4k, 8k
    /\b(?:hi)?\d{1,2}[- ]?bit\b/g,                                       // 10bit, 8-bit
    /\b(?:ma|hi)\d{1,2}p\b/g,                                            // Ma10p, Hi10p
    /\b[hx][. ]?26[45]\b/g,                                              // x264, h.265
    /\b(?:hevc|avc|av1|xvid|divx|vp9)\b/g,                               // video codecs
    /\b(?:aac|ac3|eac3|dts|flac|opus|truehd|ddp|dd|mp3|pcm|vorbis)\d?\b/g, // audio codecs
    /\b(?:blu[ -]?ray|bdrip|brrip|bd|web[ -]?dl|webdl|webrip|web|hdtv|dvdrip|dvd|remux|hdrip|uhd|hd|fhd)\b/g,
    /\b(?:multi[ -]?subs?|dual[ -]?audio|uncensored|batch|complete|repack|proper)\b/g,
    /\b(?:ncop|nced|op\d{1,2}|ed\d{1,2})\b/g, // creditless opening/ending markers
    /\bv\d{1,2}\b/g,                          // version tags
    /\b(?:19|20)\d{2}\b/g,                    // years
    /\b(?:season|part|cour)\s*\d{0,2}\b/g,    // season markers
    /\bs\s*\d{1,2}\b/g,                       // "S2", kept apart from "S01E05"
    /\b\d{1,2}(?:st|nd|rd|th)\b/g,            // 2nd, 3rd
]

// The candidate tiers, in the order they are tried.
const EP_SXXEXX = /\bs\s*\d{1,2}\s*(?:e|ep)\s*#?\s*(\d{1,4})(?:v\d+)?/         // S01E05
const EP_NXN = /\b\d{1,2}\s*x\s*(\d{1,3})(?:v\d+)?\b/                          // 1x05
const EP_CJK = /第\s*(\d{1,4})\s*[话話集]/                                      // 第05话
const EP_LABELLED = /\b(?:episode|special|ep|sp|ova|e)\s*#?\s*(\d{1,4})(?:v\d+)?\b/ // Episode 5, EP24, E05, OVA 2, SP 5
const EP_HASH_NUMBER = /#\s*(\d{1,4})(?:v\d+)?\b/                              // #05
const EP_RANGE = /\b(\d{2,4})-(\d{1,4})\b/g                                    // 01-02
const EP_AFTER_DASH = /-\s*(\d{1,4})(?:v\d+)?\b/g                              // "Title - 05"
const EP_TRAILING = /(\d{1,4})(?:v\d+)?\s*(?:end|final)?\s*$/g                 // "Show 03"
const EP_STANDALONE = /(?:^|\s)(\d{1,4})(?:v\d+)?\b/g                          // any standalone number

function epNumber(captured: string | undefined): number {
    const num = parseInt(captured ?? "", 10)
    if (!Number.isFinite(num) || num <= 0 || num > 9999) return 0
    return num
}

// The first number a pattern captures, or 0.
function epFirst(s: string, re: RegExp): number {
    const m = s.match(re)
    return m ? epNumber(m[1]) : 0
}

// The last captured number that passes the filter — a release's episode number sits after its
// title, so when several candidates remain, the last one is the likeliest.
function epLast(s: string, re: RegExp, reject?: (num: number) => boolean): number {
    const matches = [...s.matchAll(re)]
    for (let i = matches.length - 1; i >= 0; i--) {
        const num = epNumber(matches[i][1])
        if (num === 0 || (reject && reject(num))) continue
        return num
    }
    return 0
}

// Whether a bare number is one of the standard video widths. It only rules a number out where there
// is nothing vouching for it: "One Piece - 1080" is an episode, but a lone "1080" at the end of a
// name is a resolution that lost its "p".
function epResolutionLike(num: number): boolean {
    return [360, 480, 540, 576, 720, 1080, 1440, 2160].includes(num)
}

// Extract episode number from a file name, or null when there is none to read.
export function extractEpisodeNumber(filename: string): number | null {
    let base = filename.split(/[/\\]/).pop() ?? filename
    const dot = base.lastIndexOf(".")
    if (dot >= 0) base = base.slice(0, dot)

    // Lowercased, with every separator that only ever stands between tokens normalised to a space —
    // underscores, dots, and the dashes that are not hyphens. "Show.E05.1080p" and "Show E05 1080p"
    // are then the same string, and one set of patterns reads both.
    let s = base.toLowerCase()
    s = s.replace(EP_AUDIO_CHANNELS, " ")
    s = s.replace(/[_.]/g, " ").replace(/[–—]/g, "-")

    for (const re of EP_NAME_NOISE) {
        s = s.replace(re, " ")
    }

    // Hash-looking tokens (six to eight hex characters carrying a digit — a pure-letter token like
    // "deadbeef" has no number in it to confuse anything with), then whatever brackets are left
    // holding nothing but punctuation.
    s = s.replace(/\b[0-9a-f]{6,8}\b/g, token => (/[0-9]/.test(token) ? " " : token))
    s = s.replace(/[\[\(][^0-9\]\)]*[\]\)]/g, " ")
    s = s.replace(/[\[\(][^0-9\]\)]*[\]\)]/g, " ")
    s = s.replace(/[\[\]\(\)]/g, " ")
    s = s.split(/\s+/).filter(Boolean).join(" ")

    // 1. Explicit episode syntax: S01E05, 1x05, 第05话.
    let num = epFirst(s, EP_SXXEXX)
    if (num > 0) return num
    num = epFirst(s, EP_NXN)
    if (num > 0) return num
    num = epFirst(s, EP_CJK)
    if (num > 0) return num

    // 2. Labelled numbers: "Episode 5", "EP24", "E05", "OVA 2", "SP 5", "#05".
    num = epFirst(s, EP_LABELLED)
    if (num > 0) return num
    num = epFirst(s, EP_HASH_NUMBER)
    if (num > 0) return num

    // 3. Ranges collapse to their first episode: "01-02" is one file holding episodes 1 and 2.
    for (let i = 0; i < 4; i++) {
        const collapsed = s.replace(EP_RANGE, "$1")
        if (collapsed === s) break
        s = collapsed
    }

    // 4. The number after a dash — the usual "Title - 05" shape. The last one wins: a title's own
    // numbers ("86", "The 100") sit to its left. A bare resolution is allowed here, because after a
    // dash it is vouched for by position.
    num = epLast(s, EP_AFTER_DASH)
    if (num > 0) return num

    // 5. A trailing number — "Show 03", "Show 12 END", "Show 05v2".
    num = epLast(s, EP_TRAILING, epResolutionLike)
    if (num > 0) return num

    // 6. Any standalone number left, the last one.
    num = epLast(s, EP_STANDALONE, epResolutionLike)
    return num > 0 ? num : null
}
