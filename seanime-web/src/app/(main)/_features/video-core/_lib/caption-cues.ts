/** Quick edit captions: reading cues from ASS/SSA/SRT/VTT files. Pure, so it is unit tested. */

export type CaptionCue = { start: number, end: number, raw: string }

const MEDIASTREAM_SUBS_RE = /\/api\/v1\/mediastream\/subs\/([^/]+)\/(\d+)\.(ass|ssa|srt|vtt)(?:\?|$)/

/** Which mediastream client and track a subtitle address belongs to, or null for any other track. */
export function parseEditableTrack(src: string | null | undefined): { clientId: string, trackIndex: number, ext: string } | null {
    const m = src?.match(MEDIASTREAM_SUBS_RE)
    if (!m) return null
    return { clientId: decodeURIComponent(m[1]), trackIndex: Number(m[2]), ext: m[3] }
}

function assTime(s: string): number {
    const [h, m, sec] = s.trim().split(":")
    return Number(h) * 3600 + Number(m) * 60 + Number(sec)
}

function srtTime(s: string): number {
    const parts = s.trim().replace(",", ".").split(":")
    if (parts.length === 2) parts.unshift("0")
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
}

/** The cues of an ASS/SSA/SRT/VTT file, with their raw text as the file has it. */
export function parseCaptionCues(content: string, ext: string): CaptionCue[] {
    const lines = content.split(/\r?\n/)
    const cues: CaptionCue[] = []
    if (ext === "ass" || ext === "ssa") {
        let fields = ["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"]
        let inEvents = false
        for (const line of lines) {
            const t = line.trim()
            if (t.startsWith("[")) {
                inEvents = t.toLowerCase() === "[events]"
                continue
            }
            if (!inEvents) continue
            if (t.startsWith("Format:")) {
                fields = t.slice(7).split(",").map(f => f.trim().toLowerCase())
                continue
            }
            if (!line.startsWith("Dialogue:")) continue
            const body = line.slice("Dialogue:".length)
            const parts: string[] = []
            let rest = body
            for (let i = 0; i < fields.length - 1; i++) {
                const at = rest.indexOf(",")
                if (at < 0) break
                parts.push(rest.slice(0, at))
                rest = rest.slice(at + 1)
            }
            parts.push(rest)
            if (parts.length !== fields.length) continue
            const get = (f: string) => parts[fields.indexOf(f)]
            cues.push({ start: assTime(get("start")), end: assTime(get("end")), raw: get("text") })
        }
        return cues
    }
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes("-->")) continue
        const [a, b] = lines[i].split("-->")
        const end = b.trim().split(/\s+/)[0]
        let j = i + 1
        const text: string[] = []
        while (j < lines.length && lines[j].trim() !== "") text.push(lines[j++])
        cues.push({ start: srtTime(a), end: srtTime(end), raw: text.join("\n") })
        i = j
    }
    return cues
}

/** What a cue reads as on screen, for editing. */
export function captionPlainText(raw: string, ext: string): string {
    if (ext === "ass" || ext === "ssa") {
        return raw.replace(/\{[^}]*\}/g, "").replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ")
    }
    return raw.replace(/<[^>]+>/g, "")
}

/** The raw text to save for edited wording: an ASS line keeps its leading style tags. */
export function captionRawText(original: string, plain: string, ext: string): string {
    if (ext === "ass" || ext === "ssa") {
        const lead = original.match(/^(\{[^}]*\})+/)?.[0] ?? ""
        return lead + plain.replace(/\r?\n/g, "\\N")
    }
    return plain
}

export function hasInnerStyling(raw: string, ext: string) {
    if (ext === "ass" || ext === "ssa") return /\{[^}]*\}/.test(raw.replace(/^(\{[^}]*\})+/, ""))
    return /<[^>]+>/.test(raw)
}

